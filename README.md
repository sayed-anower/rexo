# Eron — Automated Payment Recovery & Invoice Reminders SaaS

Eron is a **real-API, production-ready Automated Payment Recovery & Invoice Reminders SaaS** for B2B digital agencies. It syncs open invoices from Stripe, runs multi-step escalation sequences across Email (Resend) and WhatsApp (Whapi.cloud), and collects payments on a branded public portal via real Stripe / Lemon Squeezy rails. **There is no demo mode, no mock data and no free tier** — every account, invoice, reminder and payment flows through real providers and a real PostgreSQL database.

---

## 1. Feature Checklist (what was asked → what is implemented)

| Requirement | Status |
| --- | --- |
| Orange theme (index.css variables) + orange footer | ✅ `src/index.css` defines the full orange palette (`--color-primary #E58233`, accent `#F97316`…) consumed by every Tailwind utility; `Footer.tsx` uses an orange gradient |
| No demo logins / demo dashboards / demo planning | ✅ All demo seed data removed (`INITIAL_INVOICES`, `PRICING_PLANS`, `INITIAL_USER_PROFILE`, etc. deleted). Only product defaults that get seeded into **your real DB** on signup remain (sequences + email templates) |
| Real APIs + real DB data | ✅ Everything reads/writes Supabase (PostgreSQL). Emails go through the real Resend API, WhatsApp through Whapi.cloud, AI drafts through Gemini, payments through Stripe / Lemon Squeezy, cron through QStash |
| Secure login/signup cookies with expiry | ✅ HttpOnly `rf_session` cookie, HMAC-signed, 30-day expiry, `Secure` in production (see §4) |
| No free tier; account free, action requires a plan | ✅ New accounts are `pending`; every action endpoint enforces `assertPlanActive()` → 402 `PLAN_REQUIRED` |
| pushState-based navigation | ✅ `navigate()` in `src/App.tsx` uses `window.history.pushState` + popstate/rf:route sync (the only full page loads are real provider redirects: Google OAuth, Stripe/LS checkout, payment links) |
| Cancel / change plan anytime; prorated mid-month; limits apply immediately | ✅ `POST /api/billing/prorate` previews the prorated delta; checkout applies the change; webhook applies tier instantly; limits enforced server-side per action |
| Plan data in ONE file; ticks AND crosses in plan views; change limits by editing one file | ✅ `src/data/plans.ts` is the single source of truth (server + client). Every feature renders a green check **and** every non-included feature renders a red cross. Edit `PLANS` there → all views + server enforcement update |
| Optimize / delete duplicate code | ✅ Deleted `AuthModal.tsx`, demo exports in `initialData.ts`, duplicate `PRICING_PLANS`/`PLAN_LIMITS`, dead imports; fixed 9 TS errors; `tsc --noEmit` clean |
| “Most Popular” tag exactly centered | ✅ All plan grids are now centered 3-column (`max-w-5xl mx-auto`) and the badge uses `absolute left-1/2 -translate-x-1/2` |
| Money-back refund on mid-month cancel (usage + tax + fees deducted) | ✅ `billingMath()` in `server.ts`: refund = unused days × price − usage cost − tax − gateway fee. Preview + cancel UI in Settings → Plan & Usage |
| All payment methods Stripe/LS allow | ✅ Card, bank/ACH, PayPal, Apple Pay, Google Pay (Stripe Payment Links / PaymentIntents; Lemon Squeezy hosted checkout) |
| Real Google login/signup; homepage button redirects to Google, not signup page | ✅ `GET /api/auth/google` → real OAuth → callback → session cookie. Homepage & signup buttons do a full redirect (`window.location.href = '/api/auth/google'`), never the in-app signup page |
| Test mode `test = true/false` with real test keys (no fake mocks) | ✅ `POST /api/test-mode` + Settings → Test Mode panel: toggles real test keys (Stripe `sk_test_…`, Resend `re_…`, Lemon Squeezy, Whapi, Google, QStash), real test email send, real test PaymentIntent. `testOverrides` are server-side only |
| Final details in README | ✅ This document |

---

## 2. Directory Structure

```text
├── server.ts                       # Express API: auth, billing, webhooks, cron, Vite/static serving
├── metadata.json                   # AI Studio applet metadata
├── package.json / tsconfig.json / vite.config.ts
├── .env.example                    # All environment variables (blueprint)
├── src/
│   ├── main.tsx / App.tsx          # Entry + router (pushState) + plan gate + data wiring
│   ├── index.css                   # Orange theme tokens (light/dark)
│   ├── types.ts
│   ├── data/
│   │   ├── plans.ts                # ★ SINGLE SOURCE OF TRUTH for plans/limits/features/prices
│   │   ├── migration.ts            # Canonical SQL migration (served at /api/db/migration)
│   │   ├── supabaseSchema.sql      # Copy-paste mirror of the migration for the SQL editor
│   │   └── initialData.ts          # Signup seed data only (sequences + email templates)
│   ├── lib/
│   │   ├── storage.ts              # API layer (no mocks; real fetch to the server)
│   │   └── useApiPlans.ts          # useApiPlans() hook → real /api/billing/plans
│   └── components/
│       ├── HomePage / AuthPage / Footer / Navbar / Sidebar / ThemeToggle
│       ├── PlanCard / PlanSelection            # Tick ✅ + cross ❌ feature lists, centered badge
│       ├── SettingsBilling / TestModePanel     # Plan switch, cancel+refund, test mode
│       ├── DashboardOverview / InvoicesTable / SequenceBuilder / ReminderLogs
│       ├── CustomEmailTemplates / AiSequenceModal / ChangePasswordModal
│       ├── Connectors / HelpPage / OpExCalculator
│       └── PublicPaymentPortal                  # /pay/[invoice_id] — card/bank/PayPal/wallet
└── tests/
    ├── api.test.ts                 # Hermetic API tests (no DB/keys → documented 401/503 paths)
    └── opex.test.ts                # OpEx financial model unit tests
```

---

## 3. One-Time Database Setup (Supabase)

The server self-migrates through a `public.exec_sql(text)` helper. Run **once** in the Supabase SQL editor:

1. Open your Supabase project → **SQL Editor**.
2. Paste the contents of **`src/data/supabaseSchema.sql`** (or fetch them from your running app at `GET /api/db/migration`).
3. Run it. It creates the `exec_sql` helper, the `_init_guard` marker, and all tables/indexes.
4. Restart the server. `/api/health` now reports `dbReady: true`.

After that every boot automatically applies schema changes (`initDb()` runs `exec_sql(MIGRATION_SQL)`), so future migrations are applied by simply restarting. If you prefer manual migrations, drop the `exec_sql` function after initial setup.

**Schema summary** (all user-scoped, no RLS needed since access is server-side via service role):

| Table | Purpose |
| --- | --- |
| `users` | Email, scrypt password hash, subscription tier/status, LS/Stripe customer ids, `plan_started_at` (proration anchor), branding fields |
| `invoices` | Synced invoices + recovery-flow progress |
| `reminder_logs` | Append-only audit trail of every real dispatch |
| `sequences` | Escalation step templates (JSONB) |
| `custom_email_templates` | Reusable email templates |
| `usage` | Per-user-per-month counters (emails, WhatsApp, AI, recovered $) → plan-limit enforcement + refund math |
| `integrations` | Connected provider accounts |
| `scheduling` | Automation frequency/timezone |
| `billing_events` | Every charge / proration / refund / subscription event |

---

## 4. Authentication & Sessions

- **Email/password signup & login**: server-side scrypt hashing (`scrypt$salt$hash`, timing-safe compare). Sessions are HMAC-signed tokens (`AUTH_COOKIE_SECRET`) stored in an **HttpOnly, SameSite=Lax** cookie named `rf_session` with **30-day expiry**; `Secure` flag is added in production.
- **Google Sign-In (real OAuth 2.0)**: `GET /api/auth/google` redirects to Google; the callback exchanges the code, verifies the ID token, creates/logs in the user, and sets the same secure cookie. Requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` and the redirect URI `${APP_URL}/api/auth/google/callback` registered in Google Cloud Console.
- **Password reset**: real Resend email with a 1-hour token link.
- **No localStorage tokens anywhere.**

---

## 5. Plans, Proration & Money-Back Refund (single file to edit)

Edit **`src/data/plans.ts`** — that's it. `PLANS` drives:

- plan cards (price, tagline, invoice limit, ✅/❌ features),
- `/api/billing/plans` (server + HomePage + PlanSelection),
- **server-side limit enforcement** (`assertLimit`),
- proration math (`prorateSwitch`) and refund math (`billingMath`).

Pricing constants in the same file: `GATEWAY_FEE_RATE 2.9%`, `GATEWAY_FEE_FLAT $0.30`, `PLATFORM_TAX_RATE 5%` (merchant-of-record tax), `BILLING_PERIOD_DAYS 30`, `UNIT_COSTS` (per-email, per-WhatsApp, per-AI-draft, per-invoice).

**Current plans** (Starter $29 / Pro $59 ⭐ Most Popular / Agency $119):

| Feature | Starter | Pro | Agency |
| --- | :---: | :---: | :---: |
| Tracked invoices / mo | 100 | 500 | Unlimited |
| Emails / mo | 300 | 2,000 | 10,000 |
| WhatsApp reminders | ❌ | 300/mo | 2,000/mo |
| AI drafts | 50 | 200 | 1,000 |
| Custom payment domain | ❌ | ✅ | ✅ |
| White-label portal | ❌ | ❌ | ✅ |
| Advanced reports & export | ❌ | ✅ | ✅ |
| Priority automation queue | ❌ | ❌ | ✅ |
| Team seats | 1 | 3 | 10 |

### Billing rules (implemented in `server.ts`)

- **First purchase**: full month price + 5% tax + 2.9%+$0.30 gateway fee.
- **Mid-month switch**: charged the **prorated delta** (`(new − old) × remaining days / 30`) + fees; downgrades produce a credit toward the next payment. Limits change the moment the webhook confirms.
- **Mid-month cancel**: money-back refund = `price × remainingRatio − usageCost − tax − gatewayFee` (usage costs from `UNIT_COSTS` × actual counters). Previewed live in Settings and recorded in `billing_events`.
- **Payments**: Lemon Squeezy hosted checkout (card/PayPal/bank/Apple Pay/Google Pay) or Stripe Checkout/Subscription with the same methods. Client portal `/pay/[id]` supports card, PayPal, bank/ACH, wallets with fee passthrough shown before payment.

---

## 6. Test Mode (`test = true/false`, no fake mocks)

- Server-side switch (`testOverrides.enabled`) toggled via `POST /api/test-mode` or the **Settings → Test Mode** panel.
- When ON, the server uses the **real test keys** entered there (or in `.env`) for Stripe, Resend, Lemon Squeezy, Whapi, Google and QStash — overriding `.env` only while enabled.
- You can send a **real test email** (e.g. to `alex+test@resend.dev`) and create a **real test PaymentIntent / Payment Link** (test card `4242 4242 4242 4242`, declined `4000 0000 0000 0002`, 3DS `4000 0000 0000 3155`, test bank routing `110000000`) and verify results in the Stripe / Resend dashboards.
- The public payment portal shows test credentials when test mode is active.
- When OFF, only `.env` keys are used. Missing keys → explicit `PROVIDER_NOT_CONFIGURED` errors. **Nothing is ever mocked.**

---

## 7. Webhooks & API Surface

- `POST /api/webhooks/lemon-squeezy` — HMAC-verified; applies subscription create/update/cancel.
- `POST /api/webhooks/stripe` — signature-verified (raw body); `checkout.session.completed` applies prorated tier; `invoice.payment_succeeded` marks invoices paid and stops sequences.
- `POST /api/cron/process-reminders` — QStash-signed (or valid session); dispatches real Resend/Whapi reminders, writes logs, increments usage, reschedules +24h.
- `POST /api/ai/generate-sequence` & `/api/ai/generate-custom-email` — real Gemini, plan-gated, usage-metered.
- `GET /api/billing/plans`, `POST /api/billing/checkout`, `POST /api/billing/prorate`, `POST /api/billing/cancel`, `GET /api/billing/refund-preview`, `GET /api/billing/events`.
- `GET /api/health` — provider flags + `dbReady`/`dbReason` (so a broken DB is visible immediately).
- `GET /api/db/migration` — the canonical SQL for one-time setup.
- `POST /api/test-mode`, `POST /api/test/send-email`, `POST /api/test/payment-intent` — real test-mode tools.
- `POST /api/auth/signup|login|logout`, `GET /api/auth/me`, `PUT /api/auth/profile`, `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `GET /api/auth/google[/callback]`.
- Full REST for invoices, sequences, logs, usage, scheduling, integrations, custom email templates, and the public portal.

---

## 8. Environment Variables

See `.env.example`. Key ones: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_COOKIE_SECRET`, `APP_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `WHAPI_API_TOKEN`, `LEMON_SQUEEZY_API_KEY` + `LEMON_SQUEEZY_STORE_ID` + `LEMON_SQUEEZY_WEBHOOK_SECRET` + `LEMON_SQUEEZY_VARIANT_<TIER>`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_<TIER>`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`.

---

## 9. Run, Test, Build

```bash
npm install
# 1. Run src/data/supabaseSchema.sql once in the Supabase SQL editor
# 2. cp .env.example .env and fill real keys
npm run dev          # http://localhost:3000 (Express + Vite)
npm test             # hermetic tests (14): no mocks, no live keys needed
npm run lint         # tsc --noEmit — must be clean
npm run build && npm start   # production build + server
```

---

## 10. Financial & Operating Expense (OpEx) Model

| Users | Total OpEx | Gross MRR | Net Profit | Margin |
| :--- | :--- | :--- | :--- | :--- |
| 0 | $0 | $0 | $0 | 0% |
| 10 | $130 | $590 | $461 | 78.1% |
| 100 | $440 | $5,900 | $5,460 | 92.5% |
| 250 | $998 | $14,750 | $13,753 | 93.2% |
| 1,000 | $3,905 | $59,000 | $55,095 | 93.4% |

Interactive calculator in Help → View Cost Model; math in `calculateOpExForUsers()` (`src/lib/storage.ts`), covered by `tests/opex.test.ts`.