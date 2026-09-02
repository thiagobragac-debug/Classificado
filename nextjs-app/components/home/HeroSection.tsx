import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { CATEGORIES, POPULAR_TAGS, t as _t } from '@/lib/constants';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { HeroSearchBar } from './HeroSearchBar';
import { getServerCategories } from '@/lib/supabase-server';

export async function HeroSection({ stats }: { stats: any }) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('tc_lang')?.value || 'pt') as 'pt' | 'es';
  const t = (key: string) => _t(key, lang);
  const categories = await getServerCategories();

  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="container">
        <div className="hero-grid">
          {/* LEFT */}
          <div className="hero-left fade-in-up visible">
            <div className="hero-badge" aria-label={t('mercosul_label')}>
              <span className="hero-badge-dot" aria-hidden="true"></span>
              <span>{t('hero_badge')}</span>
            </div>

            <h1 className="hero-h1" id="hero-heading">
              <span>{t('hero_title')}</span>
              <span className="grad"> {t('hero_highlight')}</span><br />{' '}
              <span>{t('hero_title2')}</span>
            </h1>

            <p className="hero-sub">{t('hero_sub')}</p>

            {/* Search Box & Popular Tags */}
            <HeroSearchBar />

            {/* Actions */}
            <div className="hero-actions">
              <Link href="/anunciar" className="btn btn--accent btn--lg btn--shimmer" id="btn-post-hero">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>{t('btn_post_hero')}</span>
              </Link>
              <Link href="/listagem" className="hero-explore-link">
                <span>{t('btn_explore')}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
            </div>

            {/* Mini Stats */}
            <div className="hero-mini-stats" aria-label={t('hero_stats_aria')}>
              {[
                { id: 'stat-ads',     target: stats?.total_ads      ?? 2520, suffix: '+', lbl: t('stats_0') },
                { id: 'stat-users',   target: stats?.total_sellers   ?? 450,  suffix: '+', lbl: t('stats_3') },
                { id: 'stat-paises',  target: stats?.total_countries ?? 4,    suffix: '',  lbl: t('stats_2') },
                { id: 'stat-cidades', target: stats?.total_cities    ?? 120,  suffix: '+', lbl: t('stats_1') },
              ].map(s => (
                <div key={s.id} className="hero-mini-stat">
                  <span className="num" id={s.id}>
                    <AnimatedNumber target={s.target} suffix={s.suffix} />
                  </span>
                  <span className="lbl">{s.lbl}</span>
                </div>
              ))}
            </div>
          </div>{/* /.hero-left */}

          {/* RIGHT */}
          <div className="hero-right fade-in-up visible" style={{ transitionDelay: '.15s' }}>
            <div className="hero-img-frame">

              <div className="hero-float-card hero-float-card--1" aria-hidden="true">
                <div className="fc-icon fc-icon--green">🐄</div>
                <div>
                  <div className="fc-text-main">
                    <AnimatedNumber target={stats?.total_bovinos ?? 18400} /> <span>{t('fc_bovinos')}</span>
                  </div>
                  <div className="fc-text-sub">{t('fc_ads_available')}</div>
                </div>
              </div>

              <div className="hero-float-card hero-float-card--2" aria-hidden="true">
                <div className="fc-icon fc-icon--amber">⭐</div>
                <div>
                  <div className="fc-text-main">{t('fc_verified')}</div>
                  <div className="fc-text-sub">
                    <AnimatedNumber target={stats?.total_sellers ?? 450} suffix="+" /> <span>{t('fc_sellers')}</span>
                  </div>
                </div>
              </div>

              <div className="hero-float-card hero-float-card--3" aria-hidden="true">
                <div className="fc-icon" style={{ color: 'var(--clr-accent)' }}>🔨</div>
                <div>
                  <div className="fc-text-main">
                    <AnimatedNumber target={stats?.total_auctions ?? 15} /> <span>{t('fc_auctions')}</span>
                  </div>
                  <div className="fc-text-sub">{t('fc_scheduled')}</div>
                </div>
              </div>

              <div className="hero-float-card hero-float-card--4" aria-hidden="true">
                <div className="fc-icon" style={{ color: 'var(--clr-primary)' }}>🚜</div>
                <div>
                  <div className="fc-text-main">
                    <AnimatedNumber target={stats?.total_machines ?? 1200} /> <span>{t('fc_machines')}</span>
                  </div>
                  <div className="fc-text-sub">{t('fc_machines_sub')}</div>
                </div>
              </div>

              {/* Main image */}
              <div className="hero-img-wrap">
                <Image 
                  src="/assets/hero_farm.webp" 
                  alt={t('hero_img_alt')}
                  fill
                  priority
                  fetchPriority="high"
                  placeholder="blur"
                  blurDataURL="data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAAAfQ//73v/+BiOh/AAA="
                  style={{ objectFit: 'cover' }}
                />
              </div>

            </div>
          </div>{/* /.hero-right */}

        </div>{/* /.hero-grid */}
      </div>
    </section>
  );
}
