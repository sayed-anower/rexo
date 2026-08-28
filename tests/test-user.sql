-- 1. Create the Test Agency User
INSERT INTO public.users (
  id,
  email,
  password_hash,
  company_name,
  company_phone,
  user_country,
  terms_accepted_at,
  subscription_tier,
  subscription_status,
  plan_started_at,
  plan_period,
  brand_color,
  created_at
) 
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Fixed test UUID
  'sayed.anower.17.2@gmail.com',
  '$2a$10$wT.46tSg4Q8kR8yRzGgBdeWj2/bQ3fB8zQYjC4C3p2tL5Vv.N1u1O',
  'Acme Agency Studio',
  '+12025550143',
  'US',
  NOW(),
  'agency',
  'active',
  NOW(),
  'monthly',
  '#E58233',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET 
  subscription_status = 'active',
  subscription_tier = 'agency';

-- 2. Create Default Automation & Scheduling Setup
INSERT INTO public.scheduling (
  user_id,
  frequency,
  time_of_day,
  timezone,
  auto_pause_paid
)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'daily',
  '09:00',
  'America/New_York',
  true
)
ON CONFLICT (user_id) DO NOTHING;

-- 3. Initialize Monthly Usage Tracking for Current Month
INSERT INTO public.usage (
  user_id,
  month,
  emails_sent,
  whatsapp_sent,
  SMS_sent,
  ai_generations,
  reminders_delivered,
  amount_recovered
)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  to_char(NOW(), 'YYYY-MM'),
  0,
  0,
  0,
  0,
  0,
  0.00
)
ON CONFLICT (user_id, month) DO NOTHING;

-- 4. Create a Default Email Template for the Test Agency
INSERT INTO public.custom_email_templates (
  id,
  user_id,
  title,
  sender_name,
  sender_email,
  subject,
  body,
  category,
  is_default,
  channels
)
VALUES (
  'tpl_test_default_01',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Friendly Invoice Reminder',
  'Acme Billing Team',
  'billing@acmeagencystudio.com',
  'Reminder: Outstanding Invoice {{invoice_id}}',
  'Hi {{client_name}}, just a quick reminder that invoice {{invoice_id}} is due.',
  'reminder',
  true,
  '{email}'
)
ON CONFLICT (id) DO NOTHING;