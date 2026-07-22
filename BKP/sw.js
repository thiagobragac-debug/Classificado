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
  
  // 1. DADOS DINÂMICOS (Modo Offline Agrícola para Anúncios e Imagens do Supabase)
  if (url.includes('supabase.co') || url.includes('/api/') ||
      url.includes('ipapi.co') || url.includes('freeipapi.com') ||
      url.includes('nominatim.openstreetmap.org')) {
    
    // Só cacheamos requisições de leitura (GET)
    if (e.request.method === 'GET') {
      e.respondWith(
        fetch(e.request).then(response => {
          // Salva uma cópia no cache dinâmico se a rede funcionar (Modo Offline)
          if (response.status === 200) {
            const resClone = response.clone();
            caches.open('tc-dynamic-v1').then(cache => {
              cache.put(e.request, resClone);
            });
          }
          return response;
        }).catch(() => {
          // Falhou (Offline na Fazenda) -> Tenta pegar do cache dinâmico!
          return caches.match(e.request);
        })
      );
    } else {
      // POST, PUT, DELETE (Inserir anúncio, enviar msg) -> Tenta rede normal
      e.respondWith(fetch(e.request));
    }
    return;
  }

  // 2. ARQUIVOS ESTÁTICOS E HTML
  const isHtml = e.request.headers.get('accept')?.includes('text/html');

  if (isHtml) {
    // HTML: Network First (Sempre tenta pegar a versão mais nova do servidor)
    e.respondWith(
      fetch(e.request).then((nr) => {
        if (nr && nr.status === 200) {
          const resClone = nr.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, resClone));
        }
        return nr;
      }).catch(() => {
        // Se a rede falhar, retorna o HTML em cache
        return caches.match(e.request);
      })
    );
  } else {
    // JS, CSS, Imagens: stale-while-revalidate (serve cache rápido + atualiza silenciosamente)
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
  }
});
