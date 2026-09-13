# EronFlow

Everything that was done, every API the platform uses, exactly which env var each one
needs, all callback/redirect/webhook URLs, what is still missing, and how to take the
APIs to production.

---

## 1. Work completed (this change)

### 1.1 QStash automation — fixed & proven end-to-end ✅
Two critical bugs made automation silently dead:

| Bug | Fix |
| --- | --- |
| QStash deliveries were published to `/api/cron/process-reminder`, but the express route is `/api/cron/process-reminders` → every delivery hit a 404 and automation never ran | Destination now built from the same constant as the route (`server.ts`, `scheduleQStashReminder`) |
| Signature verification used a homemade scheme that could never validate a real QStash delivery → endpoint answered 401 even when the path matched | `verifyQStashSignature()` rewritten to Upstash's real scheme: HS256 **JWT** in `Upstash-Signature`, HMAC key = raw signing-key bytes, claims checked (`iss:"Upstash"`, `nbf/exp ±60s`, `body` = base64url SHA‑256 of the raw request body), current **and** next signing keys tried; legacy `k1=`/`v1a` format kept as fallback. Raw body is captured via an `express.json({ verify })` hook so the hash matches byte-for-byte |

Additional hardening:
* `/api/cron/qstash-status` — diagnostics endpoint reporting config flags, the callback URL and the last 5 verified deliveries with timestamps.
* Raw-body capture middleware (also benefits future signature checks).
* Public URL handling documented in `.env`: QStash is a cloud service, so `APP_URL` **must** be a public `https://` URL.

**Live proof (ran against the real QStash EU region):**
```
publish   HTTP 201  messageId msg_7YoJxFpwkEy6sUx6D9ReLQ7jFmCVNqTBQPeDwLsUNVsQhKF1v8KNv
Upstash-Delay: 30s  published at epoch-ms 1787734444441
delivery   accepted & JWT-verified at 2026-08-26T08:54:37.716Z  (= 33s after publish)
```

### 1.2 WhatsApp — WhAPI replaced by DIRECT Meta WhatsApp Cloud API ✅
* New sender `sendWhatsAppViaMetaCloud()` posts to
  `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`.
* Used everywhere the old WhAPI call existed: manual invoice sends, cron/recovery dispatches,
  health flags (`whatsappCloudConfigured`), connectors page pseudo-integration.
* Env vars renamed: `WHAPI_API_TOKEN`/`WHAPI_API_URL` are gone → `WHATSAPP_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, optional `WHATSAPP_API_VERSION` (default `v21.0`).

### 1.3 SMS — Vonage replaced by EasySendSMS ✅
* New sender `sendSMSViaEasySendSMS()` calls EasySendSMS REST v1:
  `POST https://restapi.easysendsms.app/v1/rest/sms/send` with the `apikey` header,
  body `{ from, to, text, type }`. Unicode auto-detected (`type:1`) for non-GSM text.
* Recipient numbers normalized to digits-only (EasySendSMS rejects `+`/`00` prefixes).
* Removed everywhere: manual sends, cron dispatches, health flag (`easysendsmsConfigured`),
  connectors pseudo-integration, `.env`/`.env.example`.
* **Live proof:** one real SMS sent to **+8801343369737** —
  response `{"status":"OK","messageIds":["OK: 73e90383-c972-4103-b192-bbfabdc1ffd1"]}`.

### 1.4 Signup form changes ✅
* **Removed**: the whole payout-details block (Payoneer / bank transfer / card fields) from
  signup — no bank/card/PayPal info is collected or stored at signup anymore. Payout
  instruments continue to live in Settings → Payment methods (server endpoints unchanged).
* **Added (mandatory)**: Country selector (ISO 3166 list, defaults to **US**) + phone number with country code (defaults to **+1**).
* **Added**: "I agree to Terms of Service and Privacy Policy" checkbox — enforced client-side
  *and* server-side (`accept_terms:true` required, dedicated `TERMS_REQUIRED` error).
* DB: new columns `users.user_country`, `users.terms_accepted_at` (idempotent migration runs
  automatically on boot; also added to the fresh-install schema).
* Server validations: country must be a 2-letter code, phone ≥7 digits.

### 1.5 Privacy Policy, Terms of Service & About pages ✅
* New React pages: `/privacy`, `/terms`, `/about` (`src/components/LegalPages.tsx`),
  rendered with Navbar+Footer, reachable logged-in or not.
* Footer links wired up (Privacy Policy · Terms of Service · About) plus About Us in the
  Product column.
* `public/robots.txt` allows the three pages for all crawlers.
* `public/sitemap.xml` lists `/`, `/help`, `/privacy`, `/terms`, `/about`.

### 1.6 Vonage legacy check ✅ (result: not possible)
Per the request “try to check vonage by sending one single message to +8801343369737”:
`scripts/test-vonage.ts` attempts exactly that. Result: **Vonage can never have worked in this
project — `VONAGE_API_KEY` was never set in `.env`** (only `VONAGE_API_SECRET` and
`VONAGE_FROM_NUMBER` were present, which alone cannot authenticate). The script exits with a
clear message listing what's missing. Vonage has now been removed entirely in favour of
EasySendSMS (which *was* proven working above).

### 1.7 Tests
`npm test` → **23/23 passing**, including new coverage:
* signup rejects missing terms/country/phone before any DB call (`VALIDATION`, `TERMS_REQUIRED`)
* hermetic env clearing updated for the new provider vars.

---

## 2. Every API used — what it does, what it needs

| API | Used for | Required `.env` vars | Status |
| --- | --- | --- | --- |
| Supabase (Postgres) | database, auth sessions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ configured & connected |
| Upstash QStash | scheduling automations at the exact minute | `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, public `APP_URL` | ✅ configured, e2e-proven |
| Resend | transactional email (OTP codes, reminders, custom templates) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | ⚠️ key set — domain must be verified in Resend |
| Google Gemini | AI template/sequence drafting | `GEMINI_API_KEY` | ✅ set |
| Meta WhatsApp Cloud API | WhatsApp reminders | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, optional `WHATSAPP_API_VERSION` | ❌ empty — see §4 |
| EasySendSMS | SMS reminders | `EASYSENDSMS_API_KEY`, `EASYSENDSMS_SENDER` | ✅ configured & live-tested |
| Paddle | subscriptions + client invoice payments + payouts | `PADDLE_VENDOR_ID`, `PADDLE_API_KEY`; optional `PADDLE_WEBHOOK_SECRET`, `PADDLE_API_BASE` | ❌ placeholder creds |
| Stripe Connect | client payments (OAuth) | `STRIPE_CLIENT_ID`, `STRIPE_CLIENT_SECRET` | ❌ not set |
| PayPal Connect | client payments (OAuth) | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | ❌ not set |
| QuickBooks Online | invoice sync | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_WEBHOOK_TOKEN` | ⚠️ keys set — app setup below |
| Xero | invoice sync | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_WEBHOOK_KEY` | ❌ secret empty |
| Google OAuth | “Continue with Google” sign-in + Gmail connector | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (+`AUTH_COOKIE_SECRET` for sessions) | ❌ not set |

---

## 3. All URLs you must register with providers

Replace `https://YOUR-DOMAIN` with your production `APP_URL`.

### 3.1 Redirect (callback) URLs — paste into each provider's console
| Provider | Where in their console | Exact redirect URL |
| --- | --- | --- |
| Google (sign-in **and** Gmail connector) | console.cloud.google.com → APIs & Services → Credentials → OAuth client → Authorized redirect URIs | `https://YOUR-DOMAIN/api/auth/google/callback` **and** `https://YOUR-DOMAIN/api/oauth/callback` |
| QuickBooks | Intuit Developer → app → Keys & OAuth → Redirect URI | `https://YOUR-DOMAIN/api/oauth/callback` |
| Xero | developer.xero.com → app → Redirect URI | `https://YOUR-DOMAIN/api/oauth/callback` |
| Paddle hosted checkout | sent automatically per-request as `redirect_url`/`cancel_url` (no console step) | `https://YOUR-DOMAIN/app/settings?billing=paid&plan=<plan>` and `https://YOUR-DOMAIN/pay/<invoiceId>?returned=1` |
| Stripe Connect | Stripe Dashboard → Developers → Connect → Settings | `https://YOUR-DOMAIN/api/integrations/stripe/callback` |
| PayPal Connect | PayPal Developer Apps → App Settings | `https://YOUR-DOMAIN/api/integrations/paypal/callback` |

> “Redirect URL” = after the user logs in / approves access at the provider, the provider
> bounces the browser back to this URL with a `?code=…` authorization code. Our server
> exchanges that code for tokens. If it isn't registered EXACTLY (scheme, host, path),
> the provider shows `redirect_uri_mismatch`.

### 3.2 Webhook URLs — paste where the provider pushes events to us
| Provider | Where to register | URL | Signature env var |
| --- | --- | --- | --- |
| QuickBooks | Intuit Developer → app → Webhooks | `https://YOUR-DOMAIN/api/webhooks/quickbooks` (Intuit first pings `?code=…`, we echo it automatically) | `QUICKBOOKS_WEBHOOK_TOKEN` (HMAC-SHA256 of body in `Intuit-Signature`) |
| Xero | developer.xero.com → app → Webhooks | `https://YOUR-DOMAIN/api/webhooks/xero` (their console sends an Intent-to-receive first) | `XERO_WEBHOOK_KEY` (HMAC-SHA256 base64 in `x-xero-signature`) |
| Paddle | Paddle Dashboard → Webhooks | `https://YOUR-DOMAIN/api/webhooks/paddle` | `PADDLE_WEBHOOK_SECRET` (`paddle-signature`) |
| Stripe | Stripe Dashboard → Developers → Webhooks | `https://YOUR-DOMAIN/api/webhooks/stripe` | `STRIPE_API_KEY` (`stripe-signature`) |
| PayPal | PayPal Developer → Webhooks | `https://YOUR-DOMAIN/api/webhooks/paypal` | `PAYPAL_CLIENT_SECRET` (`Paypal-Auth-Algo`) |
| Upstash QStash | none — QStash calls the URL we publish to | `https://YOUR-DOMAIN/api/cron/process-reminders` | `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (JWT in `upstash-signature`) |

> “Webhook” = the provider makes a server-to-server POST to us whenever something happens
> (invoice paid, plan charge confirmed, time to run an automation). The signature headers
> let us prove the call really came from them.

---

## 4. What is missing & how to finish each API

### 4.1 `APP_URL` — CRITICAL, blocks everything public
Currently `http://localhost:3000`. QStash, OAuth callbacks and webhooks need a public HTTPS URL.
* **Local dev:** expose port 3000 first, then put the URL in `.env` before starting:
  ```bash
  ngrok http 3000            # install from ngrok.com; one-time: ngrok config add-authtoken <token>
  # or, if the machine can't run the ngrok binary:
  npx localtunnel --port 3000
  ```
  Then `APP_URL="https://<tunnel-host>" npm run dev`.
  (ngrok IS installed at `/usr/local/bin/ngrok` on this machine, but its binary needs CPU
  instructions this box lacks — `localtunnel` was used for verification instead.)
* **Production:** deploy, point your domain at the server, set `APP_URL=https://yourdomain`.

### 4.2 Meta WhatsApp Cloud API (WhatsApp reminders disabled until done)
1. business.facebook.com → create/claim a Business; add the WhatsApp product in a Meta App
   (developers.facebook.com → Create App → Business type).
2. WhatsApp → API Setup: add & verify a phone number → copy the **Phone number ID** →
   `.env`: `WHATSAPP_PHONE_NUMBER_ID`.
3. Business Settings → Users → System users → create admin system user → Add assets
   (the app + WhatsApp account) with **whatsapp_business_messaging** → Generate token
   (never-expiring) → `.env`: `WHATSAPP_TOKEN`.
   Never use the temporary token under API Setup — it expires in 24h.
4. Optional: set `WHATSAPP_API_VERSION` (defaults to `v21.0`).
5. Test by sending any WhatsApp reminder from an invoice (client phone must be reachable on
   WhatsApp; the number must be E.164 format, which the server normalizes automatically).
6. Production notes: unverified apps can only message up to 5 numbers and use templates for
   business-initiated messages — submit Business Verification + display-name review to lift limits.

### 4.3 EasySendSMS (already working)
Key is live (proven above). For production polish:
* Alphanumeric sender `EASYSENDSMS_SENDER=EronFlow` may be replaced by a generic ID in some
  countries (e.g. Bangladesh often delivers from a random shortcode unless a Sender ID is
  approved). Register a Sender ID in the EasySendSMS dashboard per country and set it here.
* Watch balance: `POST /v1/rest/sms/balance` with the `apikey` header.

### 4.4 Resend (email)
* Verify the sending domain `mail.eronflow.top` at resend.com/domains (SPF/DKIM records) —
  until then OTP emails fail with a clear “verify your domain” error.
* `RESEND_FROM_EMAIL="@mail.eronflow.top"` is unusual (starts with `@`); set it to a full
  address like `noreply@mail.eronflow.top`. The code derives both senders from its domain:
  `noreply@<domain>` for OTPs and `agent@<domain>` for reminders.

### 4.5 QuickBooks (keys exist, finish the app)
1. developer.intuit.com → app → Keys & production credentials.
2. Redirect URI: `https://YOUR-DOMAIN/api/oauth/callback`.
3. Webhooks: `https://YOUR-DOMAIN/api/webhooks/quickbooks`, subscribe to the **Invoice**
   entity; copy the verifier token into `QUICKBOOKS_WEBHOOK_TOKEN` (already set).
4. Production: complete Intuit's app assessment (banking-grade review) to go live; sandbox
   companies work immediately with the current keys.

### 4.6 Xero (blocked — secret missing)
1. developer.xero.com → app → copy Client ID into `XERO_CLIENT_ID`.
2. **Create the client secret and put it in `XERO_CLIENT_SECRET`** ← the only blocker.
3. Redirect URI: `https://YOUR-DOMAIN/api/oauth/callback` (PKCE is handled automatically).
4. Webhooks: `https://YOUR-DOMAIN/api/webhooks/xero`, set the signing key to
   `XERO_WEBHOOK_KEY` (already set), subscribe to invoices.

### 4.5 Stripe Connect (client payments via OAuth)
1. dashboard.stripe.com → Developers → Connect → Settings → Register OAuth app.
2. Redirect URI: `https://YOUR-DOMAIN/api/integrations/stripe/callback`.
3. Copy Client ID and Secret to `.env`: `STRIPE_CLIENT_ID` / `STRIPE_CLIENT_SECRET`.
4. Register webhook endpoint: `https://YOUR-DOMAIN/api/webhooks/stripe`.
5. Go live: submit your Stripe account for review (required for live charges).

### 4.6 PayPal Connect (client payments via OAuth)
1. developer.paypal.com → Create App → copy Client ID and Secret.
2. Redirect URI: `https://YOUR-DOMAIN/api/integrations/paypal/callback`.
3. Put credentials in `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
4. Register webhook endpoint: `https://YOUR-DOMAIN/api/webhooks/paypal`.
5. Go live: submit your PayPal app for approval.

### 4.7 Payoneer replaced by Paddle (billing & subscriptions)
Paddle is now the merchant of record for all subscriptions and invoice payments:
1. Create a Paddle account at [paddle.com](https://paddle.com)
2. Complete seller onboarding (business details, bank account)
3. Set up products and prices in Paddle Dashboard → Catalog
4. Copy Vendor ID, API Key, Client Token to `.env`
5. Register webhook: `https://YOUR-DOMAIN/api/webhooks/paddle`
6. Copy Price IDs into `PADDLE_PRICE_STARTER`, `PADDLE_PRICE_PRO`, `PADDLE_PRICE_AGENCY`
7. For testing: use sandbox at `https://sandbox-api.paddle.com`
8. Until credentials are set, plan checkout falls back to instant activation and
   client payments return `PROVIDER_NOT_CONFIGURED`.

---

## 5. Production go-live checklist

- [ ] Deploy behind HTTPS; set `NODE_ENV=production` (enables `Secure` cookies + static serving).
- [ ] Set `APP_URL=https://yourdomain` (drives EVERY callback URL in §3).
- [ ] Rotate `AUTH_COOKIE_SECRET` (64-char random; keeps sessions stable across restarts).
- [ ] Register all §3.1 redirect URLs and §3.2 webhooks on the provider consoles.
- [ ] Finish §4.2 (WhatsApp), §4.6 (Xero), §4.7 (Google), §4.5 (Stripe), §4.6 (PayPal), §4.7 (Paddle); verify the Resend domain (§4.4).
- [ ] Confirm QStash: `curl https://yourdomain/api/cron/qstash-status` should show
      `qstashConfigured:true, signingKeysConfigured:true` and deliveries appearing after the
      next scheduled automation fires.
- [ ] Run `npm test` (23 tests) and `npm run build` before releasing.
- [ ] Remove `VONAGE_*` / `WHAPI_*` / `PAYONEER_*` leftovers from any deployment secrets store — obsolete.

## 6. Handy scripts added
```bash
npx tsx scripts/test-vonage.ts      # legacy Vonage check (documents why it can't work)
npx tsx scripts/test-easysendsms.ts # sends ONE real SMS to +8801343369737
curl localhost:3000/api/cron/qstash-status  # QStash diagnostics
```

---

## 7. Work completed (this change)

### 7.1 Xero / QuickBooks OAuth redirect-URI mismatch — FIXED ✅
**Root cause:** the OAuth authorize request and the token exchange both built the
redirect URI from `appUrl()` (`APP_URL`, currently `http://localhost:3000`). When you
logged in from your real domain, the provider compared the registered callback
(`https://your-domain/api/oauth/callback`) against `http://localhost:3000/api/oauth/callback`
and returned `redirect_uri_mismatch`. The two app-side calls *were* consistent with
each other, so the failure was always provider-vs-app, never app-vs-itself.

**Fix (server.ts):**
* `OAUTH_REDIRECT(req?)` now derives the redirect URI from the **actual request host**
  (`x-forwarded-proto` + `Host`) when a request is available, falling back to `APP_URL`
  only for programmatic calls. So whatever domain you browse on is exactly what gets
  registered & what gets sent.
* The chosen redirect URI is stored in the OAuth `state` and reused verbatim for the
  token exchange (`exchangeQbCode` / `exchangeXeroCode` now take a `redirectUri` arg),
  so authorize and exchange can never diverge again.
* `buildOAuthUrl` forwards the same `redirectUri` for Xero, QuickBooks **and** Google.

**What you must still do:** register `https://YOUR-DOMAIN/api/oauth/callback` in the
Xero & QuickBooks consoles exactly once (see §3.1). Because it now matches the host you
use, the mismatch is gone. No code change needed on your side beyond the deploy.

### 7.2 Settings → Add payment method (item 2) — FIXED ✅
* **Auto verification email:** opening “Add payment method” now automatically sends the
  6-digit code to the **account email on file** (backend `/api/instruments/send-verification`
  already mailed `user.profile.email`; the bug was the UI forced a manual email entry).
  The custom email placeholder + manual “Send code” step were removed; the modal shows
  the address the code was sent to.
* **Refund calculator now shows requests & is cut by usage:** the cancel/refund preview
  (`/api/billing/refund-preview`) now returns the raw `usage` counts, and the UI shows
  **Emails / WhatsApp / SMS / AI drafts sent this period** alongside the estimated refund.
  `billingMath` previously **omitted SMS from the usage cost**, so refunds were not fully
  cut by usage — SMS is now included (`usage.SMS_sent * UNIT_COSTS.SMS`). Usage recording
  itself was already correct (every send path calls `addUsage`).

### 7.3 Invoices — Edit icon + edit form (item 3) ✅
* Added a pencil **Edit** action on every invoice row. It pre-fills the existing invoice
  (including parsing the stored E.164 phone back into dial-code + national number) and
  reuses the create modal as an edit form. Submitting with an `id` performs an upsert that
  **preserves** server-managed fields (`status`, `sequence_id`, `sequence_paused`,
  `current_step_index`, `external_invoice_id`) instead of resetting them.

### 7.4 Gemini — faster, always-responding (item 4) ✅
* `GEMINI_MODEL_FALLBACKS` previously **led with non-existent model aliases**
  (`gemini-flash-latest`, `gemini-3-flash-preview`, `gemini-pro-latest`) that always
  failed first and added latency to every AI call. Reordered to fastest-first:
  `gemini-2.0-flash-lite` → `gemini-2.0-flash` → `gemini-1.5-flash` → `gemini-2.5-flash`
  → `gemini-1.5-pro`.
* Added `thinkingConfig: { thinkingBudget: 0 }` (no thinking time) and a 20s request
  timeout so every AI draft returns quickly and never hangs.

### 7.5 Automation at an exact region time (item 5) — FIXED ✅
**Root cause:** a sign error in `tzOffsetMs()` (`naiveUtc - Date.UTC(localParts)` instead
of `Date.UTC(localParts) - naiveUtc`). Every non-UTC timezone resolved to the **mirrored**
wrong UTC instant — e.g. “9pm Asia/Dhaka” resolved to **03:00 the next day UTC** instead of
15:00 UTC, so the schedule never fired at the chosen local time. Interval-based schedules
(minutely/hourly) were unaffected (they use elapsed-time math), which is exactly why
“every N minutes works but 9pm Dhaka doesn't”.
* Fixed the formula; verified with a standalone repro for Dhaka, New York, London, Sydney
  and UTC — all now resolve to the correct UTC instant. The cron worker + QStash re-arm
  already handled the rest correctly.

### 7.6 Pause automation + recovery flows (item 6) — FIXED ✅
* **Pause was impossible:** the `PUT /api/schedules/:id` handler ran full payload
  validation which **requires `template_id`**, but the pause toggle only sends
  `{ active: false }`. Validation rejected it with `TEMPLATE_REQUIRED`, so the button did
  nothing. Added an `active`-only toggle path that updates `active` directly (merging into
  the existing row) so pause/resume works for both automations and recovery schedules.

### 7.7 Security notes (item 7)
* Webhook signature verification (QuickBooks `Intuit-Signature`, Xero `x-xero-signature`,
  Paddle `paddle-signature`) all use `crypto.timingSafeEqual` with HMAC-SHA256 — good.
* QStash signature verification is the real Upstash JWT scheme (from prior change).
* All DB access goes through the Supabase client with parameterised `.eq()/.select()`
  builders (no string-concatenated SQL); the only raw SQL is the constant self-migration
  string, not user input.
* Fixed a **broken** payment-method verification email path that called undefined
  `sendEmail`/`otpSender` (would have thrown at runtime) — now uses `sendEmailViaResend`
  + `otpFromAddress()`.

## 8. Remaining / not-yet-done (for production)
- Paddle live charges still need real credentials (§4.7) — today they fall back
  to queued records, never mocked as paid.
- Stripe Connect & PayPal Connect OAuth flows need to be wired up in server.ts.
- Plan limits are enforced for emails/WhatsApp/SMS/AI/invoices per `plans.ts`;
  review `min_automation_interval_mins` per tier.


