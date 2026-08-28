import React from 'react'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { createAnonClient } from '@/lib/supabase-server'
import { t as _t } from '@/lib/constants'
import { parseEventDate } from '@/lib/event-date'
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

// BUG CORRIGIDO (auditoria de i18n, 2026-08-27): metadata estática nunca lia
// tc_lang — título da aba e meta description/OG/Twitter ficavam sempre em
// português mesmo com ES selecionado. Mesmo padrão de generateMetadata já
// usado em app/(public)/eventos/[id]/page.tsx.
export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt') as 'pt' | 'es';

  const META = {
    pt: {
      title: 'Agenda de Eventos',
      description: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul. Agenda completa de eventos rurais no Brasil, Argentina, Paraguai e Uruguai.',
      ogTitle: 'Agenda de Eventos | Tauze Class',
      ogDescription: 'Encontre feiras, exposições e congressos do Agronegócio no Mercosul.',
      ogAlt: 'Agenda de Eventos Agro | Tauze Class',
    },
    es: {
      title: 'Agenda de Eventos',
      description: 'Encuentra ferias, exposiciones y congresos del Agronegocio en el Mercosur. Agenda completa de eventos rurales en Brasil, Argentina, Paraguay y Uruguay.',
      ogTitle: 'Agenda de Eventos | Tauze Class',
      ogDescription: 'Encuentra ferias, exposiciones y congresos del Agronegocio en el Mercosur.',
      ogAlt: 'Agenda de Eventos Agro | Tauze Class',
    },
  }[lang];

  return {
    title: META.title,
    description: META.description,
    alternates: { canonical: 'https://tauzeclass.com.br/eventos' },
    openGraph: {
      title: META.ogTitle,
      description: META.ogDescription,
      url: 'https://tauzeclass.com.br/eventos',
      type: 'website',
      locale: lang === 'es' ? 'es_AR' : 'pt_BR',
      images: [{ url: 'https://tauzeclass.com.br/assets/og-home.jpg', width: 1200, height: 630, alt: META.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: META.ogTitle,
      description: META.ogDescription,
      images: ['https://tauzeclass.com.br/assets/og-home.jpg'],
    },
  };
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
  // Usado tanto na ordenação (dentro do try) quanto no JSON-LD (fora dele) —
  // hoisted pra fora do try/catch pra ficar acessível nos dois lugares.
  const now = Date.now();

  try {
    // Selecionar as colunas necessárias para renderização correta
    let qAuctions = sb.from('auction_events')
      .select('id, title, date, cover, status')
      .neq('status', 'draft')
      .limit(50)

    const eventosFields = 'id, title, title_es, date, image, location_str, location_str_es'

    if (searchQuery) {
      qAuctions = qAuctions.ilike('title', `%${searchQuery}%`)
    }

    // BUG CORRIGIDO (validação do zero, rodada 6, revisão adversarial): a
    // primeira tentativa desta correção usava .or() com o termo sanitizado
    // (vírgulas/parênteses trocados por espaço) pra não quebrar a sintaxe do
    // filtro — mas isso quebrou o próprio caso que motivou a correção: o
    // botão de GPS gera "Cidade, UF" (com vírgula), e sanitizar o termo
    // fazia ele nunca mais bater como substring contra location_str, que no
    // banco SEMPRE tem a vírgula (ex.: "Cascavel, PR"). Buscar por GPS numa
    // cidade com eventos reais lá voltava "Nenhum evento encontrado" —
    // reproduzido ao vivo. Corrigido: duas queries SEPARADAS (título e
    // location_str), cada uma com o termo ORIGINAL sem nenhuma sanitização
    // (o valor vai como parâmetro do PostgREST, não embutido numa string de
    // filtro — não precisa escapar vírgula/parênteses), mescladas e
    // deduplicadas por id em memória. Leilões (auction_events) não têm
    // coluna de localização, continuam só por título.
    // BUG CORRIGIDO (retomada da verificação independente, 2ª rodada de
    // revisão adversarial): esta busca nunca olhava pra title_es/
    // location_str_es — um visitante em espanhol via título em português na
    // listagem (a página de detalhe já localizava corretamente) e buscar
    // pelo termo traduzido pro espanhol voltava "Nenhum evento encontrado"
    // mesmo com o evento existindo. Mesma técnica já usada acima pra
    // title/location_str: uma query .ilike() separada por coluna, sem
    // sanitizar o termo, mescladas e deduplicadas por id.
    const qEventosPorTitulo = searchQuery
      ? sb.from('eventos').select(eventosFields).ilike('title', `%${searchQuery}%`).limit(50)
      : sb.from('eventos').select(eventosFields).limit(50)
    const qEventosPorTituloEs = searchQuery
      ? sb.from('eventos').select(eventosFields).ilike('title_es', `%${searchQuery}%`).limit(50)
      : null
    const qEventosPorLocal = searchQuery
      ? sb.from('eventos').select(eventosFields).ilike('location_str', `%${searchQuery}%`).limit(50)
      : null
    const qEventosPorLocalEs = searchQuery
      ? sb.from('eventos').select(eventosFields).ilike('location_str_es', `%${searchQuery}%`).limit(50)
      : null

    const [resAuctions, resEventosPorTitulo, resEventosPorTituloEs, resEventosPorLocal, resEventosPorLocalEs] = await Promise.all([
      qAuctions,
      qEventosPorTitulo,
      qEventosPorTituloEs ?? Promise.resolve({ data: [], error: null }),
      qEventosPorLocal ?? Promise.resolve({ data: [], error: null }),
      qEventosPorLocalEs ?? Promise.resolve({ data: [], error: null }),
    ])

    if (resAuctions.error) throw resAuctions.error
    if (resEventosPorTitulo.error) throw resEventosPorTitulo.error
    if (resEventosPorTituloEs.error) throw resEventosPorTituloEs.error
    if (resEventosPorLocal.error) throw resEventosPorLocal.error
    if (resEventosPorLocalEs.error) throw resEventosPorLocalEs.error

    const eventosVistos = new Set<string>()
    const eventosMesclados: any[] = []
    for (const e of [
      ...(resEventosPorTitulo.data || []),
      ...(resEventosPorTituloEs.data || []),
      ...(resEventosPorLocal.data || []),
      ...(resEventosPorLocalEs.data || []),
    ]) {
      if (!eventosVistos.has(e.id)) {
        eventosVistos.add(e.id)
        eventosMesclados.push(e)
      }
    }
    const resEventos = { data: eventosMesclados, error: null }

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
      title: lang === 'es' && e.title_es ? e.title_es : e.title,
      date: e.date,
      cover: e.image,
      location: lang === 'es' && e.location_str_es ? e.location_str_es : e.location_str
    }));

    events = [...normalizedAuctions, ...normalizedEventos];

    // BUG CORRIGIDO (teste completo do site, 2026-08-24): ordenação puramente
    // ascendente por data colocava um leilão encerrado com data já passada
    // (ex: fechado há 2 semanas) na FRENTE de eventos futuros reais em
    // "Grandes Destaques Nacionais", só porque uma data passada é
    // numericamente "menor" que uma futura. Eventos já ocorridos (data válida
    // e no passado) agora vão para o final da lista, sem deixar de aparecer.

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
    const byDate = (a: AuctionEvent, b: AuctionEvent) => {
      const timeA = parseEventDate(a.date, now);
      const timeB = parseEventDate(b.date, now);
      const validA = !isNaN(timeA) ? timeA : now + 86400000;
      const validB = !isNaN(timeB) ? timeB : now + 86400000;
      return validA - validB;
    };
    const isPast = (ev: AuctionEvent) => {
      const t = parseEventDate(ev.date, now);
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
      // BUG CORRIGIDO (3ª varredura pré-lançamento): `new Date(ev.date)` cru
      // não parseia o texto livre em português da tabela `eventos` (ex: "2 -
      // 6 fev 2026"), então caía sempre no fallback "hoje" pra 8 de 10
      // registros — quebrando os rich results do Google. parseEventDate é a
      // mesma função já usada acima (linhas 129-139) pra ordenar a lista.
      const parsedTime = parseEventDate(ev.date, now);

      if (!isNaN(parsedTime)) {
        const parsedDate = new Date(parsedTime);
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
                  {t('events_empty')}{searchQuery ? ` ${t('events_empty_for')} "${searchQuery}"` : ''}.
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
