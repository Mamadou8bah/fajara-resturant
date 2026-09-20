/** PWA / Web Push helpers (staff + guest, including iOS Home Screen). */

const DISMISS_INSTALL_KEY = 'fajara_push_install_dismissed';
const DISMISS_ENABLE_KEY = 'fajara_push_enable_dismissed';
const ENABLED_KEY = 'fajara_push_enabled';

export function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOs =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOs;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const legacy = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return mq || legacy;
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iOS only allows Web Push from an installed Home Screen PWA. */
export function canRequestPushPermission(): boolean {
  if (!pushSupported()) return false;
  if (isIos() && !isStandalonePwa()) return false;
  return true;
}

export function shouldShowIosInstallPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isIos()) return false;
  if (isStandalonePwa()) return false;
  if (localStorage.getItem(DISMISS_INSTALL_KEY) === '1') return false;
  if (localStorage.getItem(ENABLED_KEY) === '1') return false;
  return true;
}

export function shouldShowEnablePrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!canRequestPushPermission()) return false;
  if (Notification.permission === 'granted') {
    // Already granted — may still need to re-register subscription.
    if (localStorage.getItem(ENABLED_KEY) === '1') return false;
    return true;
  }
  if (Notification.permission === 'denied') return false;
  if (localStorage.getItem(DISMISS_ENABLE_KEY) === '1') return false;
  return true;
}

export function dismissInstallPrompt() {
  localStorage.setItem(DISMISS_INSTALL_KEY, '1');
}

export function dismissEnablePrompt() {
  localStorage.setItem(DISMISS_ENABLE_KEY, '1');
}

export function markPushEnabled() {
  localStorage.setItem(ENABLED_KEY, '1');
  localStorage.removeItem(DISMISS_ENABLE_KEY);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushAudience =
  | { kind: 'staff' }
  | { kind: 'guest'; guestId: string; deviceToken: string };

async function fetchVapidPublicKey(): Promise<string | null> {
  const { api } = await import('@/lib/api');
  const res = await api<{ enabled: boolean; publicKey: string | null }>(
    '/notifications/push/vapid-public-key',
    { public: true },
  );
  if (!res.enabled || !res.publicKey) return null;
  return res.publicKey;
}

export async function enableWebPush(audience: PushAudience): Promise<boolean> {
  if (!canRequestPushPermission()) return false;

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return false;
  }

  const { api } = await import('@/lib/api');
  const body = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };

  if (audience.kind === 'staff') {
    await api('/notifications/push/subscribe', { method: 'POST', body });
  } else {
    await api('/notifications/push/subscribe/guest', {
      method: 'POST',
      public: true,
      body: {
        ...body,
        guestId: audience.guestId,
        deviceToken: audience.deviceToken,
      },
    });
  }

  markPushEnabled();
  return true;
}

/** Quietly refresh subscription after login / join when already enabled. */
export async function refreshWebPushIfEnabled(
  audience: PushAudience,
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!canRequestPushPermission()) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem(ENABLED_KEY) !== '1') return;
  try {
    await enableWebPush(audience);
  } catch {
    /* ignore refresh failures */
  }
}
