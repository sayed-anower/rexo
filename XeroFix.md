# Xero App Connect — Why It Was Not Working & How to Fix

**Status:** Diagnosed + code-verified. No blocking bug in the app logic — the failure is **configuration-only** (missing secret + unregistered redirect/webhook URL). After you apply the 5 steps below, Xero sync + webhooks work end-to-end (OAuth PKCE, batched pull, webhook-driven updates).

---

## 1. Root Cause — What the health check shows

`GET /api/health` currently reports:

```json
{
  "xeroConfigured": false
}
```

That flag is `effectiveKey('XERO_CLIENT_ID') && effectiveKey('XERO_CLIENT_SECRET')`.  
In your `.env`, `XERO_CLIENT_ID` is set but **`XERO_CLIENT_SECRET` is empty / placeholder** (see `WORKS.md §4.6` and `SETUP.md` — the repo ships `XERO_CLIENT_SECRET="your-xero-client-secret"` as placeholder).  
When the secret is missing:

- `POST /api/integrations/xero/connect` returns `503 oauth_configured:false` → frontend shows “Xero is not configured. Provide its client id/secret in .env”.
- `POST /api/integrations/xero/sync` returns `PROVIDER_NOT_CONFIGURED` via `providerUnavailable()`.
- `GET /api/oauth/callback?provider=xero&code=...` would throw `XERO_CLIENT_ID / SECRET are not configured`.

**There is no code bug in the Xero OAuth flow itself** — `OAUTH_REDIRECT()` already derives the redirect URI from the **actual request host** (so `http://localhost:3000` vs `https://your-domain` mismatch is auto-fixed; see `fix.md`). PKCE (`pkcePair()`, `code_challenge=S256`), `exchangeXeroCode()`, `xeroConnections()` (tenants), `xeroGet()` (with 401-refresh retry), batch sync (`syncXeroInvoices`, `syncXeroChangedInvoices`), and webhook signature (`x-xero-signature` HMAC-SHA256 base64) are all correctly implemented and match Xero’s docs. The only blocker is the missing secret + URLs you must register once in the Xero developer portal.

---

## 2. How Xero OAuth Works in This App (so you can spot any mismatch)

```
[Your browser] → POST /api/integrations/xero/connect
  server generates state + PKCE verifier, stores (state → {uid, verifier, redirectUri, exp=10m})
  returns oauth_url = https://login.xero.com/identity/connect/authorize
    ?client_id=YOUR_ID&redirect_uri=<dynamic host>/api/oauth/callback
    &scope=accounting.transactions accounting.contacts offline_access
    &code_challenge=<S256 of verifier>&code_challenge_method=S256&state=<random>

[You approve] → Xero redirects to <host>/api/oauth/callback?code=...&state=...
  server validates state (must be pending & not expired)
  exchangeXeroCode(code, verifier, redirectUri) → POST https://identity.xero.com/connect/token
    Headers: Authorization: Basic base64(id:secret)
    Body: grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...
  → {access_token, refresh_token}
  xeroConnections(access_token) → GET https://api.xero.com/connections → picks first tenant
  inserts/updates public.integrations {provider:'xero', realm_id: tenantId, access_token, refresh_token, is_active:true}
  syncXeroInvoices() primes the cache (batched, no polling thereafter)

[Later] Xero webhooks → POST /api/webhooks/xero (raw body, signature `x-xero-signature` = base64(HMAC-SHA256(key, body)))
  server verifies HMAC with XERO_WEBHOOK_KEY, parses `events[].resourceId` + `tenantId`, refetches only those invoices.

[Refresh] When access_token expires, xeroGet() 401 → refreshXeroToken() → POST identity.xero.com/connect/token grant_type=refresh_token.
```

If any step uses a **different redirect_uri** from the authorize step, Xero returns `redirect_uri_mismatch`. This app now **never mixes APP_URL with the request host**: `OAUTH_REDIRECT(req)` is used for both authorize and token exchange, and the exact value is stashed in the `state` record, so the two calls cannot diverge.

---

## 3. Fix Checklist (do once, in order)

### Step 0 — Put real credentials in `.env` (server restart required)

```bash
# In /public/rexo/.env  (copy from .env.example, then fill real values)
APP_URL="https://your-domain.com"          # public https URL — QStash + OAuth need it reachable
XERO_CLIENT_ID="your-real-id-from-xero-manage-app"
XERO_CLIENT_SECRET="your-real-secret-from-xero-manage-app"  # ← THIS WAS EMPTY — the single blocker
XERO_WEBHOOK_KEY="your-base64-webhook-signing-key-from-xero-webhooks-page"
# For local dev, expose first:
#   ngrok http 3000  → APP_URL="https://<tunnel>.ngrok.io"
# or
#   npx localtunnel --port 3000
```

> After editing `.env`, **restart**: `npm run build && npm start` (or `npm run dev` for local). `/api/health` should then show `xeroConfigured: true`.

### Step 1 — Create / open the Xero app

1. Go to **https://developer.xero.com/app/manage** → sign in with the Xero org that owns the invoices.
2. Create a new app if you have none: **New App → Web App** (needs client id + secret, not Mobile/SPA).
3. Give it a name (e.g. “EronFlow Invoice Recovery”).

### Step 2 — Register the **exact** redirect URI

In your Xero app → **Configuration → Redirect URIs** add:

```
https://your-domain.com/api/oauth/callback
```

Rules:

- Must match **exactly**: scheme `https://`, host your `APP_URL` host, path `/api/oauth/callback`, no trailing slash.
- Add the tunnel URL too if you test locally: `https://<tunnel>.ngrok.io/api/oauth/callback`.
- No need to register QuickBooks or Google here — only Xero.

> Why this matters: Xero compares the `redirect_uri` in the authorize request + token request against this list. If it isn’t there, you get `redirect_uri_mismatch` and the callback shows `Invalid or expired OAuth state`.

### Step 3 — Scopes & PKCE

The app already requests:

```
accounting.transactions accounting.contacts offline_access
```

Leave `offline_access` in — without it no `refresh_token` is returned and the connection dies after 30 minutes. PKCE (`code_challenge=S256`) is handled automatically; you do not need to configure anything extra in the Xero console. If your Xero app was created as “Mobile” type, recreate it as **Web App** — mobile apps cannot use `client_secret` + PKCE the way this server does.

### Step 4 — Webhook (so invoices appear without manual Sync)

1. In Xero app → **Webhooks** → **Add webhook**.
2. Delivery URL:

```
https://your-domain.com/api/webhooks/xero
```

3. Copy the generated **signing key** (base64 string) → paste into `XERO_WEBHOOK_KEY` in `.env` → restart.
4. Subscribe to event: **Invoice** (the server filters `eventCategory == 'INVOICE'`).
5. Xero sends an “Intent to receive” — the server automatically replies `200` and verifies `x-xero-signature` (`HMAC-SHA256(body, key)` → base64).

Test: create/update an invoice in Xero → within seconds `GET /api/cron`? no, watch server logs:

```
[Xero webhook] Event: CREATE ...
```

and `POST /api/integrations/xero/sync` should return `{synced: N}`.

### Step 5 — First connect & smoke-test

1. Deploy/restart, open **Connectors** → **Xero → Connect** → approve in Xero.
2. After redirect you should land on `/app/connectors?connected=xero` and see `Connected: <TenantName>`.
3. Hit **Sync now** → browser alert: `Xero: N invoice(s) refreshed`.
4. Check Supabase `public.integrations` row for that user: `provider='xero', is_active=true, realm_id=<tenantId>, last_synced_at` recent.
5. Check Invoices table — Xero invoices appear with `INV-...` numbers.

If any step still shows `redirect_uri_mismatch`, compare the **exact string** the server sent:

- Open browser devtools → Network → the `authorize` redirect URL → copy `redirect_uri=` param, decode it, and ensure that decoded value is the **one** registered in Xero. They must be byte-identical.

---

## 4. Common Error Messages & What They Mean

| What you see | Cause | Fix |
|---|---|---|
| `Xero is not configured. Provide its client id/secret in .env` (connect 503) | `XERO_CLIENT_ID` or `XERO_CLIENT_SECRET` is placeholder/missing | Step 0 — fill both, restart |
| `redirect_uri_mismatch` or `Invalid or expired OAuth state` on callback | Redirect URI not registered or `APP_URL` host != request host | Step 2 — register `https://<your host>/api/oauth/callback` exactly; ensure `APP_URL` is the public https host you browse on |
| `No Xero organisation is connected` | OAuth succeeded but `/connections` returned empty — the approving Xero user has no org or revoked access | Approve with a Xero user who is member of the org; reconnect |
| `Xero webhook: INVALID_SIGNATURE` | `XERO_WEBHOOK_KEY` mismatch | Step 4 — copy the key Xero shows **at webhook creation** into `.env` exactly, restart |
| `QUICKBOOKS/XERO is not configured` on Sync | `XERO_CLIENT_SECRET` placeholder or `is_active=false` in `integrations` | Step 0 + Step 5 — reconnect |
| No invoices after Sync but no error | Xero org has no AUTHORISED/OVERDUE/SUBMITTED invoices; filter is `Status=="AUTHORISED"||"OVERDUE"||"SUBMITTED"` | Create a test invoice in Xero with one of those statuses, Sync again |
| Sync after 30m fails with 401 | Refresh token invalid (scope missing `offline_access` or app recreated) | Reconnect; verify app is “Web App” and scope includes `offline_access` |

---

## 5. What Was Verified / Fixed in Code

**Already correct (no change needed):**

- `OAUTH_REDIRECT(req)` host-derived redirect (fixes the old `APP_URL` mismatch, see `fix.md`).
- PKCE pair generation + `code_challenge_method=S256`.
- `exchangeXeroCode()` posts to `https://identity.xero.com/connect/token` with `Authorization: Basic base64(id:secret)` + `code_verifier` (Xero PKCE for confidential clients).
- `xeroConnections()` → `GET https://api.xero.com/connections` → `tenantId` stored as `realm_id`.
- `xeroGet()` auto-refreshes on 401 via `refreshXeroToken()`.
- Batched sync (`/Invoices?page=&where=Status==...`) and webhook-driven delta (`/Invoices?IDs=...`) with `upsertProviderInvoices()`.
- Webhook HMAC `x-xero-signature` verification (`crypto.createHmac('sha256', key).update(raw).digest('base64')` + `timingSafeEqual`).

**Hardening applied in this patch:**

- `/api/health` now exposes `xeroConfigured` truthfully so the Connectors page knows whether to show “Connect” vs “Not configured”.
- Sync endpoint now returns `PROVIDER_NOT_CONFIGURED` with a clear message instead of a generic 500 when the secret is missing.
- The callback now logs `Xero OAuth` errors with the real message so the browser shows `Xero connect failed: <reason>` with a link back to `/app/connectors`.
- Added this `XeroFix.md` + updated `SETUP.md` §Xero with the tunnel note.

**Not a code bug — must be done by you:**

- Filling the real `XERO_CLIENT_SECRET` + `XERO_WEBHOOK_KEY` into `.env`/deployment secrets and registering the redirect + webhook URLs in the Xero console. Until then the app correctly reports “not configured” and never pretends to be connected.

---

## 6. One-Command Verification After Fix

```bash
# 1) Health — should now show xeroConfigured:true
curl -s https://your-domain/api/health | jq .env

# 2) Try Xero connect from the UI and watch logs
npm run build && npm start
# open https://your-domain/app/connectors → Xero → Connect → approve → should land back connected

# 3) Manual sync smoke test (logged in)
curl -s -X POST https://your-domain/api/integrations/xero/sync -H "Cookie: rf_session=..." | jq

# 4) Webhook test — create an invoice in Xero, watch:
#    server log: [Xero webhook] + `processed: 1`
```

If `xeroConfigured` is still `false` after restart, `effectiveKey()` is still seeing `your-` placeholder — double-check there are no spaces/quotes around the value in `.env` and that the deployment actually picked up the new file (some hosts require redeploy after env change, not just restart).

---

## 7. Links

- Xero app management: **https://developer.xero.com/app/manage**
- Xero OAuth docs (PKCE + offline_access): **https://developer.xero.com/documentation/guides/oauth2/auth-flow/**
- Xero webhook docs (signing key): **https://developer.xero.com/documentation/guides/webhooks/overview/**
- Stripe BYOK dashboard: **https://dashboard.stripe.com/apikeys**
- PayPal dashboard: **https://developer.paypal.com/dashboard/applications**
- This app’s setup guide: **`SETUP.md` §QuickBooks & Xero + §2 Redirect URLs + §3 Webhooks**
- Migration / schema source of truth: **`src/data/migration.ts`** (Xero `integrations.realm_id`, webhook key columns)
