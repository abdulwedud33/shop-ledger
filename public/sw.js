/* Shop Ledger service worker: caches the app shell and static assets ONLY.
   It never caches API responses or anything user-specific (docs/security.md section 9);
   shop data lives in IndexedDB under the app's control and is wiped on sign out. */
const SHELL = 'sl-shell-v1';
const ROUTES = ['/', '/sell/', '/products/', '/customers/', '/customers/detail/', '/more/', '/reports/', '/sales/', '/team/', '/settings/', '/sync/', '/memory/', '/auth/', '/onboarding/', '/join/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => Promise.allSettled(ROUTES.map((r) => c.add(r)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sl-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API calls go straight to the network

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  // Pages: network first so updates arrive, fall back to the cached page, then to the home shell.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match(url.pathname.endsWith('/') ? url.pathname : url.pathname + '/')).then((hit) => hit || caches.match('/'))));
  }
});
