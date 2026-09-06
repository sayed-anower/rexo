/**
 * Paddle Billing Overlay helper — loads Paddle.js v2 and opens the checkout
 * as an in-page overlay (no new tab, no page refresh).
 *
 * Key behaviours:
 * - Detects light/dark theme from the app's persisted choice (localStorage `eron_theme`
 *   or the <html> `dark` class) and passes `theme: 'dark' | 'light'` to Paddle.
 * - Initializes Paddle with the public client token (live_…).
 * - Opens the checkout in overlay mode (responsive by default).
 * - Branding: Paddle's overlay has limited JS customization — logo / colours are
 *   configured in the Paddle Dashboard (Billing → Checkout → Branding). We pass
 *   `theme` + `locale` and set `displayMode: 'overlay'` so the checkout inherits
 *   our brand's light/dark mode. Paddle Dashboard branding (logo, primary colour)
 *   should be set to match EronFlow's palette (#2563EB / #0284C7) for a cohesive feel.
 * - Resolves only when Paddle reports `checkout.completed`; rejects/closes
 *   otherwise so callers can distinguish paid vs. cancelled.
 */

export type PaddleTheme = 'light' | 'dark';

function detectTheme(): PaddleTheme {
  if (typeof window === 'undefined') return 'light';
  // Primary: the app's ThemeToggle writes to localStorage and toggles <html>.dark
  const html = document.documentElement;
  if (html.classList.contains('dark')) return 'dark';
  const stored = localStorage.getItem('eron_theme');
  if (stored === 'dark') return 'dark';
  if (stored === 'light') return 'light';
  // Fallback to OS preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

let paddleLoadPromise: Promise<any> | null = null;
let paddleInstance: any = null;
let eventCallbackSetup = false;
let pendingCheckout: {
  transactionId?: string;
  onSuccess?: (data: any) => void;
  onClose?: () => void;
  onError?: (msg: string) => void;
} | null = null;

function isPaddleV2Loaded(): boolean {
  const Paddle = (window as any).Paddle;
  return Boolean(Paddle && typeof Paddle.Initialize === 'function' && typeof Paddle.Checkout?.open === 'function');
}

export async function loadPaddle(clientToken: string, environment: string = 'production'): Promise<any> {
  if (paddleInstance && isPaddleV2Loaded()) return paddleInstance;
  if (paddleLoadPromise) return paddleLoadPromise;

  paddleLoadPromise = new Promise((resolve, reject) => {
    // If script already present but wrong version (classic), remove it
    const existingClassic = document.querySelector('script[src*="checkout.paddle.com/js/paddle.js"]');
    if (existingClassic) existingClassic.remove();

    const existingV2 = document.querySelector('script[src*="cdn.paddle.com/paddle/v2/paddle.js"]');
    const PaddleAlready = (window as any).Paddle;

    const init = () => {
      try {
        const Paddle = (window as any).Paddle;
        if (!Paddle) throw new Error('Paddle.js failed to load');
        const env = String(environment).toLowerCase().includes('sandbox') ? 'sandbox' : 'production';
        if (typeof Paddle.Environment?.set === 'function') {
          Paddle.Environment.set(env);
        }
        if (!eventCallbackSetup) {
          Paddle.Initialize({
            token: clientToken,
            eventCallback: (event: any) => {
              const name = String(event?.name || '').toLowerCase();
              // Paddle Billing events: checkout.completed, checkout.closed, checkout.error
              if (name === 'checkout.completed' || name === 'checkout.comleted' || name === 'checkout_complete') {
                // Some versions use `event.data` with checkout id / transaction id
                const txId = event?.data?.transaction_id || event?.data?.id || event?.data?.checkout?.id;
                // If pendingCheckout, resolve it
                if (pendingCheckout?.onSuccess) {
                  const cb = pendingCheckout.onSuccess;
                  pendingCheckout = null;
                  cb(event);
                }
              } else if (name === 'checkout.closed' || name === 'checkout_closed') {
                // User closed overlay without completing — treat as cancel
                // Don't fire onSuccess if already handled
                if (pendingCheckout?.onClose) {
                  const cb = pendingCheckout.onClose;
                  // delay a bit to allow completed to fire first
                  setTimeout(() => {
                    if (pendingCheckout) {
                      const c = pendingCheckout.onClose;
                      pendingCheckout = null;
                      c?.();
                    }
                  }, 500);
                  // We'll handle close after a short delay, but if completed already cleared, do nothing
                } else if (pendingCheckout) {
                  // No specific close handler, just clear
                  // Keep pending for timeout handling
                }
              } else if (name === 'checkout.error') {
                const msg = event?.data?.error?.detail || event?.data?.message || 'Paddle checkout error';
                if (pendingCheckout?.onError) {
                  const cb = pendingCheckout.onError;
                  pendingCheckout = null;
                  cb(msg);
                }
              }
            },
          });
          eventCallbackSetup = true;
        } else {
          // Already initialized — just ensure token matches? Re-init not needed
        }
        paddleInstance = Paddle;
        resolve(Paddle);
      } catch (e) {
        reject(e);
      }
    };

    if (existingV2 && PaddleAlready && isPaddleV2Loaded()) {
      try {
        init();
        return;
      } catch {
        // fall through to reload
      }
    }

    if (existingV2) {
      // Script tag exists but Paddle not ready — wait for load
      (existingV2 as HTMLScriptElement).addEventListener('load', init, { once: true });
      (existingV2 as HTMLScriptElement).addEventListener('error', () => reject(new Error('Failed to load Paddle.js')), { once: true });
      // If already loaded and Paddle exists, init now
      if (PaddleAlready) setTimeout(init, 0);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => init();
    script.onerror = () => reject(new Error('Failed to load Paddle.js — check network/CSP'));
    document.head.appendChild(script);
  });

  return paddleLoadPromise;
}

// Public helper: open the checkout overlay for a Paddle transaction id.
// Returns a promise that resolves on `checkout.completed`, rejects on error,
// and resolves with `{ closed: true }` when the overlay is closed without payment.
export async function openPaddleOverlay(opts: {
  transactionId: string;
  clientToken: string;
  environment?: string;
  customerEmail?: string;
  theme?: PaddleTheme;
  locale?: string;
}): Promise<{ completed: boolean; closed?: boolean; data?: any }> {
  const { transactionId, clientToken, environment = 'production', customerEmail, locale = 'en' } = opts;
  const theme: PaddleTheme = opts.theme || detectTheme();

  if (!transactionId) throw new Error('Paddle transaction is missing');
  if (!clientToken) throw new Error('Paddle client token is missing — set PADDLE_CLIENT_TOKEN');

  const Paddle = await loadPaddle(clientToken, environment);

  // Brand-aligned settings: overlay mode, theme follows app, locale en.
  // Paddle's JS only allows theme/locale/displayMode; colours/logo are set in Dashboard.
  // We keep the overlay responsive (Paddle handles it) and set a few sensible defaults.
  const settings: Record<string, unknown> = {
    displayMode: 'overlay',
    theme,
    locale,
    allowLogout: false,
    // Use overlay variant; 'one-page' keeps all fields on one scrollable sheet (good for mobile)
    variant: 'one-page',
    // Frame styling is controlled by Paddle, but we ensure the iframe can use our brand
    // colours via the Dashboard. The inline styles below document the brand tokens.
    // --eron brand: primary #2563EB, accent #0284C7, surface #FFFFFF / #0F172A
  };

  return new Promise((resolve, reject) => {
    let completed = false;
    let closedHandled = false;

    pendingCheckout = {
      transactionId,
      onSuccess: (data) => {
        completed = true;
        resolve({ completed: true, data });
      },
      onClose: () => {
        if (closedHandled) return;
        closedHandled = true;
        if (!completed) {
          resolve({ completed: false, closed: true });
        }
      },
      onError: (msg) => {
        reject(new Error(msg));
      },
    };

    try {
      // For Billing, open by transactionId. The transaction already has items + custom_data + customer.
      // We also pass settings for overlay theming; customer email is optional (transaction already exists).
      // If customerEmail is provided and transaction has no customer, Paddle will prefill.
      const openArgs: Record<string, unknown> = {
        transactionId,
        settings,
      };
      // Some Paddle versions accept `customer` at open time to prefill even when transaction exists
      if (customerEmail) {
        (openArgs as any).customer = { email: customerEmail };
      }

      // Ensure Paddle.Checkout is available
      if (!Paddle.Checkout || typeof Paddle.Checkout.open !== 'function') {
        throw new Error('Paddle.Checkout is not available');
      }

      Paddle.Checkout.open(openArgs as any);

      // Fallback: if Paddle doesn't fire checkout.closed, we still resolve on manual close
      // Paddle's overlay adds a backdrop; clicking outside fires checkout.closed via eventCallback above.
      // As a safety net, reset pending after 30 minutes to avoid dangling promise.
      setTimeout(() => {
        if (pendingCheckout && !completed && !closedHandled) {
          pendingCheckout = null;
          resolve({ completed: false, closed: true });
        }
      }, 30 * 60 * 1000);
    } catch (e: any) {
      pendingCheckout = null;
      reject(e);
    }
  });
}

// Helper to fetch Paddle config from the server (exposes public token safely)
export async function fetchPaddleConfig(): Promise<{ configured: boolean; clientToken?: string; environment: string; vendorId?: string }> {
  const res = await fetch('/api/billing/paddle-config', { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || 'Could not load Paddle config');
  }
  return res.json();
}

// Utility: get theme for display (used for debugging / preview)
export function getCurrentTheme(): PaddleTheme {
  return detectTheme();
}
