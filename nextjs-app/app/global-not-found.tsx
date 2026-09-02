import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter, Sora } from 'next/font/google';
import { getLocale } from '@/lib/locale-server';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });

// global-not-found.tsx (Next.js 16, atras de experimental.globalNotFound em
// next.config.ts): cobre URLs que nao batem com NENHUMA rota do app --
// diferente de app/(public)/not-found.tsx, que so e usado quando notFound() e
// chamado DENTRO de uma rota ja resolvida sob o grupo (public). Sem este
// arquivo, uma URL totalmente inexistente cai no 404 generico e sem estilo do
// Next, porque este projeto tem multiplos root layouts (app/(public)/layout.tsx
// e app/(admin)/layout.tsx, cada um com seu proprio <html>) -- nao existe um
// layout raiz unico do qual compor um 404 global (ver node_modules/next/dist/
// docs/01-app/03-api-reference/03-file-conventions/not-found.md, secao
// 'global-not-found.js'). Por isso este arquivo monta seu proprio <html><body>
// completo e importa globals.css/fontes diretamente, sem depender de layout
// nenhum -- exatamente como o doc do Next exige pra esse arquivo.
const TRANSLATIONS = {
  pt: {
    title: 'Página não encontrada',
    body: 'Desculpe, não conseguimos encontrar a página que você está procurando. Ela pode ter sido movida ou não existe mais.',
    home: 'Voltar ao Início',
    explore: 'Explorar Anúncios',
  },
  es: {
    title: 'Página no encontrada',
    body: 'Lo sentimos, no pudimos encontrar la página que buscas. Puede haber sido movida o ya no existe.',
    home: 'Volver al Inicio',
    explore: 'Explorar Anuncios',
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLocale();
  return { title: TRANSLATIONS[lang].title };
}

export default async function GlobalNotFound() {
  const lang = await getLocale();
  const t = TRANSLATIONS[lang];

  return (
    <html lang={lang === 'es' ? 'es' : 'pt-BR'}>
      <body className={`antialiased ${inter.variable} ${sora.variable}`} style={{ margin: 0 }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚜</div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
              {t.title}
            </h1>
            <p style={{ fontSize: '1.125rem', color: 'var(--clr-text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              {t.body}
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/" style={{ padding: '0.875rem 2rem', borderRadius: '2rem', background: 'var(--clr-primary)', color: 'white', fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)' }}>
                {t.home}
              </Link>
              <Link href="/listagem" style={{ padding: '0.875rem 2rem', borderRadius: '2rem', background: 'var(--clr-surface)', border: '2px solid var(--clr-border)', color: 'var(--clr-text)', fontWeight: 700, textDecoration: 'none' }}>
                {t.explore}
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
