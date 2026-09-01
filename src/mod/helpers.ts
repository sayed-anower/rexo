// ==========================================
// HELPERS: CONFIG, KEYS & PLACEHOLDER DETECTION
// ==========================================
import type { Response } from 'express';

export function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  const t = v.trim().toLowerCase();
  return (
    t === '' ||
    t.includes('your-') ||
    t.startsWith('my_') ||
    t.includes('my_app') ||
    t === 'sk_test_123456' ||
    t === 'whsec_123456'
  );
}

export function appUrl(): string {
  const u = process.env.APP_URL || 'http://localhost:3000';
  return isPlaceholder(u) ? 'http://localhost:3000' : u.replace(/\/$/, '');
}

// Payment links are stored relative ("/pay/<id>") but every message template
// variable must expand to a clickable public portal URL, so always absolutize
// against APP_URL before rendering into an email / WhatsApp / SMS message.
export function absolutePaymentLink(link: string | undefined | null): string {
  const raw = String(link || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${appUrl()}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export function effectiveKey(envName: string): string | undefined {
  const v = process.env[envName];
  return isPlaceholder(v) ? undefined : v;
}

export function providerUnavailable(res: Response, provider: string): Response {
  return res.status(503).json({
    error: 'PROVIDER_NOT_CONFIGURED',
    provider,
    message: `${provider} is not configured. Add a real (test or live) API key in .env. No mock/demo fallback is used.`,
  });
}