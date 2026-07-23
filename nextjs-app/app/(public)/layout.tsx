import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import '../globals.css';
import { LangProvider } from '@/lib/lang-context';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/components/AuthProvider';
import { PwaPrompt } from '@/components/PwaPrompt';
import { CommandPalette } from '@/components/CommandPalette';
import { createClient } from '@/lib/supabase-server';
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
    images: [{ url: 'https://tauzeclass.com.br/assets/og-home.jpg' }],
    locale: 'pt_BR',
    siteName: 'Tauze Class',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tauze Class — Classificados do Agronegocio',
    description: 'Compre e venda no maior classificado agro do Mercosul.',
    images: ['https://tauzeclass.com.br/assets/og-home.jpg'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/api/favicon', type: 'image/png' },
    ],
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

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLogged = !!session;

  return (
    <html lang={tcLang === 'es' ? 'es' : 'pt-BR'} className={isLogged ? 'user-logged-in' : ''}>
      <head>
        {/* Preconnects — elimina latência de handshake TLS */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://rfzuzuobwuanmbrcthqe.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://ipapi.co" />
        <link rel="dns-prefetch" href="https://flagcdn.com" />
        {/* Google Fonts now loaded via next/font/google */}
        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tauze Class" />
        {/* Service Worker Registration */}
        <Script id="sw-registration" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(r) { console.log('[SW] Registrado:', r.scope); })
                .catch(function(e) { console.warn('[SW] Falha:', e); });
            });
          }
        `}} />
      </head>
      <body className={`antialiased ${inter.variable} ${sora.variable}`}>
        <LangProvider initialLang={tcLang}>
          <AuthProvider>
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
            <Header />
            <main id="main-content">{children}</main>
            <Footer />
            <PwaPrompt />
          </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
