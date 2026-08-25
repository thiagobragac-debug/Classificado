import React from 'react'
import { cookies } from 'next/headers'
import { createAnonClient } from '@/lib/supabase-server'
import { t as _t } from '@/lib/constants'
import EventCard, { AuctionEvent } from './EventCard'
import EventSearch from './EventSearch'
import Link from 'next/link'

// Achado do teste completo do site (2026-08-24) sobre "loading.tsx duplicado
// no DOM" foi investigado e descartado: é o marcador de streaming SSR do
// React (<!--$?--> + <template id="B:0">) aparecendo normalmente no HTML
// cru (curl, sem JS) — o navegador real resolve e remove o fallback na
// hidratação (confirmado ao vivo: exatamente 2 <main>, sem skeleton, depois
// de navegar de verdade). O agente de teste capturou isso numa aba que não
// estava sendo composta visualmente (document.hidden=true), mesma classe de
// falso alarme já documentada nesta sessão para outras leituras de DOM.
export const revalidate = 3600; // ISR — página de eventos raramente muda

export const metadata = {
  title: 'Agenda de Eventos',
  description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul. Agenda completa de eventos rurais no Brasil, Argentina, Paraguai e Uruguai.',
  alternates: { canonical: 'https://tauzeclass.com.br/eventos' },
  openGraph: {
    title: 'Agenda de Eventos | Tauze Class',
    description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul.',
    url: 'https://tauzeclass.com.br/eventos',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: 'https://tauzeclass.com.br/assets/og-home.jpg', width: 1200, height: 630, alt: 'Agenda de Eventos Agro | Tauze Class' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agenda de Eventos | Tauze Class',
    description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul.',
    images: ['https://tauzeclass.com.br/assets/og-home.jpg'],
  },
}

function escapeJsonLd(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // BUG CORRIGIDO (teste completo do site, 2026-08-24): página inteira
  // ficava fixa em português mesmo com ES selecionado no header — o
  // componente nunca lia o cookie de idioma nem chamava t().
  const cookieStore = await cookies()
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es'
  const t = (key: string) => _t(key, lang)

  const query = await searchParams
  // Sanitizar e limitar comprimento da query de busca
  const rawSearch = typeof query?.q === 'string' ? query.q : ''
  const searchQuery = rawSearch.trim().slice(0, 100) // máximo 100 chars

  const sb = createAnonClient();

  let events: AuctionEvent[] = []

  try {
    // Selecionar as colunas necessárias para renderização correta
    let qAuctions = sb.from('auction_events')
      .select('id, title, date, cover, status')
      .neq('status', 'draft')
      .limit(50)

    let qEventos = sb.from('eventos')
      .select('id, title, date, image, location_str')
      .limit(50)

    if (searchQuery) {
      qAuctions = qAuctions.ilike('title', `%${searchQuery}%`)
      qEventos = qEventos.ilike('title', `%${searchQuery}%`)
    }

    const [resAuctions, resEventos] = await Promise.all([qAuctions, qEventos])

    if (resAuctions.error) throw resAuctions.error
    if (resEventos.error) throw resEventos.error

    const normalizedAuctions = (resAuctions.data || []).map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      cover: a.cover,
      status: a.status,
      location: undefined
    }));

    const normalizedEventos = (resEventos.data || []).map(e => ({
      id: e.id,
      title: e.title,
      date: e.date,
      cover: e.image,
      location: e.location_str
    }));

    events = [...normalizedAuctions, ...normalizedEventos];

    // BUG CORRIGIDO (teste completo do site, 2026-08-24): ordenação puramente
    // ascendente por data colocava um leilão encerrado com data já passada
    // (ex: fechado há 2 semanas) na FRENTE de eventos futuros reais em
    // "Grandes Destaques Nacionais", só porque uma data passada é
    // numericamente "menor" que uma futura. Eventos já ocorridos (data válida
    // e no passado) agora vão para o final da lista, sem deixar de aparecer.
    const now = Date.now();

    // BUG CORRIGIDO (reteste do site, 2026-08-25): a correção acima só
    // funcionava pra auction_events (data ISO) — o byDate/isPast originais
    // caíam direto no fallback "now+1dia" pra qualquer data da tabela
    // `eventos`, porque é texto livre em português (ex: "28 de Abril a 06
    // de Maio", "2 - 6 fev 2026") que `new Date(...)` não consegue
    // parsear. Resultado: toda "feira" ficava sempre no bucket "upcoming"
    // com o mesmo valor de fallback, mantendo a ordem de inserção em vez
    // da ordem real por data — feiras já passadas continuavam aparecendo
    // antes de eventos futuros de verdade. parseEventDate tenta ISO
    // primeiro; se falhar, extrai o primeiro dia+mês do texto livre (mesmo
    // padrão de regex já usado em EventCard.tsx pra exibição) e assume o
    // ano corrente, com heurística de virada de ano pra meses "passados"
    // que na verdade são do ano seguinte.
    const MESES: Record<string, number> = {
      jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
      jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
    };
    const parseEventDate = (dateStr: string): number => {
      const iso = new Date(dateStr).getTime();
      if (!isNaN(iso)) return iso;

      // \D*? (não-greedy) é essencial aqui: com \D+ (greedy) o backtracking
      // do regex casava "ril" em vez de "Abril" pra datas tipo "28 de Abril
      // a 06 de Maio" (a busca greedy consome tudo e recua de trás pra
      // frente até achar 3+ letras, o que pode acertar o MEIO da palavra do
      // mês em vez do início) — "ril" não existe no mapa MESES, a data
      // inteira caía no fallback e a ordenação ficava errada.
      const match = dateStr.match(/(\d{1,2})\D*?([a-zA-Zç]{3,})/i);
      if (!match) return NaN;
      const day = parseInt(match[1], 10);
      const monthKey = match[2].toLowerCase().slice(0, 3);
      const month = MESES[monthKey];
      if (month === undefined || isNaN(day)) return NaN;

      const yearMatch = dateStr.match(/\b(20\d{2})\b/);
      const currentYear = new Date(now).getFullYear();
      let year = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;

      let parsed = new Date(year, month, day).getTime();
      // Sem ano explícito no texto e a data "já passou" há mais de 6 meses:
      // provavelmente é do ano seguinte (ex.: em dezembro, "12 de Janeiro"
      // é do ano que vem, não já ocorrido há quase um ano).
      if (!yearMatch && parsed < now - 180 * 86400000) {
        parsed = new Date(year + 1, month, day).getTime();
      }
      return parsed;
    };

    const byDate = (a: AuctionEvent, b: AuctionEvent) => {
      const timeA = parseEventDate(a.date);
      const timeB = parseEventDate(b.date);
      const validA = !isNaN(timeA) ? timeA : now + 86400000;
      const validB = !isNaN(timeB) ? timeB : now + 86400000;
      return validA - validB;
    };
    const isPast = (ev: AuctionEvent) => {
      const t = parseEventDate(ev.date);
      return !isNaN(t) && t < now;
    };
    const upcoming = events.filter(e => !isPast(e)).sort(byDate);
    const past = events.filter(isPast).sort(byDate);
    events = [...upcoming, ...past];

  } catch (err) {
    console.error('Erro ao carregar eventos:', err)
  }

  const ORGANIZER = {
    '@type': 'Organization',
    name: 'Tauze Class',
    url: 'https://tauzeclass.com.br',
  } as const;

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': events.map(ev => {
      let startDateStr = ev.date;
      let endDateStr = ev.date;
      const parsedDate = new Date(ev.date);

      if (!isNaN(parsedDate.getTime())) {
        startDateStr = parsedDate.toISOString();
        endDateStr = new Date(parsedDate.getTime() + 4 * 60 * 60 * 1000).toISOString();
      } else {
        // Se a data for texto, usa fallback pra hoje (necessário para o JSON-LD ser válido)
        const fallback = new Date();
        startDateStr = fallback.toISOString();
        endDateStr = new Date(fallback.getTime() + 86400000).toISOString();
      }

      const isOnline = !ev.location || ev.location.toLowerCase().includes('online');
      return {
        '@type': 'Event',
        name: ev.title,
        startDate: startDateStr,
        endDate: endDateStr,
        url: `https://tauzeclass.com.br/eventos/${ev.id}`,
        eventAttendanceMode: isOnline
          ? 'https://schema.org/OnlineEventAttendanceMode'
          : 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: isOnline
          ? { '@type': 'VirtualLocation', url: `https://tauzeclass.com.br/eventos/${ev.id}` }
          : {
              '@type': 'Place',
              name: ev.location || 'Local do Evento',
              address: {
                '@type': 'PostalAddress',
                addressLocality: ev.location || 'Brasil',
                addressCountry: 'BR',
              },
            },
        description: ev.description || ev.title,
        image: ev.cover
          ? ev.cover.startsWith('http')
            ? ev.cover
            : `https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ad-images/${ev.cover}`
          : 'https://tauzeclass.com.br/assets/hero_farm.webp',
        organizer: ORGANIZER,
      };
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLdGraph) }}
      />
      <main className="flex-1 pb-16" style={{ marginTop: 'var(--header-h)', background: 'var(--clr-bg-alt)' }}>
        <div className="list-hero" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
          <div className="container">
            <div className="list-hero-inner">
              <div>
                <nav aria-label="Breadcrumb" className="breadcrumb">
                  <Link href="/">{t('nav_home')}</Link>
                  <span aria-hidden="true">›</span>
                  <span aria-current="page">{t('events_title')}</span>
                </nav>
                <h1 className="list-hero-title">{t('events_title')}</h1>
                <p className="list-hero-count">{t('events_subtitle')}</p>
              </div>

              <EventSearch lang={lang} />
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 'var(--sp-6)' }}>
          <div className="events-section">
            <h2 className="section-title">{t('events_highlights')}</h2>

            {events.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">
                  {t('events_empty')}{searchQuery ? ` para "${searchQuery}"` : ''}.
                </p>
                {searchQuery && (
                  <Link href="/eventos" className="text-green-600 hover:underline font-medium">
                    {t('events_clear_search')}
                  </Link>
                )}
              </div>
            ) : (
              <div className="events-grid">
                {events.map((ev) => (
                  <EventCard key={ev.id} ev={ev} lang={lang} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
