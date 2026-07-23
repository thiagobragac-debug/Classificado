'use client';

import { useLang } from '@/lib/lang-context';

export function TestimonialsSection({ testimonials }: { testimonials: any[] }) {
  const { t } = useLang();

  return (
    <section className="section" aria-labelledby="testimonials-heading">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div className="section-label" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>{t('testimonials_label')}</div>
          <h2 className="section-title" id="testimonials-heading">{t('testimonials')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {testimonials?.map((testi: any) => (
            <div key={testi.id} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '10rem', color: 'var(--clr-primary-pale)', opacity: 0.5, lineHeight: 1, fontFamily: 'serif', zIndex: 0 }}>"</div>
              <div style={{ display: 'flex', gap: '2px', color: '#eab308', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                {Array.from({ length: testi.rating || 5 }).map((_, i) => <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>)}
              </div>
              <p style={{ color: '#334155', fontSize: '1.05rem', lineHeight: 1.6, fontStyle: 'italic', flex: 1, marginBottom: '2rem', position: 'relative', zIndex: 1 }}>"{testi.text}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--clr-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-primary-mid)', fontWeight: 700, fontSize: '1.1rem' }}>{testi.author?.charAt(0) || 'U'}</div>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{testi.author}</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{testi.loc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
