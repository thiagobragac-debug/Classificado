import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '../globals.css';
import { LangProvider } from '@/lib/lang-context';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/components/AuthProvider';
import { PwaPrompt } from '@/components/PwaPrompt';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Preconnects — elimina latência de handshake TLS */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://rfzuzuobwuanmbrcthqe.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://ipapi.co" />
        <link rel="dns-prefetch" href="https://flagcdn.com" />
        {/* Google Fonts — Sora + Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
        {/* Auth state sem FOUC — mesma lógica do index.html original */}
        <Script id="auth-state" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: `
          (function() {
            var hasToken = false;
            try {
              for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('supabase.auth.token') !== -1) {
                  hasToken = true;
                  break;
                }
              }
            } catch(e) {}
            if (hasToken) {
              document.documentElement.classList.add('user-logged-in');
            }
          })();
        `}} />
      </head>
      <body className="antialiased">
        <LangProvider>
          <AuthProvider>
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
