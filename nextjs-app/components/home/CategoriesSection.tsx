import Link from 'next/link';
import { cookies } from 'next/headers';
import { CATEGORIES, CAT_COLORS, CAT_SVG_PATHS, t as _t } from '@/lib/constants';

export async function CategoriesSection() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);

  return (
    <section className="section categories-section" id="categorias" aria-labelledby="cat-heading">
      <div className="container">
        <div className="section-header">
          <div>
            <div className="section-label">{t('section_cats')}</div>
            <h2 className="section-title" id="cat-heading">{t('section_cats_title')}</h2>
          </div>
          <Link href="/listagem" className="view-all" aria-label="Ver todos os anúncios">
            <span>{t('view_all')}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
        <div className="cat-grid" id="cat-grid" role="list" aria-label="Categorias de anúncios">
          {CATEGORIES.map((cat) => {
            const colors = CAT_COLORS[cat.id] || { bg: '#F8FAFC', clr: '#475569' };
            const svgPath = CAT_SVG_PATHS[cat.icon] || CAT_SVG_PATHS.more;
            return (
              <Link
                key={cat.id}
                href={`/listagem?cat=${cat.id}`}
                className="cat-card"
                role="listitem"
                style={{ borderColor: 'transparent' }}
              >
                <div className="cat-icon" style={{ background: colors.bg }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={colors.clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    dangerouslySetInnerHTML={{ __html: svgPath }}
                  />
                </div>
                <span className="cat-name">{lang === 'es' ? cat.name_es : cat.name_pt}</span>
                <span className="cat-count">{cat.count.toLocaleString('pt-BR')}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
