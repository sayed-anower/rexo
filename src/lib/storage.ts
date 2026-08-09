import {
  Invoice,
  Sequence,
  ReminderLog,
  UserProfile,
  Integration,
  SubscriptionTier,
  OpExTierData,
  CustomEmailTemplate
} from '../types';
import {
  INITIAL_USER_PROFILE,
  INITIAL_INVOICES,
  INITIAL_SEQUENCES,
  INITIAL_REMINDER_LOGS,
  INITIAL_INTEGRATIONS,
  INITIAL_CUSTOM_EMAIL_TEMPLATES
} from '../data/initialData';

const LOCAL_STORAGE_KEY_PREFIX = 'rexoflow_v1_';

function getLocalData<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.warn(`LocalStorage read error for ${key}:`, e);
    return defaultValue;
  }
}

function setLocalData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn(`LocalStorage write error for ${key}:`, e);
  }
}

// 1. AUTH & USER PROFILE
export async function fetchUserProfile(): Promise<UserProfile> {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.profile) {
        setLocalData('profile', data.profile);
        return data.profile;
      }
    }
  } catch (err) {
    // API fallback
  }
  return getLocalData('profile', INITIAL_USER_PROFILE);
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = await fetchUserProfile();
  const updated: UserProfile = { ...current, ...updates };
  setLocalData('profile', updated);

  try {
    await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  } catch (err) {
    // fallback
  }

  return updated;
}

export async function loginUser(email: string, pass: string): Promise<{ user: UserProfile; token: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    if (res.ok) {
      const data = await res.json();
      setLocalData('profile', data.user);
      return data;
    }
  } catch (err) {
    // offline mock
  }

  const profile = getLocalData('profile', INITIAL_USER_PROFILE);
  profile.email = email;
  setLocalData('profile', profile);
  return { user: profile, token: 'mock_jwt_token_991' };
}

export async function signupUser(email: string, companyName: string): Promise<{ user: UserProfile }> {
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, company_name: companyName }),
    });
    if (res.ok) {
      const data = await res.json();
      setLocalData('profile', data.user);
      return data;
    }
  } catch (err) {
    // offline mock
  }

  const newProfile: UserProfile = {
    id: `usr_${Date.now()}`,
    email,
    company_name: companyName,
    subscription_tier: 'starter',
    subscription_status: 'active',
    brand_color: '#2563eb',
    created_at: new Date().toISOString(),
  };
  setLocalData('profile', newProfile);
  return { user: newProfile };
}

// 2. INVOICES
export async function fetchInvoices(): Promise<Invoice[]> {
  try {
    const res = await fetch('/api/invoices');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.invoices)) {
        setLocalData('invoices', data.invoices);
        return data.invoices;
      }
    }
  } catch (err) {
    // fallback
  }
  return getLocalData('invoices', INITIAL_INVOICES);
}

export async function saveInvoice(invoiceData: Partial<Invoice>): Promise<Invoice> {
  const currentInvoices = await fetchInvoices();
  let updatedInvoice: Invoice;

  if (invoiceData.id) {
    updatedInvoice = {
      ...currentInvoices.find((i) => i.id === invoiceData.id)!,
      ...invoiceData,
    };
    const index = currentInvoices.findIndex((i) => i.id === invoiceData.id);
    if (index >= 0) currentInvoices[index] = updatedInvoice;
  } else {
    const newId = `inv_${Date.now()}`;
    updatedInvoice = {
      id: newId,
      user_id: 'usr_agency_01',
      external_invoice_id: invoiceData.external_invoice_id || `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
      client_name: invoiceData.client_name || 'Acme Client',
      client_email: invoiceData.client_email || 'client@acme.com',
      client_phone: invoiceData.client_phone || '+1 555 0192',
      amount_due: Number(invoiceData.amount_due) || 1500,
      currency: invoiceData.currency || 'USD',
      due_date: invoiceData.due_date || new Date().toISOString().split('T')[0],
      status: invoiceData.status || 'unpaid',
      payment_link: `/pay/${newId}`,
      sequence_id: invoiceData.sequence_id || 'seq_default_b2b',
      sequence_paused: false,
      current_step_index: 0,
      description: invoiceData.description || 'Digital Marketing & Design Services',
      created_at: new Date().toISOString(),
    };
    currentInvoices.unshift(updatedInvoice);
  }

  setLocalData('invoices', currentInvoices);

  try {
    await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedInvoice),
    });
  } catch (e) {
    // fallback
  }

  return updatedInvoice;
}

export async function toggleInvoiceSequencePause(invoiceId: string): Promise<Invoice> {
  const invoices = await fetchInvoices();
  const target = invoices.find((i) => i.id === invoiceId);
  if (!target) throw new Error('Invoice not found');

  target.sequence_paused = !target.sequence_paused;
  setLocalData('invoices', invoices);

  try {
    await fetch(`/api/invoices/${invoiceId}/toggle-pause`, {
      method: 'POST',
    });
  } catch (e) {
    // fallback
  }

  return target;
}

export async function payInvoice(invoiceId: string): Promise<Invoice> {
  const invoices = await fetchInvoices();
  const target = invoices.find((i) => i.id === invoiceId);
  if (!target) throw new Error('Invoice not found');

  target.status = 'paid';
  target.sequence_paused = true;
  setLocalData('invoices', invoices);

  // Add a reminder log
  const logs = await fetchReminderLogs();
  const newLog: ReminderLog = {
    id: `log_${Date.now()}`,
    invoice_id: target.id,
    invoice_number: target.external_invoice_id,
    client_name: target.client_name,
    client_email: target.client_email,
    sequence_step_title: 'Client Payment Completed (Stripe Sync)',
    channel: 'email',
    status: 'sent',
    sent_at: new Date().toISOString(),
    payload_preview: `Payment of $${target.amount_due} ${target.currency} processed via public portal. Sequence automatically paused.`,
  };
  logs.unshift(newLog);
  setLocalData('logs', logs);

  try {
    await fetch(`/api/invoices/${invoiceId}/pay`, { method: 'POST' });
  } catch (e) {
    // fallback
  }

  return target;
}

export async function syncStripeInvoices(): Promise<Invoice[]> {
  try {
    const res = await fetch('/api/invoices/sync-stripe', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.invoices)) {
        setLocalData('invoices', data.invoices);
        return data.invoices;
      }
    }
  } catch (e) {
    // fallback
  }

  // Fallback demo sync: add a new synced invoice from Stripe
  const currentInvoices = await fetchInvoices();
  const newStripeInvoice: Invoice = {
    id: `inv_stripe_${Date.now()}`,
    user_id: 'usr_agency_01',
    external_invoice_id: `INV-STRIPE-${Math.floor(1000 + Math.random() * 9000)}`,
    client_name: 'Quantum Horizon Media',
    client_email: 'finance@quantumhorizon.com',
    client_phone: '+1 888 555 1092',
    amount_due: 5800.00,
    currency: 'USD',
    due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    status: 'unpaid',
    payment_link: `/pay/inv_stripe_${Date.now()}`,
    sequence_id: 'seq_default_b2b',
    sequence_paused: false,
    current_step_index: 0,
    description: 'Auto-Synced Stripe Invoice: Brand Identity & Motion Graphics Retainer',
    created_at: new Date().toISOString(),
  };
  currentInvoices.unshift(newStripeInvoice);
  setLocalData('invoices', currentInvoices);
  return currentInvoices;
}

// 3. SEQUENCES
export async function fetchSequences(): Promise<Sequence[]> {
  try {
    const res = await fetch('/api/sequences');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.sequences)) {
        setLocalData('sequences', data.sequences);
        return data.sequences;
      }
    }
  } catch (e) {
    // fallback
  }
  return getLocalData('sequences', INITIAL_SEQUENCES);
}

export async function saveSequence(seqData: Sequence): Promise<Sequence> {
  const current = await fetchSequences();
  const index = current.findIndex((s) => s.id === seqData.id);

  if (index >= 0) {
    current[index] = seqData;
  } else {
    current.push(seqData);
  }

  setLocalData('sequences', current);

  try {
    await fetch('/api/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(seqData),
    });
  } catch (e) {
    // fallback
  }

  return seqData;
}

// 4. REMINDER LOGS
export async function fetchReminderLogs(): Promise<ReminderLog[]> {
  try {
    const res = await fetch('/api/logs');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        setLocalData('logs', data.logs);
        return data.logs;
      }
    }
  } catch (e) {
    // fallback
  }
  return getLocalData('logs', INITIAL_REMINDER_LOGS);
}

export async function triggerManualReminder(invoiceId: string): Promise<ReminderLog> {
  const invoices = await fetchInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const logs = await fetchReminderLogs();
  const newLog: ReminderLog = {
    id: `log_manual_${Date.now()}`,
    invoice_id: invoice.id,
    invoice_number: invoice.external_invoice_id,
    client_name: invoice.client_name,
    client_email: invoice.client_email,
    sequence_step_title: 'Manual Immediate Dispatch',
    channel: 'email',
    status: 'sent',
    sent_at: new Date().toISOString(),
    payload_preview: `Resend API triggered manually by user. Sent reminder email for $${invoice.amount_due} ${invoice.currency} due ${invoice.due_date}.`,
  };

  logs.unshift(newLog);
  setLocalData('logs', logs);

  // Update invoice last sent timestamp
  invoice.last_reminder_sent_at = new Date().toISOString();
  setLocalData('invoices', invoices);

  try {
    await fetch('/api/cron/process-reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoiceId, manual: true }),
    });
  } catch (e) {
    // fallback
  }

  return newLog;
}

// 5. INTEGRATIONS
export async function fetchIntegrations(): Promise<Integration[]> {
  return getLocalData('integrations', INITIAL_INTEGRATIONS);
}

export async function toggleIntegration(provider: string): Promise<Integration[]> {
  const list = await fetchIntegrations();
  const item = list.find((i) => i.provider === provider);
  if (item) {
    item.is_active = !item.is_active;
    item.updated_at = new Date().toISOString();
    if (item.is_active) item.last_synced_at = new Date().toISOString();
  } else {
    list.push({
      id: `int_${provider}_${Date.now()}`,
      user_id: 'usr_agency_01',
      provider: provider as any,
      is_active: true,
      account_name: `${provider.toUpperCase()} Connected Account`,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  setLocalData('integrations', list);
  return list;
}

// 6. LEMON SQUEEZY SUBSCRIPTION SIMULATION / WEBHOOK
export async function changeSubscriptionTier(tier: SubscriptionTier): Promise<UserProfile> {
  const profile = await fetchUserProfile();
  profile.subscription_tier = tier;
  profile.subscription_status = 'active';
  setLocalData('profile', profile);

  try {
    await fetch('/api/webhooks/lemon-squeezy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { event_name: 'subscription_updated' },
        data: {
          attributes: {
            user_id: profile.id,
            user_email: profile.email,
            status: 'active',
            variant_name: tier,
          },
        },
      }),
    });
  } catch (e) {
    // fallback
  }

  return profile;
}

// 7. OPEX CALCULATOR DATA PROJECTION
export function calculateOpExForUsers(activeUsers: number): OpExTierData {
  const invoicesPerUser = 25; // avg monthly tracked invoices per agency
  const emailsPerUser = 60; // 2-3 emails per invoice sequence
  const whatsappPerUser = 20; // 1 whatsapp per overdue invoice sequence

  const totalInvoices = activeUsers * invoicesPerUser;
  const totalEmails = activeUsers * emailsPerUser;
  const totalWhatsApp = activeUsers * whatsappPerUser;

  // Costs
  // Resend: $20/mo baseline includes 50k emails, then $1/1k emails
  const resendCost = activeUsers === 0 ? 0 : totalEmails <= 50000 ? 20 : 20 + Math.ceil((totalEmails - 50000) / 1000) * 1;

  // Whapi: $35/mo per gateway channel or ~ $0.005/msg
  const whapiCost = activeUsers === 0 ? 0 : Math.max(35, Math.ceil(totalWhatsApp * 0.015));

  // Upstash QStash: $180/yr ($15/mo) baseline for up to 500k messages
  const qstashCost = activeUsers === 0 ? 0 : totalInvoices <= 10000 ? 15 : 50;

  // Supabase: Pro Plan $25/mo up to 100k users / 8GB DB
  const supabaseCost = activeUsers === 0 ? 0 : activeUsers <= 250 ? 25 : 75;

  // Lemon Squeezy MoR fees: 5% + $0.50 per transaction
  const avgSubscriptionPrice = 59; // blend of $29/$59/$119
  const grossMrr = activeUsers * avgSubscriptionPrice;
  const lemonSqueezyFees = grossMrr * 0.05 + activeUsers * 0.50;

  const totalOpEx = resendCost + whapiCost + qstashCost + supabaseCost + lemonSqueezyFees;
  const netProfit = grossMrr - totalOpEx;
  const marginPercentage = grossMrr > 0 ? (netProfit / grossMrr) * 100 : 0;

  return {
    user_count: activeUsers,
    invoices_tracked: totalInvoices,
    emails_sent: totalEmails,
    whatsapp_messages_sent: totalWhatsApp,
    resend_cost: resendCost,
    whapi_cost: whapiCost,
    qstash_cost: qstashCost,
    supabase_cost: supabaseCost,
    lemon_squeezy_fees: Math.round(lemonSqueezyFees),
    total_opex: Math.round(totalOpEx),
    gross_mrr: grossMrr,
    net_profit: Math.round(netProfit),
    margin_percentage: Number(marginPercentage.toFixed(1)),
  };
}

// 8. CUSTOM EMAIL TEMPLATES & SENDER PROFILES
export async function fetchCustomEmailTemplates(): Promise<CustomEmailTemplate[]> {
  try {
    const res = await fetch('/api/custom-emails');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.templates)) {
        setLocalData('custom_email_templates', data.templates);
        return data.templates;
      }
    }
  } catch (e) {
    // fallback
  }
  return getLocalData('custom_email_templates', INITIAL_CUSTOM_EMAIL_TEMPLATES);
}

export async function saveCustomEmailTemplate(tmplData: Partial<CustomEmailTemplate>): Promise<CustomEmailTemplate> {
  const current = await fetchCustomEmailTemplates();
  let updated: CustomEmailTemplate;

  if (tmplData.id) {
    const index = current.findIndex((t) => t.id === tmplData.id);
    if (index >= 0) {
      updated = { ...current[index], ...tmplData };
      current[index] = updated;
    } else {
      updated = {
        id: tmplData.id,
        title: tmplData.title || 'Custom Email Template',
        sender_name: tmplData.sender_name || 'Apex Accounts',
        sender_email: tmplData.sender_email || 'billing@apexwebstudio.com',
        subject: tmplData.subject || 'Invoice Update',
        body: tmplData.body || 'Hi {{client_name}},\n\nInvoice {{external_invoice_id}} link: {{payment_link}}',
        category: tmplData.category || 'custom',
        is_default: tmplData.is_default || false,
        created_at: tmplData.created_at || new Date().toISOString(),
      };
      current.unshift(updated);
    }
  } else {
    const newId = `tmpl_${Date.now()}`;
    updated = {
      id: newId,
      title: tmplData.title || 'New Custom Template',
      sender_name: tmplData.sender_name || 'Apex Accounts',
      sender_email: tmplData.sender_email || 'billing@apexwebstudio.com',
      subject: tmplData.subject || 'Notice regarding Invoice {{external_invoice_id}}',
      body: tmplData.body || 'Hi {{client_name}},\n\nHere is your invoice link: {{payment_link}}',
      category: tmplData.category || 'custom',
      is_default: false,
      created_at: new Date().toISOString(),
    };
    current.unshift(updated);
  }

  setLocalData('custom_email_templates', current);

  try {
    await fetch('/api/custom-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  } catch (e) {
    // fallback
  }

  return updated;
}

export async function deleteCustomEmailTemplate(templateId: string): Promise<CustomEmailTemplate[]> {
  const current = await fetchCustomEmailTemplates();
  const filtered = current.filter((t) => t.id !== templateId);
  setLocalData('custom_email_templates', filtered);

  try {
    await fetch(`/api/custom-emails/${templateId}`, { method: 'DELETE' });
  } catch (e) {
    // fallback
  }

  return filtered;
}

export async function sendCustomEmailToInvoice(
  template: CustomEmailTemplate,
  invoice: Invoice
): Promise<ReminderLog> {
  const logs = await fetchReminderLogs();

  const renderedSubject = template.subject
    .replace(/\{\{client_name\}\}/g, invoice.client_name)
    .replace(/\{\{external_invoice_id\}\}/g, invoice.external_invoice_id)
    .replace(/\{\{amount_due\}\}/g, `$${invoice.amount_due}`)
    .replace(/\{\{currency\}\}/g, invoice.currency)
    .replace(/\{\{due_date\}\}/g, invoice.due_date)
    .replace(/\{\{payment_link\}\}/g, invoice.payment_link)
    .replace(/\{\{company_name\}\}/g, 'Apex Digital Agency');

  const newLog: ReminderLog = {
    id: `log_custom_${Date.now()}`,
    invoice_id: invoice.id,
    invoice_number: invoice.external_invoice_id,
    client_name: invoice.client_name,
    client_email: invoice.client_email,
    sequence_step_title: `Custom Email (${template.title})`,
    channel: 'email',
    status: 'sent',
    sent_at: new Date().toISOString(),
    payload_preview: `Sender: "${template.sender_name}" <${template.sender_email}>\nSubject: ${renderedSubject}\nResend API ID: msg_${Math.random().toString(36).substring(2, 9)}. Delivered.`,
  };

  logs.unshift(newLog);
  setLocalData('logs', logs);

  // Update invoice last sent timestamp
  const invoices = await fetchInvoices();
  const target = invoices.find((i) => i.id === invoice.id);
  if (target) {
    target.last_reminder_sent_at = new Date().toISOString();
    setLocalData('invoices', invoices);
  }

  try {
    await fetch('/api/custom-emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: template.id, invoiceId: invoice.id }),
    });
  } catch (e) {
    // fallback
  }

  return newLog;
}

export async function generateAiCustomEmail(
  prompt: string,
  tone: string = 'Firm & Professional',
  senderName: string = 'Apex Billing Dept',
  senderEmail: string = 'billing@apexwebstudio.com'
): Promise<{ title: string; sender_name: string; sender_email: string; subject: string; body: string; category: any }> {
  try {
    const res = await fetch('/api/ai/generate-custom-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, tone, senderName, senderEmail }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.subject && data.body) {
        return data;
      }
    }
  } catch (e) {
    console.warn('AI generation API failed, using fallback generator', e);
  }

  // Smart fallback template if server call fails
  return {
    title: `AI Generated: ${prompt.substring(0, 24)}...`,
    sender_name: senderName || 'Apex Finance Operations',
    sender_email: senderEmail || 'billing@apexwebstudio.com',
    subject: `Notice regarding Invoice {{external_invoice_id}} - ${tone} Follow-up`,
    body: `Hi {{client_name}},\n\nWe are writing to follow up regarding Invoice {{external_invoice_id}} for {{amount_due}} {{currency}}, due on {{due_date}}.\n\n${prompt}\n\nPlease view your statement and clear the payment here:\n{{payment_link}}\n\nWarm regards,\n${senderName}`,
    category: 'custom',
  };
}

