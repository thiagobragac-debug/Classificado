const CACHE_NAME = 'tc-static-v201';

const ASSETS_TO_CACHE = [
  '/','/index.html','/listagem.html','/anuncio.html','/login.html',
  '/css/style.css','/css/listagem.css','/css/anuncio.css','/css/eventos.css',
  '/js/supabase.js','/js/data.js','/js/ui_constants.js','/js/main.js',
  '/js/home.js','/js/filters.js','/js/search_autocomplete.js',
  '/js/eventos.js','/js/error-monitor.js','/manifest.json',
  '/assets/hero_farm.webp','/assets/hero_farm.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch(err => console.warn('PWA Install Error:', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (url.includes('supabase.co') || url.includes('/api/') ||
      url.includes('ipapi.co') || url.includes('freeipapi.com') ||
      url.includes('nominatim.openstreetmap.org')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((nr) => {
        if (nr && nr.status === 200 && nr.type !== 'opaque') {
          caches.open(CACHE_NAME).then((c) => c.put(e.request, nr.clone()));
        }
        return nr;
      }).catch(() => null);
      return cached || fetchPromise;
    })
  );
});
