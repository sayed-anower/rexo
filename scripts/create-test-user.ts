#!/usr/bin/env tsx
/**
 * Interactive test-user generator for EronFlow.
 *
 * Usage:  npm run create-test-user
 *
 * Asks for name, email, plan and creates a fully-active test user in the
 * Supabase database — exactly like a paid subscriber — plus default
 * scheduling, usage tracking and a sample email template.
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

config({ path: resolve(import.meta.dirname ?? __dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLANS = ['starter', 'pro', 'agency'] as const;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

async function main() {
  console.log('\n🔧 EronFlow — Create Test User\n');

  const name = (await ask('Company name: ')).trim() || 'Test Agency';
  const email = (await ask('Email address: ')).trim();
  if (!email) {
    console.error('Email is required.');
    process.exit(1);
  }

  console.log(`\nPlans: ${PLANS.map((p, i) => `${i + 1}) ${p}`).join('  ')}`);
  const planIdx = parseInt((await ask('Pick plan [1]: ')).trim() || '1', 10);
  const tier = PLANS[Math.min(Math.max(planIdx - 1, 0), PLANS.length - 1)];

  const phone = (await ask('Phone number [+1...]: ')).trim() || '+12025550199';
  const country = (await ask('Country code [US]: ')).trim().toUpperCase() || 'US';

  console.log(`\nCreating ${tier} user for ${name} (${email})…`);

  const userId = randomUUID();
  const now = new Date().toISOString();
  const month = now.slice(0, 7); // YYYY-MM

  // 1. Create user
  const { error: userErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email,
      password_hash: '$2a$10$placeholder_test_user_no_password',
      company_name: name,
      company_phone: phone,
      user_country: country,
      terms_accepted_at: now,
      subscription_tier: tier,
      subscription_status: 'active',
      plan_started_at: now,
      plan_period: 'monthly',
      brand_color: '#E58233',
      created_at: now,
    },
    { onConflict: 'id' }
  );
  if (userErr) {
    console.error('User insert failed:', userErr.message);
    process.exit(1);
  }
  console.log('  ✓ User created');

  // 2. Scheduling prefs
  const { error: schedErr } = await supabase.from('scheduling').upsert(
    {
      user_id: userId,
      frequency: 'daily',
      time_of_day: '09:00',
      timezone: 'America/New_York',
      auto_pause_paid: true,
    },
    { onConflict: 'user_id' }
  );
  if (schedErr) console.warn('  ⚠ Scheduling:', schedErr.message);
  else console.log('  ✓ Scheduling prefs set');

  // 3. Usage tracking
  const { error: usageErr } = await supabase.from('usage').upsert(
    {
      user_id: userId,
      month,
      emails_sent: 0,
      whatsapp_sent: 0,
      SMS_sent: 0,
      ai_generations: 0,
      reminders_delivered: 0,
      amount_recovered: 0,
    },
    { onConflict: 'user_id,month' }
  );
  if (usageErr) console.warn('  ⚠ Usage:', usageErr.message);
  else console.log('  ✓ Usage tracking initialized');

  // 4. Sample email template
  const { error: tplErr } = await supabase.from('custom_email_templates').upsert(
    {
      id: `tpl_test_${Date.now()}`,
      user_id: userId,
      title: 'Friendly Invoice Reminder',
      sender_name: `${name} Billing`,
      sender_email: `billing@${name.toLowerCase().replace(/\s+/g, '')}.com`,
      subject: 'Reminder: Invoice {{invoice_id}} Payment',
      body: `Hi {{client_name}},\n\nThis is a friendly reminder that invoice {{invoice_id}} for {{amount_due}} {{currency}} was due on {{due_date}}.\n\nPlease process payment via: {{payment_link}}\n\nBest regards,\n{{your_name}}`,
      category: 'reminder',
      is_default: true,
      channels: ['{email}'],
    },
    { onConflict: 'id' }
  );
  if (tplErr) console.warn('  ⚠ Template:', tplErr.message);
  else console.log('  ✓ Sample template created');

  console.log(`\n✅ Test user ready!`);
  console.log(`   Email:    ${email}`);
  console.log(`   Plan:     ${tier} (active)`);
  console.log(`   User ID:  ${userId}`);
  console.log(`\n   Log in at your app and start testing.\n`);

  rl.close();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
