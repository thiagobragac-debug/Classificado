import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '480px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚜</div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
          Página não encontrada
        </h1>
        <p style={{ fontSize: '1.125rem', color: 'var(--clr-text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
          Desculpe, não conseguimos encontrar a página que você está procurando. Ela pode ter sido movida ou não existe mais.
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
            Voltar ao Início
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
            Explorar Anúncios
          </Link>
        </div>
      </div>
    </main>
  );
}
