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

// VERSION subido pra v6 (2026-09-02, mesmo dia — 2ª correção): o fix do
// método/body em POST (ver comentário no handler de 'navigate' abaixo)
// também precisa que os navegadores com o SW antigo detectem a troca.
const VERSION = 'v6';
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

// Guarda no cache sem deixar rejeição solta. cache.put() falha para respostas
// parciais (206) e para alguns esquemas de URL, e uma promise rejeitada aqui
// sobe como erro do service worker no DevTools.
function guardarNoCache(request, response) {
  const copy = response.clone();
  caches
    .open(STATIC_CACHE)
    .then((cache) => cache.put(request, copy))
    .catch(() => {});
}

// respondWith() exige uma Response. Devolver undefined — o que acontecia
// quando o cache não tinha nada E a rede caía — vira "Failed to convert value
// to 'Response'". Este 504 sintético fecha esses caminhos.
function respostaOffline() {
  return new Response('', { status: 504, statusText: 'Offline' });
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
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request)
          .then((res) => {
            if (res.ok) guardarNoCache(request, res);
            return res;
          })
          .catch(() => respostaOffline());
      })
    );
    return;
  }

  // Navegação: sempre rede. Se cair, mostra a tela offline. Não guardamos o
  // HTML — no App Router ele já vem renderizado com o estado do usuário.
  //
  // BUG CORRIGIDO (achado ao vivo em produção, 2026-09-02): fetch(request)
  // reusando o Request de navegação original (mode: 'navigate') direto
  // falhava sempre que a navegação envolvia um redirect no meio do caminho
  // (ex.: proxy.ts redirecionando /login -> /es/login com base no cookie
  // tc_lang) — o Chrome rejeita esse fetch com TypeError em vez de seguir o
  // redirect, cai no .catch() e devolve o 504 sintético "Offline" mesmo com
  // a rede funcionando normalmente. Reproduzido ao vivo: a URL avançava
  // (History API), mas o conteúdo ficava preso na página anterior — o
  // router do Next tentava reconciliar uma resposta de erro, produzindo
  // "Cannot read properties of null (reading 'removeChild')" no console.
  // Construir uma Request NOVA (mode 'same-origin' por padrão, não
  // 'navigate') evita a restrição — mesmo padrão recomendado para Service
  // Workers que precisam refazer o fetch de uma navegação interceptada.
  if (request.mode === 'navigate') {
    // BUG CRÍTICO CORRIGIDO (achado ao vivo pelo usuário em produção,
    // 2026-09-02): a Request nova acima nunca copiava `method` nem `body`
    // — Request() sem esses campos assume GET silenciosamente, mesmo
    // quando a navegação original era um POST de verdade (ex.: o "Sair" do
    // admin em app/(admin)/layout.tsx é um <form method="post"
    // action="/auth/signout"> puro, sem JS — um form submit TAMBÉM é uma
    // navegação, mode:'navigate', interceptada aqui igual a um clique de
    // link). A rota (app/auth/signout/route.ts) só exporta POST; a versão
    // GET que este SW mandava batia em 405 sem nunca fazer logout nem
    // redirecionar — reproduzido ao vivo como ERR_FAILED no navegador. Body
    // só é copiado pra métodos que podem ter um (nunca GET/HEAD — o Fetch
    // spec proíbe) e exige `duplex: 'half'` quando o body é um stream, ou o
    // `new Request(...)` abaixo lança TypeError SÍNCRONO, fora do .catch()
    // — outra forma de produzir o mesmo ERR_FAILED, agora pra QUALQUER
    // navegação POST, se não declarado.
    const initNavegacao = {
      method: request.method,
      headers: request.headers,
      credentials: request.credentials,
      redirect: 'follow',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      initNavegacao.body = request.body;
      initNavegacao.duplex = 'half';
    }
    event.respondWith(
      fetch(new Request(request.url, initNavegacao)).catch(() =>
        caches.match(OFFLINE_URL).then((offline) => offline || respostaOffline())
      )
    );
    return;
  }

  // Demais estáticos de /public (imagens, ícones): cache-first com atualização.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') guardarNoCache(request, res);
          return res;
        })
        .catch(() => respostaOffline());
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
