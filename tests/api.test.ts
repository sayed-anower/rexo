import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { app } from '../server';

/*
 * Integration tests for the Express API. The server is imported (not spawned
 * as a child process) thanks to the `isMain` guard in server.ts, then started
 * on an ephemeral port so no port conflicts occur.
 *
 * Run with: npm test
 */
let server: Server;
let baseUrl: string;

before(async () => {
  // Keep tests hermetic and side-effect-free: clear real provider keys so the
  // server uses its in-memory/mock code paths instead of making live network
  // calls to Resend / Whapi / QStash. The server reads these at request time.
  process.env.RESEND_API_KEY = '';
  process.env.WHAPI_API_TOKEN = '';
  process.env.QSTASH_TOKEN = '';
  process.env.STRIPE_SECRET_KEY = '';

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function request(method: string, pathname: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test('GET /api/health reports an ok status', async () => {
  const { status, json } = await request('GET', '/api/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.status, 'ok');
  assert.strictEqual(json.service, 'RecoverFlow Engine');
  assert.strictEqual(typeof json.env.resendConfigured, 'boolean');
});

test('GET /api/invoices lists seed invoices', async () => {
  const { status, json } = await request('GET', '/api/invoices');
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(json.invoices));
  assert.ok(json.invoices.length > 0);
  assert.ok(json.invoices[0].external_invoice_id);
});

test('POST /api/auth/signup creates a starter account', async () => {
  const { status, json } = await request('POST', '/api/auth/signup', {
    email: 'agency@example.com',
    company_name: 'Test Agency',
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.user.email, 'agency@example.com');
  assert.strictEqual(json.user.company_name, 'Test Agency');
  assert.strictEqual(json.user.subscription_tier, 'starter');
});

test('POST /api/invoices/:id/pay marks an invoice paid', async () => {
  const invs = await request('GET', '/api/invoices');
  const target = invs.json.invoices[0];
  const { status, json } = await request('POST', `/api/invoices/${target.id}/pay`);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.invoice.status, 'paid');
  assert.strictEqual(json.invoice.sequence_paused, true);
});

test('POST /api/webhooks/lemon-squeezy applies a subscription tier', async () => {
  const { status, json } = await request('POST', '/api/webhooks/lemon-squeezy', {
    meta: { event_name: 'subscription_updated' },
    data: { attributes: { variant_name: 'agency' } },
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.current_tier, 'agency');
});

test('POST /api/cron/process-reminders returns a processed_count', async () => {
  const { status, json } = await request('POST', '/api/cron/process-reminders');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.success, true);
  assert.ok(Number.isInteger(json.processed_count));
});

test('POST /api/payments/create-payment-intent returns a fee-passthrough total', async () => {
  const invs = await request('GET', '/api/invoices');
  const target = invs.json.invoices[0];
  const { status, json } = await request('POST', '/api/payments/create-payment-intent', {
    invoice_id: target.id,
  });
  assert.strictEqual(status, 200);
  assert.ok(json.client_secret);
  assert.ok(json.amount > target.amount_due); // fee added on top
  assert.ok(json.fee > 0);
  assert.strictEqual(json.provider, 'mock');
});

test('POST /api/payments/confirm marks an invoice paid and tracks usage', async () => {
  const before = await request('GET', '/api/usage');
  const { status, json } = await request('POST', '/api/payments/confirm', {
    intent_id: 'pi_demo_test',
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.invoice.status, 'paid');
  assert.ok(json.usage.amount_recovered >= before.json.usage.amount_recovered);
});

test('POST /api/integrations/stripe/connect returns an oauth url', async () => {
  const { status, json } = await request('POST', '/api/integrations/stripe/connect');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.provider, 'stripe');
  assert.ok(json.oauth_url);
});

test('GET /api/oauth/callback connects a provider in demo mode', async () => {
  const res = await fetch(`${baseUrl}/api/oauth/callback?provider=quickbooks&code=demo_auth_code`);
  assert.strictEqual(res.status, 200);
  const { status, json } = await request('GET', '/api/integrations');
  assert.strictEqual(status, 200);
  const qb = json.integrations.find((i: any) => i.provider === 'quickbooks');
  assert.ok(qb);
  assert.strictEqual(qb.is_active, true);
});

test('GET /api/sequences lists recovery flows', async () => {
  const { status, json } = await request('GET', '/api/sequences');
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(json.sequences));
  assert.ok(json.sequences.some((s: any) => s.is_default));
});

test('POST /api/usage accumulates counters', async () => {
  const before = await request('GET', '/api/usage');
  const { status, json } = await request('POST', '/api/usage', { emails_sent: 1 });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.usage.emails_sent, before.json.usage.emails_sent + 1);
});

test('POST /api/scheduling persists preferences', async () => {
  const { status, json } = await request('POST', '/api/scheduling', {
    frequency: 'weekly',
    time_of_day: '08:30',
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.prefs.frequency, 'weekly');
  assert.strictEqual(json.prefs.time_of_day, '08:30');
});

test('POST /api/invoices/:id/toggle-pause flips sequence_paused', async () => {
  const invs = await request('GET', '/api/invoices');
  const target = invs.json.invoices[0];
  const orig = target.sequence_paused;
  const { status, json } = await request('POST', `/api/invoices/${target.id}/toggle-pause`);
  assert.strictEqual(status, 200);
  assert.strictEqual(json.invoice.sequence_paused, !orig);
});
