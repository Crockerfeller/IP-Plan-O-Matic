/* IP Plan-O-Matic service worker: makes the app work offline.
   The deploy (tools/build_site.py) writes the commit hash into CACHE, so every build gets a fresh cache and the
   old one is deleted when the new worker activates. */
const CACHE = 'ipom-%%BUILD_SHA%%';
const SHELL = [
  './',
  './index.html',
  // The page asks for these with its build in ?v=, so a new page never gets an old copy from the cache.
  './app.css?v=%%BUILD_SHA%%',
  './js/core.js?v=%%BUILD_SHA%%',
  './js/plan.js?v=%%BUILD_SHA%%',
  './js/vlsm.js?v=%%BUILD_SHA%%',
  './js/networks.js?v=%%BUILD_SHA%%',
  './js/tools.js?v=%%BUILD_SHA%%',
  './js/export-formats.js?v=%%BUILD_SHA%%',
  './js/export.js?v=%%BUILD_SHA%%',
  './js/visualize.js?v=%%BUILD_SHA%%',
  './js/import.js?v=%%BUILD_SHA%%',
  './js/hosts.js?v=%%BUILD_SHA%%',
  './js/compare.js?v=%%BUILD_SHA%%',
  './js/ipv6.js?v=%%BUILD_SHA%%',
  './js/main.js?v=%%BUILD_SHA%%',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.ico',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './fonts/fonts.css',
  './fonts/space-grotesk-600-latin.woff2',
  './fonts/jetbrains-mono-400-latin.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putIn = (name, req, res) => caches.open(name).then((c) => c.put(req, res));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // A script asking for a fresh copy (the new-build check) goes straight to the network.
  // Navigations still go through below, so a page always has its offline fallback.
  if (req.mode !== 'navigate' && (req.cache === 'reload' || req.cache === 'no-store')) return;
  const url = new URL(req.url);

  // Anything else off-site goes straight to the network.
  if (url.origin !== self.location.origin) return;
  // The build's version file and download are never served from the cache.
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('.zip')) return;

  // Pages: network first so a new deploy shows up right away, cached copy when offline.
  // Only the app page itself is stored as the offline app; other pages (the guides) are cached under their own URL.
  if (req.mode === 'navigate') {
    const scope = new URL(self.registration.scope);
    const isApp = url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
    const key = isApp ? './index.html' : url.origin + url.pathname;
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) putIn(CACHE, key, res.clone());
      return res;
    }).catch(() => caches.match(key).then((hit) => hit || caches.match('./index.html'))));
    return;
  }

  // Icons and other same-origin files: serve from cache, refresh in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res.ok) putIn(CACHE, req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
