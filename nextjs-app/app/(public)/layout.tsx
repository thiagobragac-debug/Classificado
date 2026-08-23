import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import Script from 'next/script';
import '../globals.css';
import { LangProvider } from '@/lib/lang-context';
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

export const metadata: Metadata = {
  title: { default: 'Tauze Class — Classificados do Agronegócio Mercosul', template: '%s | Tauze Class' },
  description: 'Tauze Class — O maior portal de classificados do agronegocio do Mercosul. Compre e venda animais, insumos, maquinas e imoveis rurais no Brasil, Argentina, Paraguai e Uruguai.',
  keywords: ['classificados agronegocio', 'venda animais', 'bovinos', 'equinos', 'maquinas agricolas', 'imoveis rurais', 'mercosul'],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: 'Tauze Class — Classificados do Agronegocio Mercosul',
    description: 'O maior portal de classificados do agronegocio do Mercosul. Bovinos, equinos, maquinas, insumos e imoveis rurais.',
    url: 'https://tauzeclass.com.br',
    images: [{ url: 'https://tauzeclass.com.br/assets/og-home.jpg', width: 1200, height: 630, alt: 'Tauze Class — Classificados do Agronegócio' }],
    locale: 'pt_BR',
    siteName: 'Tauze Class',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tauze Class — Classificados do Agronegocio',
    description: 'Compre e venda no maior classificado agro do Mercosul.',
    images: ['https://tauzeclass.com.br/assets/og-home.jpg'],
  },
  alternates: { canonical: 'https://tauzeclass.com.br' },
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/api/favicon', type: 'image/png' }],
    apple: '/icon-192.svg',
    shortcut: '/api/favicon',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16A34A',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const tcLang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';

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
                  Pular para o conteúdo principal
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
