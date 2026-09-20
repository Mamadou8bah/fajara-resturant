/* Offline-first shell + guest browse cache + Web Push. Read-only — no write queue. */
const SHELL_CACHE = 'fajara-shell-v4';
const MENU_CACHE = 'fajara-guest-menu-v1';
const SHELL = ['/', '/app/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, MENU_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isGuestMenuApi(url) {
  return (
    url.pathname.includes('/guest/menu/') ||
    url.pathname.endsWith('/settings/public')
  );
}

function isGuestPage(url) {
  return url.pathname.startsWith('/m/') || url.pathname.startsWith('/guest');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Dynamic branded manifest — always prefer network.
  if (url.pathname.endsWith('manifest.webmanifest')) {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((r) => r || Response.error()),
      ),
    );
    return;
  }

  // Cache-first for guest menu / public settings (offline browse).
  if (isGuestMenuApi(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(MENU_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || Response.error()),
        ),
    );
    return;
  }

  // Skip other API / localhost API port — network only.
  if (
    url.pathname.startsWith('/api') ||
    (url.hostname.includes('localhost') && url.port === '4000')
  ) {
    return;
  }

  // Guest pages + app shell: network with cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (isGuestPage(url) || req.mode === 'navigate')) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((r) => r || caches.match('/app/login') || caches.match('/')),
      ),
  );
});

/** Prefer not to duplicate OS banners while a focused PWA tab is open. */
async function hasFocusedClient() {
  const list = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  return list.some((c) => c.visibilityState === 'visible' && c.focused);
}

self.addEventListener('push', (event) => {
  let data = {
    title: 'Fajara',
    body: '',
    url: '/',
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    (async () => {
      if (await hasFocusedClient()) return;
      await self.registration.showNotification(data.title || 'Fajara', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: data.url || '/' },
        tag: data.notificationId || data.type || undefined,
        renotify: Boolean(data.notificationId || data.type),
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || '/';
  const target = new URL(raw, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of list) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && client.url !== target) {
            try {
              await client.navigate(target);
            } catch {
              /* older browsers */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
