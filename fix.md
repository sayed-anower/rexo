# Fix: Xero / QuickBooks Invalid Redirect URI

## Problem

When connecting Xero or QuickBooks, you see `redirect_uri_mismatch` error.

## Root Cause

The OAuth redirect URI sent to the provider was built from `APP_URL` (e.g. `http://localhost:3000`), but the registered callback URL in the provider console uses your production domain. The two URLs didn't match.

## How It Was Fixed

The `OAUTH_REDIRECT()` function in `server.ts` now derives the redirect URI from the **actual request host** (`x-forwarded-proto` + `Host` header) instead of `APP_URL`. This means:

- Whatever domain you browse on is exactly what gets sent to the provider
- The authorize request and token exchange always use the same URI
- The URI is stored in the OAuth `state` to prevent divergence

## What You Need to Do

### 1. Register the callback URL in each provider's console:

| Provider | Console URL | Redirect URI to Register |
|----------|-------------|--------------------------|
| Xero | developer.xero.com → Your App → Redirect URIs | `https://your-domain.com/api/oauth/callback` |
| QuickBooks | Intuit Developer → Your App → Keys & OAuth → Redirect URI | `https://your-domain.com/api/oauth/callback` |
| Google | console.cloud.google.com → Credentials → OAuth client | `https://your-domain.com/api/auth/google/callback` AND `https://your-domain.com/api/oauth/callback` |

### 2. Make sure `APP_URL` is set correctly in `.env`:

```bash
APP_URL="https://your-domain.com"
```

### 3. Ensure the registered URL matches EXACTLY:

- Same scheme (`https://` not `http://`)
- Same host (no `www` vs non-`www` mismatch)
- Same path (`/api/oauth/callback` — no trailing slash)

### 4. Deploy and test:

```bash
npm run build
npm start
```

Then try connecting Xero/QuickBooks from the Connectors page. The redirect URI mismatch error should be gone.

## Testing Locally

For local development, use a tunnel to get a public HTTPS URL:

```bash
ngrok http 3000
# or
npx localtunnel --port 3000
```

Then set `APP_URL` to the tunnel URL before starting the server.
