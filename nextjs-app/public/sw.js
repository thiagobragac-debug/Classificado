// ============================================================================
//  Tauze Class — Service Worker
// ============================================================================
//
//  Reescrito em 2026-08-22. A versão anterior era do site vanilla aposentado:
//  precacheava /index.html, /listagem.html, /js/main.js, /css/style.css e mais
//  16 URLs que hoje respondem 404 — 20 de 24 entradas. Sobreviviam a instalação
//  só porque cada cache.add() tinha .catch(), mas o resultado era uma rajada de
//  requisições falhas a cada install e praticamente nada de útil em cache.
//
//  Além disso ele interceptava /api/ e guardava as respostas GET, e cacheava
//  todo HTML — inclusive /painel e /admin, já renderizados com os dados da
//  sessão. Agora esses caminhos passam direto, sem cache.

const VERSION = 'v3';
const STATIC_CACHE = `tc-static-${VERSION}`;
const OFFLINE_URL = '/_offline.html';

// Só o que existe de fato em /public.
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => console.warn('[SW] precache falhou:', url))
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Caminhos que o SW nunca deve tocar: respostas dependentes de sessão ou de
// dados vivos. Servir qualquer uma delas do cache mostra estado errado.
function isBypass(url, request) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/painel') ||
    url.pathname.startsWith('/admin') ||
    // Payloads RSC de navegação client-side do App Router
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1'
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Terceiros (Supabase, gateways, CDNs) seguem direto para a rede: eles têm
  // as próprias regras de cache e podem carregar dados de sessão.
  if (url.origin !== self.location.origin) return;
  if (isBypass(url, request)) return;

  // Build do Next.js: nomes com hash, conteúdo imutável — cache-first é seguro.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navegação: sempre rede. Se cair, mostra a tela offline. Não guardamos o
  // HTML — no App Router ele já vem renderizado com o estado do usuário.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Demais estáticos de /public (imagens, ícones): cache-first com atualização.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────
self.addEventListener('push', function (event) {
  let data = { title: 'Tauze Class', body: 'Você tem uma nova notificação!' };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('Erro ao fazer parse do push data:', e);
  }

  const options = {
    body: data.body,
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: data.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(target));
});
