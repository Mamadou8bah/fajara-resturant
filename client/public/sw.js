/* Offline-first shell + guest browse cache. Read-only — no write queue. */
const SHELL_CACHE = 'fajara-shell-v3';
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
