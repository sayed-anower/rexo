import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Body parser
app.use(express.json());

// Server-side Gemini AI initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// In-Memory store fallback for server session
let inMemoryInvoices = [
  {
    id: 'inv_101',
    user_id: 'usr_agency_01',
    external_invoice_id: 'INV-2026-881',
    client_name: 'Nexus Commerce Corp',
    client_email: 'billing@nexuscommerce.com',
    client_phone: '+1 415 555 0123',
    amount_due: 4250.00,
    currency: 'USD',
    due_date: '2026-08-02',
    status: 'overdue',
    payment_link: '/pay/inv_101',
    sequence_id: 'seq_default_b2b',
    sequence_paused: false,
    current_step_index: 2,
    last_reminder_sent_at: '2026-08-05T09:15:00Z',
    description: 'Q3 E-Commerce Store Redesign & Custom Shopify App Integration',
    created_at: '2026-07-15T10:00:00Z',
  },
  {
    id: 'inv_102',
    user_id: 'usr_agency_01',
    external_invoice_id: 'INV-2026-882',
    client_name: 'Vanguard Capital Partners',
    client_email: 'accounts@vanguardcap.io',
    client_phone: '+1 212 555 9988',
    amount_due: 8500.00,
    currency: 'USD',
    due_date: '2026-08-05',
    status: 'overdue',
    payment_link: '/pay/inv_102',
    sequence_id: 'seq_default_b2b',
    sequence_paused: false,
    current_step_index: 2,
    last_reminder_sent_at: '2026-08-08T09:00:00Z',
    description: 'Corporate Brand Guidelines, UI System & Webflow Development',
    created_at: '2026-07-20T11:30:00Z',
  },
];

let inMemoryLogs = [
  {
    id: 'log_301',
    invoice_id: 'inv_101',
    invoice_number: 'INV-2026-881',
    client_name: 'Nexus Commerce Corp',
    client_email: 'billing@nexuscommerce.com',
    sequence_step_title: 'Friendly Past Due Notice (3 Days)',
    channel: 'email',
    status: 'sent',
    sent_at: '2026-08-05T09:15:00Z',
    payload_preview: 'Resend API ID: msg_881a293. Sent via reminders.apexwebstudio.com to billing@nexuscommerce.com.',
  },
];

let currentUserProfile = {
  id: 'usr_agency_01',
  email: 'alex@apexwebstudio.com',
  company_name: 'Apex Digital Agency',
  lemon_squeezy_customer_id: 'ls_cust_99218',
  lemon_squeezy_subscription_id: 'ls_sub_881723',
  subscription_tier: 'pro',
  subscription_status: 'active',
  created_at: '2026-01-15T08:00:00Z',
};

// ==========================================
// 1. HEALTHCHECK & METRICS API
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RexoFlow Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: {
      supabaseConfigured: Boolean(process.env.SUPABASE_URL),
      lemonSqueezyConfigured: Boolean(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET),
      qstashConfigured: Boolean(process.env.QSTASH_TOKEN),
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
      whapiConfigured: Boolean(process.env.WHAPI_API_TOKEN),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    },
  });
});

// ==========================================
// 2. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  currentUserProfile.email = email;
  res.json({
    message: 'Login successful',
    token: `jwt_token_${Date.now()}`,
    user: currentUserProfile,
  });
});

app.post('/api/auth/signup', (req, res) => {
  const { email, company_name } = req.body;
  if (!email || !company_name) {
    return res.status(400).json({ error: 'Email and company name are required' });
  }

  currentUserProfile = {
    ...currentUserProfile,
    id: `usr_${Date.now()}`,
    email,
    company_name,
    subscription_tier: 'starter',
    subscription_status: 'active',
  };

  res.json({ message: 'Account created successfully', user: currentUserProfile });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ profile: currentUserProfile });
});

app.put('/api/auth/profile', (req, res) => {
  currentUserProfile = { ...currentUserProfile, ...req.body };
  res.json({ profile: currentUserProfile });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  res.json({ message: `Password reset magic link generated and sent to ${email}` });
});

app.post('/api/auth/change-password', (req, res) => {
  res.json({ message: 'Password updated successfully' });
});

// ==========================================
// 3. INVOICES API & STRIPE SYNC
// ==========================================
app.get('/api/invoices', (req, res) => {
  res.json({ invoices: inMemoryInvoices });
});

app.post('/api/invoices', (req, res) => {
  const inv = req.body;
  const index = inMemoryInvoices.findIndex((i) => i.id === inv.id);
  if (index >= 0) {
    inMemoryInvoices[index] = { ...inMemoryInvoices[index], ...inv };
  } else {
    inMemoryInvoices.unshift({
      ...inv,
      id: inv.id || `inv_${Date.now()}`,
      created_at: new Date().toISOString(),
    });
  }
  res.json({ success: true, invoice: inv });
});

app.post('/api/invoices/:id/pay', (req, res) => {
  const { id } = req.params;
  const target = inMemoryInvoices.find((i) => i.id === id);
  if (target) {
    target.status = 'paid';
    target.sequence_paused = true;
    inMemoryLogs.unshift({
      id: `log_${Date.now()}`,
      invoice_id: target.id,
      invoice_number: target.external_invoice_id,
      client_name: target.client_name,
      client_email: target.client_email,
      sequence_step_title: 'Invoice Paid via Portal',
      channel: 'email',
      status: 'sent',
      sent_at: new Date().toISOString(),
      payload_preview: `Received $${target.amount_due} ${target.currency}. Automated sequence stopped.`,
    });
  }
  res.json({ success: true, invoice: target });
});

app.post('/api/invoices/sync-stripe', (req, res) => {
  const synced: any = {
    id: `inv_stripe_${Date.now()}`,
    user_id: currentUserProfile.id,
    external_invoice_id: `INV-STRIPE-${Math.floor(1000 + Math.random() * 9000)}`,
    client_name: 'Aether BioHealth Tech',
    client_email: 'finance@aetherbio.com',
    client_phone: '+1 650 555 4411',
    amount_due: 3200.00,
    currency: 'USD',
    due_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    status: 'unpaid',
    payment_link: `/pay/inv_stripe_${Date.now()}`,
    sequence_id: 'seq_default_b2b',
    sequence_paused: false,
    current_step_index: 0,
    description: 'Stripe Auto Sync: Monthly Web Application Retainer',
    created_at: new Date().toISOString(),
  };
  inMemoryInvoices.unshift(synced);
  res.json({ success: true, count: 1, invoices: inMemoryInvoices });
});

// ==========================================
// 4. LEMON SQUEEZY WEBHOOK HANDLER
// ==========================================
app.post('/api/webhooks/lemon-squeezy', (req, res) => {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'] as string;

  // Verify HMAC signature if secret is provided
  if (secret && signature) {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(JSON.stringify(req.body)).digest('hex'), 'utf8');
    const checksum = Buffer.from(signature, 'utf8');
    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
      return res.status(401).json({ error: 'Invalid Lemon Squeezy webhook signature' });
    }
  }

  const eventName = req.body?.meta?.event_name || req.body?.event_name;
  const attributes = req.body?.data?.attributes;

  console.log(`[Lemon Squeezy Webhook] Event: ${eventName}`, attributes);

  if (attributes?.variant_name) {
    const tier = attributes.variant_name.toLowerCase();
    if (['starter', 'pro', 'agency'].includes(tier)) {
      currentUserProfile.subscription_tier = tier as any;
      currentUserProfile.subscription_status = 'active';
    }
  }

  if (eventName === 'subscription_cancelled') {
    currentUserProfile.subscription_status = 'cancelled';
  }

  res.json({ received: true, event: eventName, current_tier: currentUserProfile.subscription_tier });
});

// ==========================================
// 5. STRIPE WEBHOOK HANDLER
// ==========================================
app.post('/api/webhooks/stripe', (req, res) => {
  const event = req.body;
  console.log(`[Stripe Webhook Received] Event Type: ${event.type}`);

  if (event.type === 'invoice.payment_succeeded') {
    const invoiceData = event.data?.object;
    const externalId = invoiceData?.id || invoiceData?.number;

    const target = inMemoryInvoices.find((i) => i.external_invoice_id === externalId || i.id === externalId);
    if (target) {
      target.status = 'paid';
      target.sequence_paused = true;
      inMemoryLogs.unshift({
        id: `log_stripe_${Date.now()}`,
        invoice_id: target.id,
        invoice_number: target.external_invoice_id,
        client_name: target.client_name,
        client_email: target.client_email,
        sequence_step_title: 'Stripe Webhook Payment Succeeded',
        channel: 'email',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload_preview: `Purged QStash scheduled reminders for Stripe Invoice ${externalId}. Status updated to paid.`,
      });
    }
  }

  res.json({ received: true });
});

// ==========================================
// 6. UPSTASH QSTASH REMINDER WORKER CRON
// ==========================================
app.post('/api/cron/process-reminders', async (req, res) => {
  console.log('[QStash Cron Triggered] Evaluating due dates & sequence steps...');

  const results = [];
  const now = new Date();

  for (const invoice of inMemoryInvoices) {
    if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.sequence_paused) {
      continue;
    }

    const dueDate = new Date(invoice.due_date);
    const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));

    // Determine channel & step
    const channel = diffDays >= 7 ? 'whatsapp' : 'email';
    const stepTitle = diffDays >= 7
      ? 'WhatsApp Escalation + Late Fee Notice'
      : diffDays > 0
      ? 'Overdue Firm Reminder Email'
      : 'Upcoming Invoice Notice';

    // Log the reminder execution
    const newLog = {
      id: `log_cron_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      invoice_id: invoice.id,
      invoice_number: invoice.external_invoice_id,
      client_name: invoice.client_name,
      client_email: invoice.client_email,
      sequence_step_title: stepTitle,
      channel: channel as any,
      status: 'sent' as any,
      sent_at: new Date().toISOString(),
      payload_preview: channel === 'whatsapp'
        ? `Whapi API payload sent to ${invoice.client_phone}. Invoice $${invoice.amount_due} overdue by ${diffDays} days.`
        : `Resend API transactional email sent to ${invoice.client_email}. Link: ${invoice.payment_link}`,
    };

    inMemoryLogs.unshift(newLog);
    invoice.last_reminder_sent_at = new Date().toISOString();
    results.push(newLog);
  }

  res.json({
    success: true,
    processed_count: results.length,
    processed_logs: results,
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// 7. GEMINI AI SEQUENCE DRAFTER
// ==========================================
app.post('/api/ai/generate-sequence', async (req, res) => {
  const { agencyName, tone, clientType, amount } = req.body;

  try {
    const ai = getGeminiClient();
    if (!ai) {
      // Fallback mock prompt generator if GEMINI_API_KEY is missing
      return res.json({
        steps: [
          {
            days_relative_to_due: -3,
            channel: 'email',
            title: 'Polite Advance Courtesy Notice',
            template_subject: `Advance Notice: Invoice from ${agencyName || 'Apex Agency'}`,
            template_body: `Hi {{client_name}},\n\nThis is a quick reminder that invoice {{external_invoice_id}} for $${amount || '2,500'} is due on {{due_date}}.\n\nPay here: {{payment_link}}`,
          },
          {
            days_relative_to_due: 3,
            channel: 'email',
            title: 'Firm Follow-Up Notice',
            template_subject: `Overdue: Invoice {{external_invoice_id}} requires attention`,
            template_body: `Hi {{client_name}},\n\nWe haven't received payment for invoice {{external_invoice_id}} due on {{due_date}}.\n\nPlease complete payment today: {{payment_link}}`,
          },
          {
            days_relative_to_due: 7,
            channel: 'whatsapp',
            title: 'Urgent WhatsApp Message',
            template_body: `Hello {{client_name}}, invoice {{external_invoice_id}} is 7 days past due. Please complete payment now to keep project services active: {{payment_link}}`,
          },
        ],
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `You are an expert B2B Payment Recovery Copywriter for digital agencies. Generate a JSON 3-step sequence for:
Agency: ${agencyName || 'Digital Agency'}
Tone: ${tone || 'firm and professional'}
Client Type: ${clientType || 'Enterprise client'}
Amount: $${amount || '5000'}

Return strictly valid JSON with this schema:
[
  {
    "days_relative_to_due": -3,
    "channel": "email",
    "title": "Advance Courtesy Notice",
    "template_subject": "subject...",
    "template_body": "body..."
  },
  {
    "days_relative_to_due": 3,
    "channel": "email",
    "title": "Firm Overdue Notice",
    "template_subject": "subject...",
    "template_body": "body..."
  },
  {
    "days_relative_to_due": 7,
    "channel": "whatsapp",
    "title": "Urgent WhatsApp Message",
    "template_body": "body..."
  }
]`,
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const steps = JSON.parse(cleanJson);
    return res.json({ steps });
  } catch (err: any) {
    console.error('Gemini AI sequence generation error:', err);
    res.status(500).json({ error: 'Failed to generate AI sequence', details: err.message });
  }
});

// In-memory custom email templates store
let inMemoryCustomEmailTemplates = [
  {
    id: 'tmpl_01',
    title: 'Friendly Pre-Due Courtesy Email',
    sender_name: 'Apex Billing Dept',
    sender_email: 'billing@apexwebstudio.com',
    subject: 'Courtesy Reminder: Invoice {{external_invoice_id}} from {{company_name}}',
    body: 'Hi {{client_name}},\n\nThis is a friendly courtesy note regarding Invoice {{external_invoice_id}} for {{amount_due}} {{currency}}, which is due on {{due_date}}.\n\nTo view and clear this payment via our instant secure portal, click below:\n{{payment_link}}\n\nWe appreciate your continued partnership!\nBest regards,\n{{company_name}} Billing Team',
    category: 'friendly_reminder',
    is_default: true,
    created_at: '2026-01-15T08:00:00Z',
  },
  {
    id: 'tmpl_02',
    title: '7-Day Overdue Payment Notice',
    sender_name: 'Apex Accounts Receivable',
    sender_email: 'accounts@apexwebstudio.com',
    subject: 'PAST DUE (7 Days): Invoice {{external_invoice_id}} - Immediate Attention Required',
    body: 'Dear {{client_name}},\n\nOur records indicate that Invoice {{external_invoice_id}} ({{amount_due}} {{currency}}) due on {{due_date}} is now 7 days past due.\n\nPlease complete payment today to avoid service interruptions or late fee assessment:\n{{payment_link}}\n\nIf you have already processed payment, please reply with your wire transfer confirmation.\n\nThank you,\nAccounts Receivable Team',
    category: 'overdue_notice',
    is_default: true,
    created_at: '2026-01-18T09:00:00Z',
  },
  {
    id: 'tmpl_03',
    title: 'Final Legal & Late Fee Escalation',
    sender_name: 'Apex Collections & Legal',
    sender_email: 'collections@apexwebstudio.com',
    subject: 'URGENT: Final Notice & Pending Account Hold - Invoice {{external_invoice_id}}',
    body: 'ATTN: {{client_name}} Finance Department,\n\nInvoice {{external_invoice_id}} for {{amount_due}} {{currency}} is severely past due.\n\nPlease be advised that failure to settle this account within 48 hours will result in automatic project pause, late fee additions, and escalation to our legal recovery partner.\n\nPay immediately here:\n{{payment_link}}\n\nSincerely,\nCollections Dept, {{company_name}}',
    category: 'urgent_escalation',
    is_default: true,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'tmpl_04',
    title: 'Post-Payment Confirmation & Thank You',
    sender_name: 'Apex Finance Receipts',
    sender_email: 'receipts@apexwebstudio.com',
    subject: 'Payment Received: Thank You for Invoice {{external_invoice_id}}',
    body: 'Hi {{client_name}},\n\nWe have successfully received your payment of {{amount_due}} {{currency}} for Invoice {{external_invoice_id}}.\n\nThank you for your prompt payment and for choosing {{company_name}}!\n\nWarm regards,\nFinance Operations',
    category: 'receipt',
    is_default: true,
    created_at: '2026-01-22T11:00:00Z',
  },
  {
    id: 'tmpl_05',
    title: 'Founder Direct Executive Appeal',
    sender_name: 'Alex Vance (Managing Director)',
    sender_email: 'alex@apexwebstudio.com',
    subject: 'Personal Note regarding Invoice {{external_invoice_id}}',
    body: 'Hi {{client_name}},\n\nI am reaching out personally regarding Invoice {{external_invoice_id}} for {{amount_due}} {{currency}}.\n\nAs a boutique digital agency, timely cash flow is critical to keeping our engineering & design resources dedicated to your account. Could you please check with your accounts payable team to see when this payment can be disbursed?\n\nDirect payment portal: {{payment_link}}\n\nThanks,\nAlex Vance | Managing Director',
    category: 'custom',
    is_default: true,
    created_at: '2026-02-01T08:00:00Z',
  },
];

app.get('/api/custom-emails', (req, res) => {
  res.json({ templates: inMemoryCustomEmailTemplates });
});

app.post('/api/custom-emails', (req, res) => {
  const tmpl = req.body;
  const index = inMemoryCustomEmailTemplates.findIndex((t) => t.id === tmpl.id);
  if (index >= 0) {
    inMemoryCustomEmailTemplates[index] = { ...inMemoryCustomEmailTemplates[index], ...tmpl };
  } else {
    inMemoryCustomEmailTemplates.unshift({
      ...tmpl,
      id: tmpl.id || `tmpl_${Date.now()}`,
      created_at: new Date().toISOString(),
    });
  }
  res.json({ success: true, template: tmpl, templates: inMemoryCustomEmailTemplates });
});

app.delete('/api/custom-emails/:id', (req, res) => {
  const { id } = req.params;
  inMemoryCustomEmailTemplates = inMemoryCustomEmailTemplates.filter((t) => t.id !== id);
  res.json({ success: true, templates: inMemoryCustomEmailTemplates });
});

app.post('/api/custom-emails/send', (req, res) => {
  const { templateId, invoiceId } = req.body;
  const tmpl = inMemoryCustomEmailTemplates.find((t) => t.id === templateId);
  const inv = inMemoryInvoices.find((i) => i.id === invoiceId);

  if (inv && tmpl) {
    inMemoryLogs.unshift({
      id: `log_custom_${Date.now()}`,
      invoice_id: inv.id,
      invoice_number: inv.external_invoice_id,
      client_name: inv.client_name,
      client_email: inv.client_email,
      sequence_step_title: `Custom Email (${tmpl.title})`,
      channel: 'email',
      status: 'sent',
      sent_at: new Date().toISOString(),
      payload_preview: `Sender: "${tmpl.sender_name}" <${tmpl.sender_email}>. Sent via Resend API to ${inv.client_email}.`,
    });
    inv.last_reminder_sent_at = new Date().toISOString();
  }

  res.json({ success: true, message: 'Custom email sent successfully' });
});

// Gemini AI Custom Email Writer Endpoint
app.post('/api/ai/generate-custom-email', async (req, res) => {
  const { prompt, tone, senderName, senderEmail } = req.body;

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        title: `AI Custom Email: ${prompt?.substring(0, 20) || 'Payment Notice'}`,
        sender_name: senderName || 'Apex Billing Dept',
        sender_email: senderEmail || 'billing@apexwebstudio.com',
        subject: `Follow-up: Invoice {{external_invoice_id}} Payment Notice`,
        body: `Hi {{client_name}},\n\nWe are writing to follow up regarding Invoice {{external_invoice_id}} for {{amount_due}} {{currency}}, due on {{due_date}}.\n\n${prompt || 'Please review your outstanding balance.'}\n\nYou can clear this payment securely via our online portal:\n{{payment_link}}\n\nThank you,\n${senderName || 'Finance Operations'}`,
        category: 'custom',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `You are an expert agency payment communications specialist. Write a custom B2B email template based on:
User Prompt: "${prompt}"
Tone: "${tone || 'Firm & Professional'}"
Sender Name: "${senderName || 'Apex Billing Dept'}"
Sender Email: "${senderEmail || 'billing@apexwebstudio.com'}"

Use available placeholder variables where appropriate: {{client_name}}, {{external_invoice_id}}, {{amount_due}}, {{currency}}, {{due_date}}, {{payment_link}}, {{company_name}}.

Return strictly valid JSON with this exact format:
{
  "title": "Short descriptive template title",
  "sender_name": "${senderName || 'Apex Billing Dept'}",
  "sender_email": "${senderEmail || 'billing@apexwebstudio.com'}",
  "subject": "Compelling subject line with {{external_invoice_id}}",
  "body": "Clear email body content using {{client_name}}, {{amount_due}}, {{due_date}}, and {{payment_link}}",
  "category": "custom"
}`,
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJson);
    return res.json(result);
  } catch (err: any) {
    console.error('Gemini AI custom email generation error:', err);
    res.status(500).json({
      error: 'Failed to generate AI custom email',
      details: err.message,
    });
  }
});


// ==========================================
// 8. LOGS API
// ==========================================
app.get('/api/logs', (req, res) => {
  res.json({ logs: inMemoryLogs });
});

// ==========================================
// 9. VITE MIDDLEWARE & PRODUCTION STATIC SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RexoFlow Engine] Server listening at http://localhost:${PORT}`);
  });
}

startServer();
