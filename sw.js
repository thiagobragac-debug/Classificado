const CACHE_NAME = 'tc-static-v205';

const ASSETS_TO_CACHE = [
  '/', '/index.html', '/listagem.html', '/anuncio.html', '/login.html',
  '/painel.html', '/anunciar.html', '/leiloes.html',
  '/css/style.css', '/css/listagem.css', '/css/anuncio.css', '/css/eventos.css',
  '/js/supabase.js', '/js/data.js', '/js/ui_constants.js', '/js/main.js',
  '/js/home.js', '/js/filters.js', '/js/search_autocomplete.js',
  '/js/eventos.js', '/js/error-monitor.js', '/manifest.json',
  '/assets/hero_farm.webp', '/assets/hero_farm.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        // Cache individual por asset: um 404 não aborta os demais
        Promise.all(
          ASSETS_TO_CACHE.map(url =>
            cache.add(url).catch(() => console.warn('[SW] Falha ao cachear:', url))
          )
        )
      )
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
  // Requisições dinâmicas: sempre tenta a rede, usa cache só como fallback offline
  if (url.includes('supabase.co') || url.includes('/api/') ||
      url.includes('ipapi.co') || url.includes('freeipapi.com') ||
      url.includes('nominatim.openstreetmap.org')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Estáticos: stale-while-revalidate (serve cache imediatamente + atualiza em background)
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
