import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import '../globals.css';
import { LangProvider } from '@/lib/lang-context';
import { getLocale } from '@/lib/locale-server';
import { localizedPath, buildHreflangAlternates } from '@/lib/locale';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/components/AuthProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { PwaPrompt } from '@/components/PwaPrompt';
import { CommandPalette } from '@/components/CommandPalette';
import { createClient, getServerCategories } from '@/lib/supabase-server';
import { CategoriesProvider } from '@/lib/categories-context';
import { Inter, Sora } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

const METADATA_TRANSLATIONS = {
  pt: {
    title: { default: 'Tauze Class — Classificados do Agronegócio Mercosul', template: '%s | Tauze Class' },
    description: 'Tauze Class — O maior portal de classificados do agronegocio do Mercosul. Compre e venda animais, insumos, maquinas e imoveis rurais no Brasil, Argentina, Paraguai e Uruguai.',
    keywords: ['classificados agronegocio', 'venda animais', 'bovinos', 'equinos', 'maquinas agricolas', 'imoveis rurais', 'mercosul'],
    ogTitle: 'Tauze Class — Classificados do Agronegocio Mercosul',
    ogDescription: 'O maior portal de classificados do agronegocio do Mercosul. Bovinos, equinos, maquinas, insumos e imoveis rurais.',
    ogImageAlt: 'Tauze Class — Classificados do Agronegócio',
    locale: 'pt_BR',
    twitterTitle: 'Tauze Class — Classificados do Agronegocio',
    twitterDescription: 'Compre e venda no maior classificado agro do Mercosul.',
  },
  es: {
    title: { default: 'Tauze Class — Clasificados del Agronegocio Mercosur', template: '%s | Tauze Class' },
    description: 'Tauze Class — El mayor portal de clasificados del agronegocio del Mercosur. Compra y vende animales, insumos, maquinaria e inmuebles rurales en Brasil, Argentina, Paraguay y Uruguay.',
    keywords: ['clasificados agronegocio', 'venta animales', 'bovinos', 'equinos', 'maquinaria agricola', 'inmuebles rurales', 'mercosur'],
    ogTitle: 'Tauze Class — Clasificados del Agronegocio Mercosur',
    ogDescription: 'El mayor portal de clasificados del agronegocio del Mercosur. Bovinos, equinos, maquinaria, insumos e inmuebles rurales.',
    ogImageAlt: 'Tauze Class — Clasificados del Agronegocio',
    locale: 'es_AR',
    twitterTitle: 'Tauze Class — Clasificados del Agronegocio',
    twitterDescription: 'Compra y vende en el mayor clasificado agro del Mercosur.',
  },
} as const;

const SITE_URL = 'https://tauzeclass.com.br';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  const m = METADATA_TRANSLATIONS[lang];
  // BUG CRÍTICO CORRIGIDO (migração de SEO): canonical era SEMPRE a raiz em
  // PT, mesmo quando a requisição era /es (a variante em ES "canonicalizava"
  // pra si mesma incorretamente, contradizendo o próprio hreflang logo
  // abaixo). Agora é auto-referente por locale, e alternates.languages
  // aponta pra URL REAL de cada idioma (/ e /es) — antes disso não existia
  // URL nenhuma em ES pra declarar, só o x-default fazia sentido.
  const canonicalUrl = `${SITE_URL}${localizedPath('/', lang)}`;

  return {
    title: m.title,
    description: m.description,
    keywords: [...m.keywords],
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title: m.ogTitle,
      description: m.ogDescription,
      url: canonicalUrl,
      // Fallback temporário — ainda não existe uma imagem de marca 1200x630
      // dedicada (og-home.jpg nunca existiu em public/assets/). Usa o mesmo
      // fallback já estabelecido em components/ads/AdGallery.tsx e
      // app/(public)/anuncio/[id]/page.tsx até haver um asset de OG real.
      images: [{ url: 'https://tauzeclass.com.br/assets/hero_farm.webp', width: 1200, height: 630, alt: m.ogImageAlt }],
      locale: m.locale,
      siteName: 'Tauze Class',
    },
    twitter: {
      card: 'summary_large_image',
      title: m.twitterTitle,
      description: m.twitterDescription,
      images: ['https://tauzeclass.com.br/assets/hero_farm.webp'],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: buildHreflangAlternates(SITE_URL, '/'),
    },
    manifest: '/manifest.json',
    icons: {
      icon: [{ url: '/api/favicon', type: 'image/png' }],
      apple: '/icon-192.svg',
      shortcut: '/api/favicon',
    },
    // BUG CORRIGIDO (auditoria de SEO, 2ª rodada): nenhuma verificação do
    // Google Search Console (nem Bing) existia no código — a propriedade
    // do site não tinha como ser comprovada via meta tag, bloqueando o
    // envio do sitemap.xml e o acesso aos relatórios de indexação/cobertura.
    // Lê de env var — sem valor configurado, o campo de Metadata do Next
    // sai vazio (não gera <meta> nenhuma), então isso é um no-op até
    // alguém colar o código real de verificação nas envs de produção.
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? {
      verification: {
        ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
        ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } } : {}),
      },
    } : {}),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16A34A',
};

const LAYOUT_TRANSLATIONS = {
  pt: { skipToContent: 'Pular para o conteúdo principal' },
  es: { skipToContent: 'Saltar al contenido principal' },
} as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tcLang = await getLocale();
  const lt = LAYOUT_TRANSLATIONS[tcLang];

  // Ler nonce gerado pelo proxy para usar nos scripts inline
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') || '';

  // Uma única chamada getUser() aproveitando a sessão já validada pelo proxy
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLogged = !!user;
  
  const serverCategories = await getServerCategories();
  
  let userInitials = '';
  if (user) {
    const name = user.user_metadata?.name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'U';
    userInitials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  return (
    <html lang={tcLang === 'es' ? 'es' : 'pt-BR'} className={isLogged ? 'user-logged-in' : ''}>
      <head>
        {/* Preconnects — elimina latência de handshake TLS */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://rfzuzuobwuanmbrcthqe.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://ipapi.co" />
        <link rel="dns-prefetch" href="https://flagcdn.com" />
        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tauze Class" />
      </head>
      <body className={`antialiased ${inter.variable} ${sora.variable}`}>
        <LangProvider initialLang={tcLang}>
          <CategoriesProvider categories={serverCategories}>
            <AuthProvider>
              <ConfirmProvider>
                <a href="#main-content" className="skip-to-content" style={{
                  position: 'absolute',
                  top: '-40px',
                  left: '0',
                  background: '#000',
                  color: 'white',
                  padding: '8px',
                  zIndex: 100000,
                  transition: 'top 0.2s'
                }}>
                  {lt.skipToContent}
                </a>
                <CommandPalette />
                <Header initialIsLoggedIn={isLogged} initialUserInitials={userInitials} />
                <main id="main-content">{children}</main>
                <Footer />
                <PwaPrompt />
              </ConfirmProvider>
            </AuthProvider>
          </CategoriesProvider>
        </LangProvider>
        {/* BUG CORRIGIDO (auditoria de SEO, 2ª rodada): não havia NENHUM
            analytics/tracking no site inteiro — sem isso, não dá pra medir
            se qualquer correção de SEO desta auditoria (ou qualquer decisão
            de produto) teve efeito real em tráfego/conversão. Carrega o
            GA4 só se NEXT_PUBLIC_GA_MEASUREMENT_ID estiver configurado —
            sem a env var (hoje), isso é um no-op completo, sem inventar
            nenhum ID de propriedade que não existe. */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
              nonce={nonce}
            />
            <Script
              id="ga4-init"
              strategy="afterInteractive"
              nonce={nonce}
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}');
                `,
              }}
            />
          </>
        )}
        {/* Service Worker — nonce necessário para CSP nonce-based */}
        <Script
          id="sw-registration"
          strategy="afterInteractive"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                var registrarSW = function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(r) { console.log('[SW] Registrado:', r.scope); })
                    .catch(function(e) { console.warn('[SW] Falha:', e); });
                };
                // strategy="afterInteractive" pode executar DEPOIS do evento
                // load. Nesse caso o listener nunca dispararia e o service
                // worker jamais era registrado — era o que acontecia aqui.
                if (document.readyState === 'complete') registrarSW();
                else window.addEventListener('load', registrarSW);
              }
            `
          }}
        />
      </body>
    </html>
  );
}
