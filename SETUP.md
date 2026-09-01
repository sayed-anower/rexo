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

**Subscriptions & Invoicing — Paddle (Merchant of Record)**
| Variable | Description |
|----------|-------------|
| `PADDLE_VENDOR_ID` | From Paddle Dashboard → Developer Tools |
| `PADDLE_API_KEY` | From Paddle Dashboard → API Keys |
| `PADDLE_CLIENT_TOKEN` | Client-side token for Paddle.js |
| `PADDLE_WEBHOOK_SECRET` | Webhook signature secret |
| `PADDLE_PRICE_STARTER` | Price ID for Starter plan |
| `PADDLE_PRICE_PRO` | Price ID for Pro plan |
| `PADDLE_PRICE_AGENCY` | Price ID for Agency plan |

**Client Payment Connectors — Stripe & PayPal (OAuth)**
| Variable | Description |
|----------|-------------|
| `STRIPE_CLIENT_ID` | Stripe Connect OAuth client ID |
| `STRIPE_CLIENT_SECRET` | Stripe Connect OAuth client secret |
| `PAYPAL_CLIENT_ID` | PayPal OAuth client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal OAuth client secret |

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
| Google (Sign-in + Gmail) | console.cloud.google.com → Credentials → OAuth client | `https://YOUR-DOMAIN/api/auth/google/callback` AND `https://YOUR-DOMAIN/api/oauth/callback` |
| Stripe Connect | Stripe Dashboard → Developers → Connect → Settings | `https://YOUR-DOMAIN/api/integrations/stripe/callback` |
| PayPal Connect | PayPal Developer Apps → App Settings | `https://YOUR-DOMAIN/api/integrations/paypal/callback` |
| QuickBooks | Intuit Developer → App → Keys & OAuth | `https://YOUR-DOMAIN/api/oauth/callback` |
| Xero | developer.xero.com → App → Redirect URIs | `https://YOUR-DOMAIN/api/oauth/callback` |

> **Important:** The redirect URI must match EXACTLY — scheme, host, path. A mismatch causes `redirect_uri_mismatch` errors.

---

## 3. Webhook URLs

Register these URLs where providers push events to your server:

| Provider | Where to Register | Webhook URL | Signature Header |
|----------|-------------------|-------------|------------------|
| Paddle | Paddle Dashboard → Webhooks | `https://YOUR-DOMAIN/api/webhooks/paddle` | `paddle-signature` |
| Stripe | Stripe Dashboard → Developers → Webhooks | `https://YOUR-DOMAIN/api/webhooks/stripe` | `stripe-signature` |
| PayPal | PayPal Developer → Webhooks | `https://YOUR-DOMAIN/api/webhooks/paypal` | `Paypal-Auth-Algo` |
| QuickBooks | Intuit Developer → Webhooks | `https://YOUR-DOMAIN/api/webhooks/quickbooks` | `Intuit-Signature` |
| Xero | developer.xero.com → Webhooks | `https://YOUR-DOMAIN/api/webhooks/xero` | `x-xero-signature` |
| QStash | N/A (QStash calls your URL) | `https://YOUR-DOMAIN/api/cron/process-reminders` | `upstash-signature` (JWT) |

---

## 4. Payment Gateway Setup

### Paddle — Subscriptions & Invoicing (Recommended)

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
6. Go to **Webhooks** → Add endpoint: `https://YOUR-DOMAIN/api/webhooks/paddle`
7. For testing: use sandbox at `https://sandbox-api.paddle.com`

### Stripe Connect — Client Payments

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Register a Stripe Connect OAuth app at [Stripe Dashboard → Connect](https://dashboard.stripe.com/test/express/accounts)
3. Add redirect URI: `https://YOUR-DOMAIN/api/integrations/stripe/callback`
4. Copy the Client ID and Secret to `.env`
5. Register webhook endpoint: `https://YOUR-DOMAIN/api/webhooks/stripe`

### PayPal Connect — Client Payments

1. Create a PayPal Developer app at [developer.paypal.com](https://developer.paypal.com)
2. Add redirect URI: `https://YOUR-DOMAIN/api/integrations/paypal/callback`
3. Copy the Client ID and Secret to `.env`
4. Register webhook endpoint: `https://YOUR-DOMAIN/api/webhooks/paypal`

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
| Stripe OAuth fails | Verify redirect URI matches exactly and app is approved/live |
| PayPal OAuth fails | Verify sandbox/live mode matches and redirect URI is registered |

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
│  ├─ Invoice Management      │  ├─ Billing (Paddle)       │
│  ├─ Automation Scheduler    │  ├─ Connectors:            │
│  ├─ Message Templates       │  │  ├─ Stripe Connect       │
│  ├─ Connectors (OAuth)      │  │  ├─ PayPal Connect       │
│  └─ Public Payment Portal   │  │  ├─ QuickBooks           │
│                             │  │  └─ Xero                 │
│                             │  ├─ QStash Cron Worker     │
│                             │  ├─ Email (Resend)         │
│                             │  ├─ SMS (EasySendSMS)      │
│                             │  └─ AI (Gemini)            │
├─────────────────────────────────────────────────────────┤
│  Providers: Supabase (DB) │ Paddle (Payments)            │
│  Stripe/PayPal (Client Payouts) │ QStash (Scheduling)    │
│  Resend (Email) │ EasySendSMS                               │
└─────────────────────────────────────────────────────────┘
```