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

// VERSION subido pra v9 (2026-09-02, mesmo dia — 5ª correção): o handler
// de 'fetch' parou de interceptar QUALQUER coisa da aplicação (ver
// comentário logo abaixo) — precisa que os navegadores com SW antigo
// detectem a troca de novo.
const VERSION = 'v9';
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

// BUG CRÍTICO CORRIGIDO (achado ao vivo pelo usuário em produção,
// 2026-09-02, 4 rodadas seguidas da MESMA classe de erro — navegação
// travando com "Cannot read properties of null (reading 'removeChild')").
// As 3 tentativas anteriores foram reduzindo gradualmente o que o SW
// interceptava (só navegação → parar de reconstruir navegação → tentar
// reconhecer melhor requisição de roteamento do App Router) e a cada
// rodada o MESMO sintoma voltava, só que num caminho um pouco diferente
// — confirmado ao vivo pela 4ª vez, agora com prova concreta pela aba
// Network: a própria requisição de navegação (`login?_rsc=...`) tinha
// sucesso e devolvia o payload RSC certo, mas vários dos chunks JS que
// aquele payload referencia (carregados em seguida, também via
// /_next/static/) apareciam duplicados com falha/retry na lista — ou
// seja, o cache-first deste SW para /_next/static/ também era instável
// o bastante pra derrubar o carregamento de uma página inteira. Com o
// Service Worker temporariamente desligado (DevTools → "Bypass for
// network"), o mesmo clique nunca falhou.
//
// Next.js já nomeia esses arquivos com hash de conteúdo e manda
// `Cache-Control: public, max-age=31536000, immutable` — o cache HTTP
// nativo do navegador já faz isso perfeitamente sozinho, sem nenhuma
// ajuda de Service Worker. Depois de 4 rodadas tentando acertar os
// detalhes de quando/como interceptar sem quebrar nada, a conclusão é
// que NENHUMA interceptação de fetch da aplicação (navegação OU
// estáticos do build) vale o risco — só resta precache (instalação) e
// push notifications, que nunca fizeram parte deste problema.
self.addEventListener('fetch', () => {});

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
