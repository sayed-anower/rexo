import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOpExForUsers } from '../src/lib/storage';

/*
 * Unit tests for the OpEx / ROI financial model used by the OpEx Calculator.
 *
 * The expected numbers are cross-referenced against the static table in
 * README §6 so the interactive calculator and the docs can never drift apart.
 *
 * Run with: npm test
 */
test('OpEx model at 0 users returns zero cost and MRR', () => {
  const m = calculateOpExForUsers(0);
  assert.strictEqual(m.user_count, 0);
  assert.strictEqual(m.invoices_tracked, 0);
  assert.strictEqual(m.emails_sent, 0);
  assert.strictEqual(m.whatsapp_messages_sent, 0);
  assert.strictEqual(m.gross_mrr, 0);
  assert.strictEqual(m.total_opex, 0);
  assert.strictEqual(m.net_profit, 0);
  assert.strictEqual(m.margin_percentage, 0);
});

test('OpEx model at 100 users matches the README §6 row', () => {
  const m = calculateOpExForUsers(100);
  assert.strictEqual(m.user_count, 100);
  assert.strictEqual(m.invoices_tracked, 2500);
  assert.strictEqual(m.emails_sent, 6000);
  assert.strictEqual(m.whatsapp_messages_sent, 2000);

  // 6,000 emails fit inside the 50k Resend baseline → flat $20.
  assert.strictEqual(m.resend_cost, 20);
  // 2,000 msgs × $0.015 = $30, but the $35 gateway floor wins.
  assert.strictEqual(m.whapi_cost, 35);
  assert.strictEqual(m.qstash_cost, 15);
  assert.strictEqual(m.supabase_cost, 25);
  // 5% × $5,900 MRR + 100 × $0.50 = $345.
  assert.strictEqual(m.lemon_squeezy_fees, 345);

  assert.strictEqual(m.total_opex, 440);
  assert.strictEqual(m.gross_mrr, 5900);
  assert.strictEqual(m.net_profit, 5460);
  assert.strictEqual(m.margin_percentage, 92.5);
});

test('OpEx model at 10 users matches the README §6 row', () => {
  const m = calculateOpExForUsers(10);
  assert.strictEqual(m.total_opex, 130);
  assert.strictEqual(m.gross_mrr, 590);
  assert.strictEqual(m.net_profit, 461); // rounding quirk: net uses unrounded OpEx
  assert.strictEqual(m.margin_percentage, 78.1);
});

test('OpEx model at 1,000 users crosses the overage tiers', () => {
  const m = calculateOpExForUsers(1000);
  assert.strictEqual(m.invoices_tracked, 25000);
  assert.strictEqual(m.emails_sent, 60000);
  assert.strictEqual(m.whatsapp_messages_sent, 20000);

  // 60k emails → $20 base + 10 × $1 overage = $30.
  assert.strictEqual(m.resend_cost, 30);
  // 20k msgs × $0.015 = $300 (> $35 floor).
  assert.strictEqual(m.whapi_cost, 300);
  assert.strictEqual(m.qstash_cost, 50);
  // > 250 agencies → $75 Supabase tier.
  assert.strictEqual(m.supabase_cost, 75);

  // Cross-check against the README §6 1,000-user row.
  assert.strictEqual(m.total_opex, 3905);
  assert.strictEqual(m.gross_mrr, 59000);
  assert.strictEqual(m.net_profit, 55095);
  assert.strictEqual(m.margin_percentage, 93.4);
});

test('OpEx model at 250 users sits at the Supabase price cliff', () => {
  const m = calculateOpExForUsers(250);
  assert.strictEqual(m.supabase_cost, 25); // ≤ 250 agencies → $25
  assert.strictEqual(m.whapi_cost, 75); // 5,000 msgs × $0.015 = $75
  assert.strictEqual(m.qstash_cost, 15); // 6,250 jobs ≤ 10,000 → $15
  assert.strictEqual(m.lemon_squeezy_fees, 863); // 5% × $14,750 + 250 × $0.50
  assert.strictEqual(m.total_opex, 998);
  assert.strictEqual(m.net_profit, 13753);
});
