# Paddle 404 Fix

## Root Cause

The Paddle checkout API call is missing the `/v2` prefix in the endpoint path. The status poll endpoint correctly includes it, but checkout creation does not.

## The Bug

In `server.ts:3929`:

```typescript
// WRONG — missing /v2, Paddle returns 404
const apiRes = await paddleApi('/checkout/sessions', 'POST', payload);
```

This produces the URL `https://api.paddle.com/checkout/sessions` which does not exist.

## The Fix

Change line 3929 to:

```typescript
const apiRes = await paddleApi('/v2/checkout/sessions', 'POST', payload);
```

This produces the correct URL `https://api.paddle.com/v2/checkout/sessions`.

## Why It Happened

The status poll at line 5283 already uses the correct path:

```typescript
const apiRes = await paddleApi(`/v2/payment-requests/${encodeURIComponent(intent.id)}`, 'GET');
```

The `/v2` prefix was simply forgotten on the checkout creation call.

## How to Apply

Open `server.ts`, find line 3929, and change:

```
paddleApi('/checkout/sessions', 'POST', payload)
```

to:

```
paddleApi('/v2/checkout/sessions', 'POST', payload)
```

That single character change resolves the 404.
