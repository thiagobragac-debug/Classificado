import Link from 'next/link';
import { cookies } from 'next/headers';
import { t as _t } from '@/lib/constants';
import { createClient } from '@/lib/supabase-server';

export async function CtaSection() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <section className="section cta-section" aria-labelledby="cta-heading" style={{ marginTop: 0 }}>
      <div className="container">
        <div className="cta-inner">
          <div className="cta-text fade-in-up visible">
            <h2 id="cta-heading">{t('cta_title')}</h2>
            <p>{t('cta_sub')}</p>
          </div>
          <div className="cta-actions fade-in-up visible">
            {user ? (
              <Link href="/painel" className="btn btn--accent btn--shimmer">{lang === 'es' ? 'Ir al Panel' : 'Ir para o Painel'}</Link>
            ) : (
              <Link href="/login?mode=register" className="btn btn--accent btn--shimmer">{t('btn_free')}</Link>
            )}
            {/* BUG CORRIGIDO (validação do zero, rodada 6): href="#" era um
                link morto (não faz nada, não navega pra lugar nenhum) —
                aponta agora pra página institucional, destino natural de
                "Saiba mais"/"Saber más" ao lado do CTA de cadastro. */}
            <Link href="/institucional" className="btn btn--ghost">{t('btn_know')}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
