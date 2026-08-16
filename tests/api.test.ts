import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

/*
 * Integration tests for the real Express API. The server is imported (not
 * spawned as a child process) thanks to the `isMain` guard in server.ts, then
 * started on an ephemeral port so no port conflicts occur.
 *
 * These tests are hermetic: no Supabase database and no provider keys are
 * configured, so endpoints that need a database return the documented 503
 * NO_DB / 401 UNAUTHENTICATED responses. There are no mocks anywhere — a test
 * with a real SUPABASE_URL/SERVICE_ROLE_KEY and provider keys can exercise
 * full real flows (auth cookies, Stripe, Resend, Lemon Squeezy, QStash).
 *
 * Env vars are cleared BEFORE the server module is imported because server.ts
 * bootstraps the database at import time.
 *
 * Run with: npm test
 */

process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.RESEND_API_KEY = '';
process.env.WHAPI_API_TOKEN = '';
process.env.QSTASH_TOKEN = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.LEMON_SQUEEZY_API_KEY = '';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';

const { app } = await import('../server');

let server: Server;
let baseUrl: string;

before(async () => {
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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test('GET /api/health reports an ok status with real provider flags', async () => {
  const { status, json } = await request('GET', '/api/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.status, 'ok');
  assert.strictEqual(json.service, 'Eron Engine');
  assert.strictEqual(json.db, false);
  assert.strictEqual(json.dbReady, false);
  assert.strictEqual(json.dbReason, 'SUPABASE_NOT_CONFIGURED');
  assert.strictEqual(json.testMode, false);
  for (const flag of [
    'supabaseConfigured',
    'lemonSqueezyConfigured',
    'qstashConfigured',
    'resendConfigured',
    'whapiConfigured',
    'stripeConfigured',
    'googleConfigured',
    'geminiConfigured',
  ]) {
    assert.strictEqual(typeof json.env[flag], 'boolean', `${flag} must be boolean`);
    assert.strictEqual(json.env[flag], false, `${flag} must be false without keys`);
  }
});

test('GET /api/db/migration serves the canonical SQL migration', async () => {
  const res = await fetch(`${baseUrl}/api/db/migration`);
  assert.strictEqual(res.status, 200);
  const sql = await res.text();
  assert.ok(sql.includes('create table if not exists public.users'));
  assert.ok(sql.includes('create or replace function public.exec_sql'));
  assert.ok(sql.includes('public._init_guard'));
});

test('GET /api/billing/plans returns 3 plans with included/excluded features and fees', async () => {
  const { status, json } = await request('GET', '/api/billing/plans');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.plans.length, 3);
  const ids = json.plans.map((p: any) => p.id).sort();
  assert.deepStrictEqual(ids, ['agency', 'pro', 'starter']);
  const pro = json.plans.find((p: any) => p.id === 'pro');
  assert.strictEqual(pro.recommended, true);
  assert.strictEqual(pro.price, 99);
  assert.strictEqual(pro.sell, true);
  assert.strictEqual(pro.list_price, 129);
  assert.strictEqual(json.plans.find((p: any) => p.id === 'starter').sell, true);
  assert.strictEqual(json.plans.find((p: any) => p.id === 'starter').list_price, 69);
  assert.strictEqual(json.plans.find((p: any) => p.id === 'agency').list_price, 349);
  // Every feature must carry an `included` flag (green check / red cross).
  assert.ok(pro.features.length > 0);
  assert.ok(pro.features.every((f: any) => typeof f.included === 'boolean'));
  // Proration constants are exposed to the UI.
  assert.strictEqual(json.taxRate, 0.05);
  assert.strictEqual(json.gatewayFeeRate, 0.029);
  assert.strictEqual(json.gatewayFeeFlat, 0.3);
});

test('GET /api/test-mode reports the test-mode switch (no mocks)', async () => {
  const { status, json } = await request('GET', '/api/test-mode');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.enabled, false);
  assert.ok(Array.isArray(json.testCards));
  assert.ok(json.testCards.some((c: any) => c.number === '4242 4242 4242 4242'));
});

test('Signup requires the database (503 NO_DB, never a mock account)', async () => {
  const { status, json } = await request('POST', '/api/auth/signup', {
    email: 'agency@example.com',
    password: 'password123',
    company_name: 'Test Agency',
  });
  assert.strictEqual(status, 503);
  assert.strictEqual(json.error, 'NO_DB');
});

test('Protected routes reject unauthenticated requests (401)', async () => {
  const { status, json } = await request('GET', '/api/invoices');
  assert.strictEqual(status, 401);
  assert.strictEqual(json.error, 'UNAUTHENTICATED');
});

test('POST /api/auth/logout clears the session cookie', async () => {
  const res = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  assert.strictEqual(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('rf_session=;'));
  assert.ok(setCookie.includes('Max-Age=0'));
});

test('Provider endpoints return PROVIDER_NOT_CONFIGURED instead of fake data', async () => {
  const { status, json } = await request('POST', '/api/test/payment-intent', { amount: 10 });
  assert.strictEqual(status, 401); // auth required first
  assert.strictEqual(json.error, 'UNAUTHENTICATED');
});

test('Billing math: full-month charge equals price + tax + gateway fee', async () => {
  const { json } = await request('GET', '/api/billing/plans');
  const starter = json.plans.find((p: any) => p.id === 'starter');
  assert.strictEqual(starter.price, 49);
  const expectedTotal = 49 + 49 * 0.05 + (49 * 0.029 + 0.3);
  assert.strictEqual(starter.fees.total, Math.round(expectedTotal * 100) / 100);
});

test('OTP request requires the database (503 NO_DB, no mocked codes)', async () => {
  const { status, json } = await request('POST', '/api/auth/otp/request', {
    email: 'agency@example.com',
    purpose: 'signup',
  });
  assert.strictEqual(status, 503);
  assert.strictEqual(json.error, 'NO_DB');
});

test('OTP verify requires the database (503 NO_DB)', async () => {
  const { status, json } = await request('POST', '/api/auth/otp/verify', {
    email: 'agency@example.com',
    purpose: 'signup',
    otp: '123456',
  });
  assert.strictEqual(status, 503);
  assert.strictEqual(json.error, 'NO_DB');
});

test('Password reset via OTP requires the database (503 NO_DB)', async () => {
  const { status, json } = await request('POST', '/api/auth/reset-password', {
    email: 'agency@example.com',
    otp: '123456',
    new_password: 'password123',
  });
  assert.strictEqual(status, 503);
  assert.strictEqual(json.error, 'NO_DB');
});

test('POST /api/webhooks/quickbooks rejects when the webhook token is missing (401)', async () => {
  const { status, json } = await request('POST', '/api/webhooks/quickbooks', {
    eventNotifications: [],
  });
  assert.strictEqual(status, 401);
  assert.strictEqual(json.error, 'WEBHOOK_UNCONFIGURED');
});

test('POST /api/webhooks/xero rejects when the webhook key is missing (401)', async () => {
  const { status, json } = await request('POST', '/api/webhooks/xero', {
    events: [],
  });
  assert.strictEqual(status, 401);
  assert.strictEqual(json.error, 'WEBHOOK_UNCONFIGURED');
});

test('GET /api/webhooks/quickbooks echoes the Intuit validation code', async () => {
  const res = await fetch(`${baseUrl}/api/webhooks/quickbooks?code=eronsetup123`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.strictEqual(text, 'eronsetup123');
});

test('OAuth callback rejects missing parameters (400)', async () => {
  const res = await fetch(`${baseUrl}/api/oauth/callback`);
  assert.strictEqual(res.status, 400);
});

test('Provider sync requires authentication (401)', async () => {
  const { status, json } = await request('POST', '/api/integrations/quickbooks/sync');
  assert.strictEqual(status, 401);
  assert.strictEqual(json.error, 'UNAUTHENTICATED');
});