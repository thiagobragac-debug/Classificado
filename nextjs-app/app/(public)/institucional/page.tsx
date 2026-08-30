import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { cookies } from 'next/headers';
import DOMPurify from 'isomorphic-dompurify';
import { createClient, createAnonClient } from '@/lib/supabase-server';
import { t as _t } from '@/lib/constants';
import { ContactForm } from './ContactForm';
import './institucional.css';

export const revalidate = 60; // ISR - revalida a cada minuto para as páginas mudarem rápido após edição no painel

type SearchParams = { [key: string]: string | string[] | undefined };
type Lang = 'pt' | 'es';

// BUG CORRIGIDO (auditoria i18n, 2026-08-27): a página inteira — breadcrumb,
// título/subtítulo/conteúdo vindos do banco, mensagens de fallback e
// generateMetadata — ficava sempre em português: nunca lia o cookie tc_lang
// nem usava as colunas _es de institutional_pages (title_es/subtitle_es/
// content_es/group_name_es, adicionadas na migration 20260827100000).
// Strings novas específicas desta página ficam num dicionário local, mesmo
// padrão já usado em components/ads/AdsSidebar.tsx, pra não poluir o
// dicionário global de lib/constants.ts com chaves usadas só aqui; "Início"
// já existe lá (nav_home) e é reaproveitado via _t().
const TRANSLATIONS = {
  pt: {
    breadcrumbInstitutional: 'Institucional',
    emptyPages: 'Nenhuma página institucional configurada.',
    emptyContent: 'Nenhum conteúdo disponível para esta página.',
    fallbackTitle: 'Institucional',
    fallbackDescription: 'Termos de uso, política de privacidade, cookies e demais informações institucionais do Tauze Class — o maior classificado do agronegócio do Mercosul.',
    siteSuffix: 'Tauze Class, o maior classificado do agronegócio do Mercosul.',
    loadError: 'Erro ao carregar as páginas institucionais. Tente novamente em instantes.',
    retry: 'Tentar novamente',
    backHome: 'Voltar para o início',
  },
  es: {
    breadcrumbInstitutional: 'Institucional',
    emptyPages: 'No hay ninguna página institucional configurada.',
    emptyContent: 'No hay contenido disponible para esta página.',
    fallbackTitle: 'Institucional',
    fallbackDescription: 'Términos de uso, política de privacidad, cookies y demás información institucional de Tauze Class — el clasificado más grande del agronegocio del Mercosur.',
    siteSuffix: 'Tauze Class, el clasificado más grande del agronegocio del Mercosur.',
    loadError: 'Error al cargar las páginas institucionales. Intentá de nuevo en unos instantes.',
    retry: 'Intentar de nuevo',
    backHome: 'Volver al inicio',
  },
} as const;

// Escolhe a coluna _es quando o idioma é espanhol e ela está preenchida, com
// fallback pra coluna em português — mesmo padrão já correto em `ads`
// (lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt). A maioria das
// linhas de institutional_pages ainda não tem content_es preenchido
// (tradução em andamento em paralelo); esse fallback é o comportamento
// esperado até lá, não um bug.
function localize(lang: Lang, pt: string, es?: string | null): string {
  return lang === 'es' && es ? es : pt;
}

async function getLang(): Promise<Lang> {
  const cookieStore = await cookies();
  return cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
}

// BUG CORRIGIDO (3ª varredura pré-lançamento, 2026-08-26): faltava metadata
// própria por página institucional — todas as 10 páginas (Termos, Privacidade,
// Cookies, Sobre, Ajuda, API, Contato, Trabalhe Conosco, Denúncia, Imprensa)
// herdavam o title/description genérico da home e o canonical sempre apontava
// pra raiz (definidos no layout raiz), o que é ruim pra SEO/indexação — cada
// uma tem conteúdo e propósito distintos.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const pageParam = typeof params.page === 'string' ? params.page : 'sobre';

  // BUG CORRIGIDO (auditoria i18n, 2026-08-27): usava createAnonClient(),
  // cujo adaptador de cookies sempre retorna [] (getAll), então o
  // title/description nunca trocavam de idioma mesmo com tc_lang=es. O
  // cookie de idioma da aplicação é lido diretamente aqui; o cliente
  // anônimo continua sendo usado só pra query em si (pública, cacheável).
  const lang = await getLang();

  const supabase = createAnonClient();
  const { data: pageData } = await supabase
    .from('institutional_pages')
    .select('id, title, subtitle, title_es, subtitle_es')
    .eq('id', pageParam)
    .maybeSingle();

  if (!pageData) {
    // Slug inexistente: a página em si faz redirect() pra pages[0] nesse
    // caso, mas mantemos uma metadata genérica e coerente de fallback.
    // Mesmo tratamento de hreflang do caso normal abaixo — ver comentário lá.
    return {
      title: TRANSLATIONS[lang].fallbackTitle,
      description: TRANSLATIONS[lang].fallbackDescription,
      alternates: {
        canonical: 'https://tauzeclass.com.br/institucional',
        languages: { 'x-default': 'https://tauzeclass.com.br/institucional' },
      },
    };
  }

  const title = localize(lang, pageData.title, pageData.title_es);
  const subtitle = localize(lang, pageData.subtitle, pageData.subtitle_es);
  const description = subtitle || `${title} — ${TRANSLATIONS[lang].siteSuffix}`;

  const canonicalUrl = `https://tauzeclass.com.br/institucional?page=${pageData.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      // BUG CORRIGIDO (auditoria de SEO — alternates.languages ausente):
      // faltava hreflang nesta página, mesmo achado já corrigido em outros
      // grupos desta rodada (ver app/(public)/layout.tsx). Diferente de
      // app/(public)/anuncio/[id]/page.tsx (que aceita ?lang= na URL e por
      // isso declara 'pt-BR'/'es' com URLs distintas), esta página troca de
      // idioma só via cookie tc_lang — não existe um ?lang= aqui, então
      // 'page' é a única variação real de URL. Declarar 'pt-BR' e 'es'
      // apontando pra essa MESMA URL seria inválido (duas entidades de
      // idioma conflitantes pro mesmo endereço); 'x-default' sozinho é o
      // que reflete a realidade, mesmo padrão usado no layout raiz.
      languages: { 'x-default': canonicalUrl },
    },
  };
}

// Tags HTML permitidas no conteúdo institucional
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
  'a', 'strong', 'em', 'b', 'i',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'hr', 'br', 'span', 'div', 'section',
  'details', 'summary'
];
const ALLOWED_ATTR = ['href', 'class', 'target', 'rel', 'id', 'aria-label', 'style', 'data-i18n'];

// Dicionário de SVGs (se cadastrado um nome diferente, pode usar um fallback)
const ICON_MAP: Record<string, React.ReactNode> = {
  'help': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  'mail': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  'alert-triangle': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  'file-text': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  'shield': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  'cookie': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="7.5" cy="9.5" r="1.5"/><circle cx="12.5" cy="6.5" r="1.5"/><circle cx="16.5" cy="11.5" r="1.5"/><circle cx="10.5" cy="14.5" r="1.5"/><path d="M22 12c-2.76 0-5 2.24-5 5s2.24 5 5 5"/></svg>,
  'info': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  'briefcase': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  'tv': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16h20"/><path d="M5 20h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>,
  'code': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  'file': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
};

export default async function InstitucionalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const pageParam = typeof params.page === 'string' ? params.page : 'sobre';

  // BUG CORRIGIDO (auditoria i18n, 2026-08-27): a página nunca lia o cookie
  // tc_lang — título, subtítulo, conteúdo, navegação lateral e as mensagens
  // de fallback abaixo ficavam sempre em português.
  const lang = await getLang();

  const supabase = await createClient();
  // BUG CORRIGIDO (3ª varredura pré-lançamento, 2026-08-26): sem desempate,
  // a ordenação por order_idx sozinha não é determinística entre páginas
  // empatadas (produção tem 3 grupos de 3 páginas cada empatadas em
  // order_idx 1/2/3). pages[0] — usado no redirect de fallback e como página
  // padrão — dependia de uma ordem que o SQL não garante entre empates.
  // 'id' (o slug) como segunda chave dá um resultado estável.
  const { data: pages, error: pagesError } = await supabase.from('institutional_pages').select('*').order('order_idx', { ascending: true }).order('id', { ascending: true });

  // BUG CORRIGIDO (varredura cruzada de cenários): uma falha real de fetch
  // (rede, RLS) caía no mesmo `!pages` de "nenhuma página configurada" —
  // indistinguível de uma falha genuína de indisponibilidade do banco.
  // BUG CORRIGIDO (achado de usabilidade): estes dois branches retornavam só
  // uma <div> isolada, fora do shell da página (sem breadcrumb, sem nav, sem
  // saída) — mesmo padrão de erro já corrigido em app/(public)/eventos/
  // page.tsx (que envolve seu próprio estado de erro no hero+breadcrumb da
  // página normal). Agora os dois casos reaproveitam o mesmo hero com
  // breadcrumb da renderização normal (abaixo) e oferecem "Tentar novamente"
  // (recarrega a mesma rota) e um link de volta pra "/".
  if (pagesError) {
    console.error('Erro ao carregar páginas institucionais:', pagesError.message);
    return (
      <main style={{ minHeight: '80vh', paddingBottom: '4rem' }}>
        <div className="list-hero" style={{ marginTop: 'var(--header-h)' }}>
          <div className="container">
            <div className="list-hero-inner">
              <div>
                <nav aria-label={lang === 'es' ? 'Navegación' : 'Navegação'} className="breadcrumb">
                  <Link href="/">{_t('nav_home', lang)}</Link>
                  <span aria-hidden="true">›</span>
                  <span>{TRANSLATIONS[lang].breadcrumbInstitutional}</span>
                </nav>
                <h1 className="list-hero-title">{TRANSLATIONS[lang].fallbackTitle}</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
          <p style={{ marginBottom: '1.5rem' }}>{TRANSLATIONS[lang].loadError}</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/institucional" className="btn btn--accent">{TRANSLATIONS[lang].retry}</Link>
            <Link href="/" className="btn btn--outline">{TRANSLATIONS[lang].backHome}</Link>
          </div>
        </div>
      </main>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <main style={{ minHeight: '80vh', paddingBottom: '4rem' }}>
        <div className="list-hero" style={{ marginTop: 'var(--header-h)' }}>
          <div className="container">
            <div className="list-hero-inner">
              <div>
                <nav aria-label={lang === 'es' ? 'Navegación' : 'Navegação'} className="breadcrumb">
                  <Link href="/">{_t('nav_home', lang)}</Link>
                  <span aria-hidden="true">›</span>
                  <span>{TRANSLATIONS[lang].breadcrumbInstitutional}</span>
                </nav>
                <h1 className="list-hero-title">{TRANSLATIONS[lang].fallbackTitle}</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
          <p style={{ marginBottom: '1.5rem' }}>{TRANSLATIONS[lang].emptyPages}</p>
          <Link href="/" className="btn btn--outline">{TRANSLATIONS[lang].backHome}</Link>
        </div>
      </main>
    );
  }

  const currentPageData = pages.find(p => p.id === pageParam);

  if (!currentPageData && pageParam !== pages[0].id) {
    redirect(`/institucional?page=${pages[0].id}`);
  }

  const activePage = currentPageData || pages[0];

  // Agrupar as páginas pelo group_name em português (chave estável — evita
  // grupos duplicados por pequena divergência de acentuação/maiúsculas na
  // tradução) e guardar group_name_es do primeiro item de cada grupo pra
  // exibição localizada.
  const groupedPages: Record<string, any[]> = {};
  pages.forEach(p => {
    if (!groupedPages[p.group_name]) groupedPages[p.group_name] = [];
    groupedPages[p.group_name].push(p);
  });

  // ─── Sanitização do HTML de conteúdo do banco ────────────────
  const activeContent = localize(lang, activePage.content, activePage.content_es);
  const safeData = activeContent
    ? DOMPurify.sanitize(activeContent, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ADD_ATTR: ['target'],
      })
    : null;

  const NavLink = ({ id, icon_name, label }: { id: string; icon_name: string; label: string }) => {
    const isActive = activePage.id === id;
    const icon = ICON_MAP[icon_name] || ICON_MAP['file'];
    return (
      <Link href={`/institucional?page=${id}`} className={`inst-nav-link ${isActive ? 'active' : ''}`}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <main style={{ minHeight: '80vh', paddingBottom: '4rem' }}>
      <div className="list-hero" style={{ marginTop: 'var(--header-h)' }}>
        <div className="container">
          <div className="list-hero-inner">
            <div>
              <nav aria-label={lang === 'es' ? 'Navegación' : 'Navegação'} className="breadcrumb">
                <Link href="/">{_t('nav_home', lang)}</Link>
                <span aria-hidden="true">›</span>
                <span>{TRANSLATIONS[lang].breadcrumbInstitutional}</span>
              </nav>
              <h1 className="list-hero-title">{localize(lang, activePage.title, activePage.title_es)}</h1>
              <p className="list-hero-count">{localize(lang, activePage.subtitle, activePage.subtitle_es)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="inst-layout">
          <aside className="inst-sidebar">
            {Object.keys(groupedPages).map(groupName => (
              <div className="inst-nav-group" key={groupName}>
                <div className="inst-nav-title">{localize(lang, groupName, groupedPages[groupName][0]?.group_name_es)}</div>
                {groupedPages[groupName].map(p => (
                  <NavLink key={p.id} id={p.id} label={localize(lang, p.title, p.title_es)} icon_name={p.icon_name} />
                ))}
              </div>
            ))}
          </aside>

          <div className="inst-content-box">
            {safeData ? (
              <div className="inst-prose" dangerouslySetInnerHTML={{ __html: safeData }} />
            ) : (
              <div className="inst-prose">
                <p>{TRANSLATIONS[lang].emptyContent}</p>
              </div>
            )}
            {/* Substitui o <form> fake que vinha embutido no conteúdo do
                banco (onsubmit cosmético, nunca enviava nada) — ver
                ContactForm.tsx e app/api/contact/route.ts. */}
            {activePage.id === 'contato' && <ContactForm />}
          </div>
        </div>
      </div>
    </main>
  );
}
