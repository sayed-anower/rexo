# EronFlow Production Setup Guide

This guide covers everything needed to take EronFlow from development to production — environment variables, OAuth redirects, webhooks, payment gateway setup, and deployment checklist.

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in every value. All variables are required unless marked optional.

### Core
| Variable | Description |
|----------|-------------|
| `APP_URL` | **CRITICAL** — Your public HTTPS URL (e.g. `https://eronflow.top`). All OAuth redirects, webhooks and QStash callbacks derive from this. |
| `NODE_ENV` | Set to `production` for Secure cookies + static serving. |
| `AUTH_COOKIE_SECRET` | 64-char random string for session cookies. Generate: `openssl rand -base64 48` |

### Database (Supabase)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |

### Payment Processing

**SaaS Subscription Billing ONLY — Paddle (Merchant of Record, handles VAT/tax)**
| Variable | Description |
|----------|-------------|
| `PADDLE_VENDOR_ID` | From Paddle Dashboard → Developer Tools |
| `PADDLE_API_KEY` | From Paddle Dashboard → API Keys |
| `PADDLE_CLIENT_TOKEN` | Client-side token for Paddle.js |
| `PADDLE_WEBHOOK_SECRET` | Webhook signature secret |
| `PADDLE_PRICE_STARTER` | Price ID for Starter plan |
| `PADDLE_PRICE_PRO` | Price ID for Pro plan |
| `PADDLE_PRICE_AGENCY` | Price ID for Agency plan |

**Invoice Payments — BYOK (Bring Your Own Keys) — per agency, NOT env vars**
| Method | Where agency configures it | What it does |
|--------|----------------------------|--------------|
| **Stripe BYOK** | Settings → Billing → Payment Setup → Stripe (paste `rk_live_...` / `rk_test_...`) | 100% of client invoice money settles directly to agency's Stripe balance. EronFlow never touches it. See `PAY.md` + in-app instructions with dashboard links: https://dashboard.stripe.com/apikeys |
| **PayPal BYOK** | Settings → Billing → Payment Setup → PayPal (paste Client ID + Secret, Live/Sandbox) | 100% settles to agency's PayPal. See `PAY.md` + dashboard: https://developer.paypal.com/dashboard/applications |

> **No platform Stripe/PayPal env vars needed for invoice money.** `STRIPE_CLIENT_ID` etc are legacy Connect OAuth fallback — new installs leave them empty and use BYOK. Paddle is ONLY for SaaS billing.

### Scheduling (Upstash QStash)
| Variable | Description |
|----------|-------------|
| `QSTASH_TOKEN` | QStash API token |
| `QSTASH_CURRENT_SIGNING_KEY` | Current signing key |
| `QSTASH_NEXT_SIGNING_KEY` | Next signing key (for key rotation) |

### Email (Resend)
| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Verified sender address (e.g. `noreply@eronflow.top`) |

### WhatsApp (Meta Cloud API)
| Variable | Description |
|----------|-------------|
| `WHATSAPP_TOKEN` | Permanent system user token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from API Setup |
| `WHATSAPP_API_VERSION` | API version (default: `v21.0`) |

### SMS (EasySendSMS)
| Variable | Description |
|----------|-------------|
| `EASYSENDSMS_API_KEY` | REST API key |
| `EASYSENDSMS_SENDER` | Alphanumeric sender ID (max 11 chars) |

### AI (Google Gemini)
| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI API key |

### OAuth Connectors
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `QUICKBOOKS_CLIENT_ID` | QuickBooks client ID |
| `QUICKBOOKS_CLIENT_SECRET` | QuickBooks client secret |
| `QUICKBOOKS_WEBHOOK_TOKEN` | QuickBooks webhook verifier token |
| `XERO_CLIENT_ID` | Xero client ID |
| `XERO_CLIENT_SECRET` | Xero client secret |
| `XERO_WEBHOOK_KEY` | Xero webhook signing key |

---

## 2. Redirect URLs (OAuth Callbacks)

Register these URLs in each provider's developer console:

| Provider | Where to Register | Redirect URL |
|----------|-------------------|--------------|
| Google (Sign-in) | console.cloud.google.com → Credentials → OAuth client | `https://YOUR-DOMAIN/api/auth/google/callback` AND `https://YOUR-DOMAIN/api/oauth/callback` |
| QuickBooks | Intuit Developer → App → Keys & OAuth | `https://YOUR-DOMAIN/api/oauth/callback` |
| Xero | developer.xero.com → App → Redirect URIs | `https://YOUR-DOMAIN/api/oauth/callback` |
| Paddle hosted checkout | sent automatically per-request as `redirect_url`/`cancel_url` (no console step) | `https://YOUR-DOMAIN/app/settings?billing=paid&plan=<plan>` and `https://YOUR-DOMAIN/pay/<invoiceId>?returned=1` |

> **Stripe & PayPal BYOK need NO redirect registration** — invoice payments use the agency's own API keys directly (no OAuth). The public portal creates a Stripe Checkout Session / PayPal Order with the agency key and redirects the payer to Stripe/PayPal hosted page. See `PAY.md` + Settings → Payment Setup.

> **Important:** The redirect URI must match EXACTLY — scheme, host, path. A mismatch causes `redirect_uri_mismatch` errors.

---

## 3. Webhook URLs

Register these URLs where providers push events to your server:

| Provider | Where to Register | Webhook URL | Signature Header |
|----------|-------------------|-------------|------------------|
| Paddle (SaaS billing only) | Paddle Dashboard → Webhooks | `https://YOUR-DOMAIN/api/webhooks/paddle` | `paddle-signature` |
| QuickBooks | Intuit Developer → Webhooks | `https://YOUR-DOMAIN/api/webhooks/quickbooks` | `Intuit-Signature` |
| Xero | developer.xero.com → Webhooks | `https://YOUR-DOMAIN/api/webhooks/xero` | `x-xero-signature` |
| QStash | N/A (QStash calls your URL) | `https://YOUR-DOMAIN/api/cron/process-reminders` | `upstash-signature` (JWT) |

> **Stripe & PayPal BYOK need NO webhook registration on the platform** — the agency’s Stripe/PayPal account receives money directly. EronFlow verifies payment by polling the agency’s BYOK API with the stored restricted key / PayPal credentials (Checkout Session / PaymentIntent / Order status). Optional: the agency can still add a Stripe webhook in their own dashboard if they want server-to-server confirmation, but it is not required.

---

## 4. Payment Gateway Setup

### Paddle — SaaS Subscription Billing ONLY (Merchant of Record — handles VAT/tax)

> **Paddle is ONLY for EronFlow plan charges.** Invoice payments are BYOK Stripe/PayPal — 100% direct to the agency.

1. Create a Paddle account at [paddle.com](https://paddle.com)
2. Complete seller onboarding (business details, bank account)
3. Go to **Catalog** → Create products and prices for each plan:
   - Starter: $129/mo
   - Pro: $349/mo
   - Agency: $599/mo
4. Copy the **Price IDs** into `.env`:
   ```
   PADDLE_PRICE_STARTER="price_xxxxx"
   PADDLE_PRICE_PRO="price_xxxxx"
   PADDLE_PRICE_AGENCY="price_xxxxx"
   ```
5. Go to **Developer Tools** → **API Keys** → copy Vendor ID and API Key
6. Go to **Webhooks** → Add endpoint: `https://YOUR-DOMAIN/api/webhooks/paddle` → select `subscription_payment_succeeded`, `transaction_completed`, `subscription_updated`, `subscription_cancelled`
7. For testing: use sandbox at `https://sandbox-api.paddle.com` + `PADDLE_API_BASE="https://sandbox-api.paddle.com"`

### Stripe BYOK — Invoice Payments (agency’s own Stripe, 100% direct)

> **Each agency pastes their own Stripe restricted key — EronFlow never touches invoice money.** Test from Bangladesh with sandbox keys — no US SSN needed.

1. Agency logs into **Stripe Dashboard** → **Developers → API Keys** → **Restricted keys → Create restricted key** (name: EronFlow Invoice Recovery). See `PAY.md` for full steps + dashboard links.
2. Permissions: `PaymentIntents: Write`, `Customers: Write`, `Checkout Sessions: Write` (for hosted page), `Charges: Read`.
3. Copy key (`rk_live_...` for live, `rk_test_...` for sandbox/test) → agency pastes it in **Settings → Billing → Payment Setup (BYOK)** → Save & Verify (live validation vs Stripe Balance API).
4. Optional: also paste Publishable key (`pk_live_...` / `pk_test_...`) for best portal UX.
5. **Test from Bangladesh:** Toggle **Test Mode** in Stripe Dashboard (top right) and use `rk_test_` / `pk_test_` — no US verification needed. See `PAY.md` § How to Test & Build.
6. **Dashboard links:** Live https://dashboard.stripe.com/apikeys — Test https://dashboard.stripe.com/test/apikeys — Restricted keys docs https://stripe.com/docs/keys

### PayPal BYOK — Invoice Payments (agency’s own PayPal, 100% direct)

> Same model — agency’s PayPal, not platform’s.

1. Agency logs into **PayPal Developer Dashboard** → toggle **Live** (or **Sandbox** for testing) → **Apps & Credentials → Create App** (type: Merchant, name: EronFlow Payment Gateway). See `PAY.md`.
2. Copy **Client ID** + click **Show** for **Client Secret** → paste both in **Settings → Billing → Payment Setup (BYOK)** → select Live/Sandbox → Save & Verify (validated via PayPal token endpoint).
3. **Test from Bangladesh:** Under **Sandbox → Apps & Credentials** → copy Default Application Client ID/Secret → use **Sandbox** mode — no Business verification needed. See `PAY.md`.
4. **Dashboard links:** Live apps https://developer.paypal.com/dashboard/applications/live — Sandbox https://developer.paypal.com/dashboard/applications/sandbox — Accounts https://developer.paypal.com/dashboard/sandbox/accounts

---

## 5. Provider-Specific Setup

### Resend (Email)
1. Verify your sending domain at [resend.com/domains](https://resend.com/domains)
2. Add SPF and DKIM DNS records
3. Set `RESEND_FROM_EMAIL` to a verified address (e.g. `noreply@eronflow.top`)

### Meta WhatsApp Cloud API
1. Create a Business app at [developers.facebook.com](https://developers.facebook.com) with WhatsApp product
2. Add and verify a phone number → copy Phone Number ID
3. Create a System User → grant `whatsapp_business_messaging` → generate permanent token
4. **Do NOT use the temporary token from API Setup** (expires in 24h)
5. Production: submit Business Verification to lift the 5-number limit

### EasySendSMS (SMS)
1. Sign up at [easysendsms.app](https://easysendsms.app)
2. Get REST API key from Account → Settings
3. Register a Sender ID for your target countries
4. Set `EASYSENDSMS_SENDER` to your approved sender ID

### QuickBooks
1. Create an app at [developer.intuit.com](https://developer.intuit.com)
2. Add redirect URI: `https://YOUR-DOMAIN/api/oauth/callback`
3. Subscribe to **Invoice** entity webhooks
4. Copy webhook verifier token to `QUICKBOOKS_WEBHOOK_TOKEN`

### Xero
1. Create an app at [developer.xero.com](https://developer.xero.com)
2. Add redirect URI: `https://YOUR-DOMAIN/api/oauth/callback`
3. Set webhook key to `XERO_WEBHOOK_KEY`
4. Subscribe to invoice webhooks

---

## 6. Deployment

### Build & Start
```bash
npm run build      # Vite frontend + esbuild server
npm start          # Runs dist/server.cjs
```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Set `APP_URL=https://yourdomain`
- [ ] Rotate `AUTH_COOKIE_SECRET`
- [ ] Verify all env vars from §1
- [ ] Register all redirect URLs from §2
- [ ] Register all webhook URLs from §3
- [ ] Complete payment gateway setup (§4)
- [ ] Verify email domain in Resend
- [ ] Test QStash: `curl https://yourdomain/api/cron/qstash-status`
- [ ] Run `npm test` (all tests pass)
- [ ] Run `npm run build` (no errors)

### Test User Creation
```bash
npm run create-test-user
```
Interactive script that creates a fully-active test user with any plan.

---

## 7. Troubleshooting

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Redirect URL in provider console must match EXACTLY with `APP_URL` |
| `INVALID_SIGNATURE` on webhooks | Check that webhook secret env var matches the provider's configured secret |
| QStash deliveries 404 | Ensure `APP_URL` is a public HTTPS URL (QStash is a cloud service) |
| WhatsApp messages fail | Verify permanent system user token (not temporary app token) |
| Email not sending | Verify domain in Resend, check SPF/DKIM records |
| Paddle checkout fails | Verify Price IDs exist in Paddle Catalog and match plan tiers |
| Stripe BYOK save fails | Check key format `rk_live_/rk_test_` and permissions: PaymentIntents Write, Customers Write, Checkout Sessions Write, Charges Read |
| PayPal BYOK save fails | Check Client ID/Secret and mode (Live vs Sandbox) — must match PayPal dashboard toggle |
| BYOK provider not configured (portal) | Agency has not added Stripe/PayPal keys in Settings → Payment Setup — see PAY.md |

---

## 8. Local Development with Public URLs

For testing webhooks and OAuth locally:

```bash
# Option 1: ngrok (recommended)
ngrok http 3000
# Copy the https URL to APP_URL in .env

# Option 2: localtunnel (no account needed)
npx localtunnel --port 3000
```

---

## 9. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    EronFlow SaaS                         │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + Vite)    │  Backend (Express)       │
│  ├─ Dashboard               │  ├─ Auth (Supabase)        │
│  ├─ Invoice Management      │  ├─ SaaS Billing: Paddle    │
│  ├─ Automation Scheduler    │  ├─ BYOK Invoice Payments:  │
│  ├─ Message Templates       │  │  ├─ Stripe (rk_live_/rk_test_)  │
│  ├─ Connectors (OAuth QB/Xero) │ │  └─ PayPal (Client ID/Secret) │
│  └─ Public Payment Portal   │  │  ├─ QuickBooks (OAuth)   │
│     (BYOK → agency Stripe/ │  │  └─ Xero (OAuth PKCE)    │
│      PayPal, 100% direct)   │  ├─ QStash Cron Worker     │
│                             │  ├─ Email (Resend)         │
│                             │  ├─ SMS (EasySendSMS)      │
│                             │  └─ AI (Gemini)            │
├─────────────────────────────────────────────────────────┤
│  Providers: Supabase (DB) │ Paddle (SaaS billing only)   │
│  Stripe BYOK + PayPal BYOK (invoice funds → agency)     │
│  QStash (Scheduling) │ Resend │ EasySendSMS │ Gemini      │
└─────────────────────────────────────────────────────────┘
```