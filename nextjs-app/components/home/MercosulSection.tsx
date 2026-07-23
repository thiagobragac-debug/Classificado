import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { t as _t } from '@/lib/constants';

export async function MercosulSection() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);

  return (
    <section className="section mercosul-section" aria-labelledby="mercosul-heading">
      <div className="container">
        <div className="mercosul-grid">
          <div>
            <div className="section-label">{t('mercosul_label')}</div>
            <h2 className="section-title" id="mercosul-heading" style={{ marginBottom: 'var(--sp-4)' }}>{t('mercosul_title')}</h2>
            <p className="section-subtitle">{t('mercosul_sub')}</p>
            <div style={{ marginTop: 'var(--sp-8)' }}>
              <Link href="/listagem" className="btn btn--primary btn--lg">
                <span>{t('btn_explore')}</span>
              </Link>
            </div>
          </div>
          <div className="country-cards" role="list" aria-label="Países cobertos">
            {[
              { name: 'Brasil',   flag: '/assets/flags/br.svg', alt: 'Brasil' },
              { name: 'Argentina',flag: '/assets/flags/ar.svg', alt: 'Argentina' },
              { name: 'Paraguai', flag: '/assets/flags/py.svg', alt: 'Paraguai' },
              { name: 'Uruguai',  flag: '/assets/flags/uy.svg', alt: 'Uruguai' },
            ].map((c) => (
              <div key={c.name} className="country-card" style={{ background: '#fff', padding: 'var(--sp-4) var(--sp-5)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', cursor: 'default' }}>
                <div style={{ width: 42, height: 42, flexShrink: 0, position: 'relative' }}>
                  <Image src={c.flag} alt={c.alt} fill style={{ objectFit: 'cover', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: '1.05rem' }}>{c.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', marginTop: 2 }}>Cobertura Nacional</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
