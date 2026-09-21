/* Offline-first shell + guest browse cache + Web Push. Staff API GETs use app IndexedDB. */
const SHELL_CACHE = 'fajara-shell-v5';
const MENU_CACHE = 'fajara-guest-menu-v1';
const STATIC_CACHE = 'fajara-static-v1';
const SHELL = [
  '/',
  '/app/login',
  '/app/floor',
  '/app/orders',
  '/app/kitchen',
  '/app/checkout',
  '/app/menu',
  '/app/inventory',
  '/app/employees',
  '/app/reports',
  '/app/settings',
  '/app/dashboard',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          SHELL.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, MENU_CACHE, STATIC_CACHE]);
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
  return (
    url.pathname.startsWith('/m/') ||
    url.pathname.startsWith('/t/') ||
    url.pathname.startsWith('/guest')
  );
}

function isStaffAppPage(url) {
  return url.pathname === '/app' || url.pathname.startsWith('/app/');
}

function isNextStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      /\.(?:js|css|woff2?|png|svg|ico|webp)$/i.test(url.pathname))
  );
}

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api') ||
    (url.hostname.includes('localhost') && url.port === '4000') ||
    url.hostname.includes('onrender.com') ||
    url.hostname.includes('neon.tech')
  );
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

  // Staff/API JSON — app handles IndexedDB read cache; do not SW-cache auth'd APIs.
  if (isApiRequest(url)) {
    return;
  }

  // Next static assets + icons: cache-first after first fetch.
  if (isNextStatic(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // App shell + guest pages: network with cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (
          res.ok &&
          (isGuestPage(url) ||
            isStaffAppPage(url) ||
            req.mode === 'navigate')
        ) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then(
            (r) =>
              r ||
              caches.match('/app/floor') ||
              caches.match('/app/login') ||
              caches.match('/'),
          ),
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
