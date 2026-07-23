import Link from 'next/link';
import { cookies } from 'next/headers';
import { t as _t } from '@/lib/constants';
import { createClient } from '@/lib/supabase-server';

export async function CtaSection() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <section className="section cta-section" aria-labelledby="cta-heading">
      <div className="container">
        <div className="cta-inner">
          <div className="cta-text fade-in-up visible">
            <h2 id="cta-heading">{t('cta_title')}</h2>
            <p>{t('cta_sub')}</p>
          </div>
          <div className="cta-actions fade-in-up visible">
            {session ? (
              <Link href="/painel" className="btn btn--accent btn--shimmer">{lang === 'es' ? 'Ir al Panel' : 'Ir para o Painel'}</Link>
            ) : (
              <Link href="/login?mode=register" className="btn btn--accent btn--shimmer">{t('btn_free')}</Link>
            )}
            <a href="#" className="btn btn--ghost">{t('btn_know')}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
