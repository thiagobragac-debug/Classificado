import Link from 'next/link';
import { cookies } from 'next/headers';

// BUG CORRIGIDO (revalidação do zero da auditoria de i18n): página 404
// inteira hardcoded em português, sem nenhuma lógica de idioma — qualquer
// visitante ES caindo num link quebrado via qualquer página do site.
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

export default async function NotFound() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('tc_lang')?.value === 'es' ? 'es' : 'pt';
  const t = TRANSLATIONS[lang];

  return (
    <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '480px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚜</div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
          {t.title}
        </h1>
        <p style={{ fontSize: '1.125rem', color: 'var(--clr-text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
          {t.body}
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              padding: '0.875rem 2rem',
              borderRadius: '2rem',
              background: 'var(--clr-primary)',
              color: 'white',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'background 0.2s',
              boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)'
            }}
          >
            {t.home}
          </Link>
          <Link
            href="/listagem"
            style={{
              padding: '0.875rem 2rem',
              borderRadius: '2rem',
              background: 'var(--clr-surface)',
              border: '2px solid var(--clr-border)',
              color: 'var(--clr-text)',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'background 0.2s'
            }}
          >
            {t.explore}
          </Link>
        </div>
      </div>
    </main>
  );
}
