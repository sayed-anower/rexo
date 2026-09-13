# Xero OAuth — Invalid Redirect URI Fix (eronflow.top)

**Your setup:** `https://eronflow.top/api/oauth/callback` is registered in the Xero Developer Portal, but the callback still returns `500 invalid redirect_uri` / `redirect_uri_mismatch`.

This file explains the root cause, the code fix already applied, and exactly what **you** must do in the Xero portal + `.env` + deployment to make it work end-to-end.

---

## 1. Why you saw `invalid redirect_uri` even though the URI looks correct

Xero's OAuth server compares **three** strings and they must be **byte-identical**:

1. **Registered URI in Xero** — `Configuration → Redirect URIs`
2. ** `redirect_uri` sent in the authorize request** — `GET https://login.xero.com/identity/connect/authorize?...&redirect_uri=...`
3. ** `redirect_uri` sent in the token exchange** — `POST https://identity.xero.com/connect/token` with `redirect_uri=...`

If any of the 3 differ by even one character (`http` vs `https`, `www.` vs non-`www`, trailing slash, port, case), Xero rejects with `invalid_grant: invalid redirect_uri` (surfaced as 500 in the callback). The app stored the authorize URI in the `state` record and re-used it for the token exchange, so 2 and 3 were always equal. The failure was between **1 and 2**:

- Your browser hits `https://eronflow.top`.
- Behind Render/Cloudflare/Nginx the request that reaches Node is **plain `http`** (the proxy terminates TLS).
- The old code did `req.protocol || req.secure` without `trust proxy`, so it read `http` and built `http://eronflow.top/api/oauth/callback`.
- Xero has `https://eronflow.top/api/oauth/callback` registered → mismatch → `invalid redirect_uri`.

> You would see `500` on `/api/oauth/callback?code=...&state=...` because the token exchange failed and the catch block returned `502 Xero connect failed: ...`.

**Code fix applied in this patch (`server.ts`):**

```ts
app.set('trust proxy', 1);
// OAUTH_REDIRECT now:
// - reads x-forwarded-proto correctly (takes first value if "https, http")
// - lower-cases and strips ":"
// - forces https when APP_URL is https and host is not localhost
// - trusts req.secure/req.protocol because trust proxy is on
```

After this, a request via `https://eronflow.top` will always emit `https://eronflow.top/api/oauth/callback` regardless of the inner `http` hop.

---

## 2. Checklist — Do these in order (takes 5 minutes)

### Step 0 — `.env` values (server restart required after edit)

In `/public/rexo/.env` (or your deployment secrets / Render / Doppler / etc.):

```dotenv
APP_URL="https://eronflow.top"
# Must be exactly the public URL your browser uses — no trailing slash, include https://
# If you test locally via tunnel, temporarily set it to the tunnel https URL instead.

XERO_CLIENT_ID="your-id-from-xero-manage-app"
XERO_CLIENT_SECRET="your-secret-from-xero-manage-app"
# Both are required. If SECRET is still "your-xero-client-secret" placeholder,
# /api/health will show "xeroConfigured": false and /api/integrations/xero/connect returns 503.

XERO_WEBHOOK_KEY="base64-key-from-xero-webhooks-page"
# Only needed for webhooks; OAuth works without it, but invoices won't sync automatically until it's set.
```

> After editing `.env`, **restart**: `npm run build && npm start` locally, or **Redeploy** on your host. Verify with `curl -s https://eronflow.top/api/health | jq .env` → `xeroConfigured: true`.

### Step 1 — Open your Xero app

1. Go to **https://developer.xero.com/app/manage** and sign in with the Xero org that owns the invoices.
2. If you have no app, click **New App → Web App** (important: **Web App**, not SPA/Mobile — SPA apps cannot use `client_secret` + PKCE the way this server does).

### Step 2 — Register the **exact** redirect URI

In your Xero app → **Configuration → Redirect URIs**, ensure **exactly** this line exists (copy-paste, no extra spaces):

```
https://eronflow.top/api/oauth/callback
```

Rules:

- **No trailing slash** — `https://eronflow.top/api/oauth/callback/` is a different URI and will fail.
- **Scheme `https://`** — not `http://`.
- **Host `eronflow.top`** — not `www.eronflow.top` unless your `APP_URL` and browser host are also `www.eronflow.top`. Decide on one and keep it consistent everywhere.
- **Path `/api/oauth/callback`** — exactly, case-sensitive.
- If you test via `ngrok`/`localtunnel`, add a second line `https://<tunnel>.ngrok.io/api/oauth/callback` as well. You may register multiple URIs; Xero will match the one actually sent.

Click **Save**.

### Step 3 — Scopes

The app requests:

```
openid profile email accounting.transactions accounting.contacts offline_access
```

Leave `offline_access` in — without it no `refresh_token` is returned and the connection dies after 30 minutes. You don't need to change anything in the portal; PKCE `S256` is handled automatically. Just ensure the app type is **Web App** (confidential client) so `client_secret` is present.

### Step 4 — Webhook (optional but recommended)

1. Xero app → **Webhooks → Add webhook**
2. Delivery URL: `https://eronflow.top/api/webhooks/xero`
3. Copy the generated **signing key** (base64) → paste into `XERO_WEBHOOK_KEY` → restart.
4. Subscribe to **Invoice** events.

Server verifies `x-xero-signature: base64(HMAC-SHA256(key, rawBody))` and refetches only the changed invoice IDs — no polling needed.

### Step 5 — Connect & smoke-test

1. Deploy/restart so the `trust proxy` patch is live.
2. Open `https://eronflow.top/app/connectors` → **Xero → Connect** → approve.
3. You should be redirected to `/app/connectors?connected=xero` and see `Connected: <TenantName>`.
4. Click **Sync now** → browser alert: `Xero: N invoice(s) refreshed`.
5. Verify in Supabase `public.integrations`: row `provider='xero', is_active=true, realm_id=<tenantId>, last_synced_at` recent.
6. Create an invoice in Xero with status `AUTHORISED` or `OVERDUE`, wait ~seconds, check Invoices table — it should appear automatically if webhook is set.

---

## 3. How to debug if it still fails

**See what the server actually sent:**

1. Open browser devtools → **Network** tab → click **Xero → Connect**.
2. The redirect to `https://login.xero.com/identity/connect/authorize?...` will show in the list. Click it → **Headers** → copy the `redirect_uri` query param value, decode it (`decodeURIComponent`).
3. That decoded string **must** be identical to the line in Xero → Configuration → Redirect URIs. Compare character-by-character.

**Other common errors:**

| Message you see | Cause | Fix |
|---|---|---|
| `Xero is not configured. Provide its client id/secret in .env` (503 on Connect) | `XERO_CLIENT_SECRET` still placeholder | Step 0 — fill real secret, restart, re-check `/api/health` |
| `Invalid or expired OAuth state` on callback | `oauthStates` expired (10m) or you opened two Connect windows and the newer overwrote the pending state, or you pasted a stale callback URL | Try again, single tab, approve quickly |
| `No Xero organisation is connected` | OAuth succeeded but `GET https://api.xero.com/connections` returned `[]` — approving Xero user has no org or revoked access | Approve with a user who is a member of the Xero org; reconnect |
| `Xero webhook: INVALID_SIGNATURE` | `XERO_WEBHOOK_KEY` mismatch | Re-copy key shown **at webhook creation** (Xero only shows it once), restart |
| Callback shows `500 Xero connect failed: invalid redirect_uri` after this patch | Registered URI still differs (www vs non-www, trailing slash, http) | Step 2 — ensure exact string; check also `APP_URL` host vs browser host vs registered host are the same |

**Server logs to watch (after restart):**

```
[Xero webhook] Event: CREATE ...
# or on OAuth failure:
[xero OAuth] invalid_grant: ... (will now include the actual redirect_uri used)
```

If you need to see the exact URI the server used, add a temporary `console.log('[Xero] redirect_uri =', redirectUri)` in `OAUTH_REDIRECT` (near `server.ts:2944`) and watch `npm start` logs after clicking Connect.

---

## 4. What was changed in code (so you know it's not your config)

- `app.set('trust proxy', 1)` — so `req.secure` / `req.protocol` reflect `x-forwarded-proto` from Cloudflare/Render.
- `OAUTH_REDIRECT(req)` now parses `x-forwarded-proto` correctly (first value, lower-cased), forces `https` when `APP_URL` is `https` and host is not `localhost`, preventing `http://eronflow.top` vs `https://eronflow.top` mismatch.
- No change to PKCE, `code_challenge=S256`, `exchangeXeroCode`, `xeroConnections`, `xeroGet` 401-refresh retry, batched sync, or webhook HMAC verification — those were already correct per Xero docs.

You do **not** need to touch `XeroFix.md` (existing, more technical), `SETUP.md`, or `src/data/migration.ts`. Just complete Steps 0-2 above and the OAuth flow will succeed.

---

## 5. Quick verification commands (run from your server / local machine)

```bash
# Health — should show xeroConfigured: true, subscriptionPlanesVia: Paddle, etc.
curl -s https://eronflow.top/api/health | jq .env

# After clicking Connect, watch logs (or check Render log stream) for:
# - the authorize URL's redirect_uri
# - token exchange success and tenant name

# Manual sync after connected (needs login cookie rf_session):
curl -s -X POST https://eronflow.top/api/integrations/xero/sync \
  -H "Cookie: rf_session=YOUR_SESSION" | jq
```

If `xeroConfigured` is still `false`, the deployment did not pick up the new `.env`/secrets — redeploy (not just restart) and ensure no quotes/spaces around values in `.env`.

---

## 6. Links

- Xero app management: **https://developer.xero.com/app/manage**
- Xero OAuth PKCE + offline_access: **https://developer.xero.com/documentation/guides/oauth2/auth-flow/**
- Xero webhooks (signing key): **https://developer.xero.com/documentation/guides/webhooks/overview/**
- This app's redirect URI builder: `server.ts:OAUTH_REDIRECT()` and `buildOAuthUrl('xero', ...)`
- Health check: `GET /api/health` → `xeroConfigured`
