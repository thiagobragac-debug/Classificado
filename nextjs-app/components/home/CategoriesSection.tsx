import Link from 'next/link';
import { cookies } from 'next/headers';
import { CAT_COLORS, CAT_SVG_PATHS, t as _t } from '@/lib/constants';
import { getServerCategories } from '@/lib/supabase-server';

export async function CategoriesSection() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);
  const categories = await getServerCategories();

  return (
    <section className="section categories-section" id="categorias" aria-labelledby="cat-heading">
      <div className="container">
        <div className="section-header">
          <div>
            <div className="section-label">{t('section_cats')}</div>
            <h2 className="section-title" id="cat-heading">{t('section_cats_title')}</h2>
          </div>
          <Link href="/listagem" className="view-all" aria-label={t('view_all_aria')}>
            <span>{t('view_all')}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
        <div className="cat-grid" id="cat-grid" role="list" aria-label={t('cat_grid_aria')}>
          {categories.map((cat) => {
            // Check if it's a known SVG icon name, otherwise treat as an emoji/text icon
            const isSvg = !!CAT_SVG_PATHS[cat.icon];
            const svgPath = isSvg ? CAT_SVG_PATHS[cat.icon] : null;
            
            // Use custom color from DB, or fallback to constants, or a default gray
            let colors = { bg: '#F8FAFC', clr: '#475569' };
            if (cat.color) {
              colors = { bg: cat.color + '20', clr: cat.color };
            } else if (CAT_COLORS[cat.id]) {
              colors = CAT_COLORS[cat.id];
            }

            return (
              <Link
                key={cat.id}
                href={`/listagem?cat=${cat.id}`}
                className="cat-card"
                role="listitem"
                style={{ borderColor: 'transparent' }}
              >
                <div className="cat-icon" style={{ background: colors.bg, color: colors.clr, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isSvg ? 'inherit' : '1.5rem' }}>
                  {isSvg ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke={colors.clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}
                      dangerouslySetInnerHTML={{ __html: svgPath as string }}
                    />
                  ) : (
                    <span style={{ lineHeight: 1 }}>{cat.icon}</span>
                  )}
                </div>
                <span className="cat-name">{lang === 'es' ? (cat.name_es || cat.name_pt) : cat.name_pt}</span>
                {cat.count !== undefined && <span className="cat-count">{cat.count.toLocaleString('pt-BR')}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
