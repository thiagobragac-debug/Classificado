import { cookies } from 'next/headers';
import { TRUST_ITEMS, t as _t } from '@/lib/constants';

export async function TrustSection() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);

  return (
    <section className="section trust-section" aria-labelledby="trust-heading">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-12)' }}>
          <div className="section-label" style={{ justifyContent: 'center', marginBottom: 'var(--sp-3)' }}>Por que escolher o Tauze Class</div>
          <h2 className="section-title" id="trust-heading" style={{ marginBottom: 'var(--sp-3)' }}>{t('trust_title')}</h2>
          <p className="section-subtitle" style={{ marginInline: 'auto', textAlign: 'center' }}>A plataforma mais confiável para negócios rurais no Mercosul.</p>
        </div>
        <div className="trust-grid" role="list">
          {TRUST_ITEMS.map((item, i) => (
            <div key={i} className="trust-item" role="listitem">
              <div className="trust-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: item.icon }}
                />
              </div>
              <div className="trust-title">{lang === 'es' ? item.title_es : item.title_pt}</div>
              <p className="trust-desc">{lang === 'es' ? item.desc_es : item.desc_pt}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
