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

// VERSION subido pra v7 (2026-09-02, mesmo dia — 3ª correção): navegação
// parou de ser interceptada (ver handler de 'navigate' abaixo) — precisa
// que os navegadores com SW antigo detectem a troca de novo.
const VERSION = 'v7';
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

  // Navegação: NÃO intercepta — deixa o navegador cuidar de verdade.
  //
  // BUG CRÍTICO CORRIGIDO (achado ao vivo em produção, 2026-09-02, 3
  // rodadas seguidas da MESMA classe de erro): duas tentativas anteriores
  // tentaram reconstruir a navegação interceptada como um fetch() manual
  // (primeiro só seguindo redirect, depois também preservando method/body
  // de POST) — as duas vezes reproduziu de novo ao vivo, numa aba anônima
  // limpa (sem cache/SW velho nenhum, então não era resíduo): a URL
  // avançava (History API) mas o conteúdo ficava preso na página anterior,
  // com "Cannot read properties of null (reading 'removeChild')" e um 504
  // sintético no console — mesmo em casos simples, sem locale, sem POST,
  // só um <Link> comum pra uma rota diferente. Reconstruir uma navegação
  // inteira manualmente dentro de um Service Worker (redirects, streaming
  // de RSC, headers do navegador que JS não consegue replicar 100% fiel)
  // é terreno conhecido por ter esse tipo de sutileza — três correções
  // pontuais seguidas reproduzindo de novo é sinal de que o problema é a
  // abordagem, não o detalhe. Só devolvia valor nenhuma diferença
  // perceptível hoje (não guardamos HTML nenhum — o App Router já renderiza
  // com o estado do usuário) e uma tela offline bonita quando a rede cai —
  // não vale o risco de quebrar toda navegação do site. Sem
  // event.respondWith() aqui, o próprio navegador processa a navegação
  // nativamente, sem o SW no meio — o mesmo comportamento 100% confiável
  // de sempre, de antes de existir Service Worker nenhum neste projeto.
  if (request.mode === 'navigate') {
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
