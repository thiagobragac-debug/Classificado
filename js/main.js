// ============================================
//   TAUZE CLASS — Main JavaScript
// ============================================

// ─── STATE ───────────────────────────────────
let currentLang = localStorage.getItem('tc_lang') || 'pt';

// ─── ICONS ───────────────────────────────────
const ICONS = {
  cow: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/></svg>`,
  horse: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8c0-3.31-2.69-6-6-6-1.5 0-2.87.55-3.9 1.46C9.1 4.18 8 5 6 5c-1.5 0-2.78.74-3.55 1.88L2 8c0 2.21 1.79 4 4 4v8h4v-4h4v4h4v-8c2.21 0 4-1.79 4-4z"/></svg>`,
  pig: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6"/><path d="M12 6v.01M12 18v.01M18 12h.01M6 12h.01"/><circle cx="12" cy="12" r="2"/></svg>`,
  sheep: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><path d="M5 17h14l-1-4H6l-1 4z"/><line x1="9" y1="21" x2="9" y2="17"/><line x1="15" y1="21" x2="15" y2="17"/></svg>`,
  bird: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8C8 10 5.9 16.17 3.82 19.34L2 22"/><path d="M17 8C8 10 5 19 2 22c7-2 14-4 19-11 0 0 2-10-4-3z"/></svg>`,
  tractor: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3V5h11l4 6h2v6h-2"/><path d="M9 17h4"/></svg>`,
  house: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>`,
  dna: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M2 9c6.667-6 13.333 0 20-6"/></svg>`,
  fish: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 3.13-.07 7.05 2 8.5 2.12 1.46 4.27 0 5.27-3.83"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  'map-pin': `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  'message-circle': `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.553 4.122 1.523 5.855L.057 23.268a.5.5 0 0 0 .618.635l5.579-1.461A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.924 0-3.72-.523-5.256-1.43l-.377-.224-3.914 1.025 1.044-3.81-.246-.393A9.716 9.716 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>`,
  'arrow-right': `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

function icon(name, size = 20) {
  const svg = ICONS[name] || ICONS.more;
  return svg.replace('<svg', `<svg width="${size}" height="${size}"`);
}

// ─── LANGUAGE ─────────────────────────────────
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('tc_lang', lang);
  document.querySelectorAll('.lang-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  updatePageText();
}

function t(key) {
  return (I18N[currentLang] || I18N.pt)[key] || key;
}

function updatePageText() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

// ─── HEADER SCROLL ────────────────────────────
function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });
}

// ─── MOBILE MENU ──────────────────────────────
function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
    }
  });
}

// ─── FAVORITES ────────────────────────────────
function toggleFavorite(btn) {
  btn.classList.toggle('active');
  const isActive = btn.classList.contains('active');
  btn.title = isActive ? 'Remover dos favoritos' : 'Favoritar';
  btn.innerHTML = icon('heart', 16);
  if (isActive) btn.querySelector('svg').style.cssText = 'fill:#EF4444;stroke:#EF4444';
}

// ─── FORMAT NUMBER ─────────────────────────────
function formatNum(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

// ─── ANIMATE COUNT UP ─────────────────────────
function animateCount(el, target, duration = 1800) {
  const isFloat = target % 1 !== 0;
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = isFloat ? (eased * target).toFixed(1) : Math.floor(eased * target);
    el.textContent = formatNum(val) + (el.dataset.suffix || '');
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ─── INTERSECTION OBSERVER ────────────────────
function initObserver() {
  // Fade in elements
  const fadeEls = document.querySelectorAll('.fade-in-up');
  if (fadeEls.length) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), i * 80);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    fadeEls.forEach(el => obs.observe(el));
  }

  // Count up stats
  const statNums = document.querySelectorAll('.stat-number[data-target]');
  if (statNums.length) {
    const obs2 = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCount(e.target, parseFloat(e.target.dataset.target));
          obs2.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach(el => obs2.observe(el));
  }
}

// ─── BUILD AD CARD ────────────────────────────
function buildAdCard(ad, lang) {
  const title = lang === 'es' ? ad.title_es : ad.title_pt;
  const cat   = lang === 'es' ? ad.category_es : ad.category_pt;
  const tags  = lang === 'es' ? ad.tags_es : ad.tags_pt;

  // Pick stripe color from category
  const catId = CATEGORIES.find(c => (lang === 'es' ? c.name_es : c.name_pt) === cat)?.id || 'outros';
  const catColor = (typeof CAT_COLORS !== 'undefined' && CAT_COLORS[catId]) ? CAT_COLORS[catId] : { bg: '#F0FDF4', clr: '#16A34A' };

  return `
    <article class="ad-card fade-in-up${ad.featured ? ' ad-card--featured' : ''}"
             onclick="location.href='anuncio.html?id=${ad.id}'" role="listitem" tabindex="0"
             aria-label="${title}"
             onkeydown="if(event.key==='Enter')location.href='anuncio.html?id=${ad.id}'">
      <div class="ad-card__image">
        <img src="${ad.image}" alt="${title}" loading="lazy">
        <button class="ad-card__fav" onclick="event.stopPropagation(); toggleFavorite(this)" title="Favoritar" aria-label="Favoritar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="ad-card__stripe" style="background:linear-gradient(90deg,${catColor.clr}cc,${catColor.clr}44)"></div>
      <div class="ad-card__body">
        <div class="ad-card__category" style="color:${catColor.clr}">${cat}</div>
        <h3 class="ad-card__title">${title}</h3>
        <div class="ad-card__tags">
          ${tags.map(tag => `<span class="ad-tag">${tag}</span>`).join('')}
          ${ad.negotiable ? `<span class="ad-tag" style="color:var(--clr-success);background:#DCFCE7;font-weight:600">${t('negociable')}</span>` : ''}
        </div>
        <div class="ad-card__price">
          ${ad.price}
          <small>${lang === 'es' ? ad.price_unit_es : ad.price_unit_pt}</small>
        </div>
        <div class="ad-card__meta">
          <div class="ad-card__location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${ad.location}</span>
          </div>
          <span class="ad-card__time">${ad.date}</span>
        </div>
      </div>
    </article>
  `;
}


// ─── CATEGORY COLOR MAP ──────────────────────
const CAT_COLORS = {
  bovinos:  { bg: '#FFFBEB', clr: '#D97706' },
  equinos:  { bg: '#FEF3C7', clr: '#B45309' },
  suinos:   { bg: '#FFF7ED', clr: '#EA580C' },
  ovinos:   { bg: '#F0FDF4', clr: '#16A34A' },
  aves:     { bg: '#EFF6FF', clr: '#2563EB' },
  insumos:  { bg: '#F0FDF4', clr: '#15803D' },
  maquinas: { bg: '#EFF6FF', clr: '#1D4ED8' },
  imoveis:  { bg: '#F5F3FF', clr: '#7C3AED' },
  genetica: { bg: '#FDF2F8', clr: '#DB2777' },
  aquicult: { bg: '#ECFEFF', clr: '#0891B2' },
  servicos: { bg: '#FFF7ED', clr: '#C2410C' },
  outros:   { bg: '#F8FAFC', clr: '#475569' },
};

// ─── RENDER SECTIONS ──────────────────────────
function renderCategories() {
  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  grid.innerHTML = CATEGORIES.map(cat => {
    const color = CAT_COLORS[cat.id] || CAT_COLORS.outros;
    return `
    <div class="cat-card fade-in-up" onclick="location.href='listagem.html?cat=${cat.id}'" role="listitem" tabindex="0"
         style="--cat-bg:${color.bg};--cat-clr:${color.clr}"
         onkeydown="if(event.key==='Enter')location.href='listagem.html?cat=${cat.id}'">
      <div class="cat-icon" style="background:${color.bg}">
        <svg viewBox="0 0 24 24" fill="none" stroke="${color.clr}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
          ${getCatSvgPath(cat.icon)}
        </svg>
      </div>
      <span class="cat-name">${currentLang === 'es' ? cat.name_es : cat.name_pt}</span>
      <span class="cat-count">${formatNum(cat.count)}</span>
    </div>
  `}).join('');
}

function getCatSvgPath(icon) {
  const paths = {
    cow:     '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/>',
    horse:   '<path d="M20 8c0-3.31-2.69-6-6-6-1.5 0-2.87.55-3.9 1.46C9.1 4.18 8 5 6 5c-1.5 0-2.78.74-3.55 1.88L2 8c0 2.21 1.79 4 4 4v8h4v-4h4v4h4v-8c2.21 0 4-1.79 4-4z"/>',
    pig:     '<circle cx="12" cy="12" r="6"/><path d="M12 6v.01M12 18v.01M18 12h.01M6 12h.01"/><circle cx="12" cy="12" r="2"/>',
    sheep:   '<circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><path d="M5 17h14l-1-4H6l-1 4z"/><line x1="9" y1="21" x2="9" y2="17"/><line x1="15" y1="21" x2="15" y2="17"/>',
    bird:    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    leaf:    '<path d="M17 8C8 10 5.9 16.17 3.82 19.34L2 22"/><path d="M17 8C8 10 5 19 2 22c7-2 14-4 19-11 0 0 2-10-4-3z"/>',
    tractor: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3V5h11l4 6h2v6h-2"/><path d="M9 17h4"/>',
    house:   '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/>',
    dna:     '<path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M2 9c6.667-6 13.333 0 20-6"/>',
    fish:    '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/>',
    wrench:  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    more:    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  };
  return paths[icon] || paths.more;
}


function renderFeaturedAds() {
  const grid = document.getElementById('featured-ads');
  if (!grid) return;
  const featured = ADS.filter(a => a.featured);
  grid.innerHTML = featured.map(ad => buildAdCard(ad, currentLang)).join('');
}

function renderRecentAds() {
  const grid = document.getElementById('recent-ads');
  if (!grid) return;
  grid.innerHTML = ADS.map(ad => buildAdCard(ad, currentLang)).join('');
}

function renderCountries() {
  const grid = document.getElementById('countries-grid');
  if (!grid) return;
  grid.innerHTML = COUNTRIES.map(c => `
    <div class="country-card fade-in-up">
      <div class="country-flag">${c.flag}</div>
      <div class="country-name">${currentLang === 'es' ? c.name_es : c.name_pt}</div>
      <div class="country-ads">${c.ads} anúncios</div>
    </div>
  `).join('');
}

function renderTrustItems() {
  const grid = document.getElementById('trust-grid');
  if (!grid) return;
  grid.innerHTML = TRUST_ITEMS.map(item => `
    <div class="trust-item fade-in-up">
      <div class="trust-icon">${icon(item.icon, 28)}</div>
      <h4 class="trust-title">${currentLang === 'es' ? item.title_es : item.title_pt}</h4>
      <p class="trust-desc">${currentLang === 'es' ? item.desc_es : item.desc_pt}</p>
    </div>
  `).join('');
}

function renderPopularTags() {
  const container = document.getElementById('popular-tags');
  if (!container) return;
  const tags = POPULAR_TAGS[currentLang] || POPULAR_TAGS.pt;
  const pills = tags.map(t => `<span class="tag-pill" onclick="search('${t}')">${t}</span>`).join('');
  container.innerHTML = pills;
}

function renderFooterLinks() {
  const links = FOOTER_LINKS[currentLang] || FOOTER_LINKS.pt;
  ['footer-ads', 'footer-help', 'footer-company'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = ['ads', 'help', 'company'][i];
    el.innerHTML = links[key].map(l => `<li><a href="#">${l}</a></li>`).join('');
  });
}

// ─── FULL PAGE REFRESH ────────────────────────
function refreshPage() {
  updatePageText();
  renderCategories();
  renderFeaturedAds();
  renderRecentAds();
  renderCountries();
  renderTrustItems();
  renderPopularTags();
  renderFooterLinks();
  setTimeout(initObserver, 50);
}

// ─── HERO CATEGORY SELECT ─────────────────────
function initHeroSelect() {
  const sel = document.getElementById('hero-category-select');
  if (!sel) return;
  const opts = ['Todos', ...CATEGORIES.map(c => currentLang === 'es' ? c.name_es : c.name_pt)];
  sel.innerHTML = opts.map((o, i) => `<option value="${i === 0 ? '' : CATEGORIES[i-1].id}">${o}</option>`).join('');
}

// ─── SEARCH ───────────────────────────────────
function doSearch() {
  const input = document.getElementById('hero-search-input') || document.getElementById('header-search-input');
  const cat   = document.getElementById('hero-category-select');
  const q     = input ? encodeURIComponent(input.value.trim()) : '';
  const c     = cat ? cat.value : '';
  location.href = `listagem.html?q=${q}&cat=${c}`;
}

// ─── INIT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileMenu();
  initHeroSelect();

  // Language toggles
  document.querySelectorAll('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.langBtn));
  });

  // Init UI
  setLang(currentLang);
  refreshPage();

  // Hero search enter key
  document.querySelectorAll('#hero-search-input, #header-search-input').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  });

  // Smooth scroll for anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  applyDynamicSettings();
});

// ─── DYNAMIC CONFIGURATIONS ────────────────
function applyDynamicSettings() {
  const logoUrl = localStorage.getItem('tc_logo_url');
  const heroTitle = localStorage.getItem('tc_hero_title');
  const primaryColor = localStorage.getItem('tc_primary_color');

  // Apply Logo
  if (logoUrl) {
    document.querySelectorAll('.logo-mark, .adm-logo-mark').forEach(el => {
      el.textContent = '';
      el.style.backgroundImage = `url('${logoUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundColor = 'transparent';
    });
  }

  // Apply Hero Title
  if (heroTitle) {
    const heroH1 = document.querySelector('.hero-content h1');
    if (heroH1) heroH1.textContent = heroTitle;
  }

  // Apply Primary Color
  if (primaryColor) {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --clr-primary: ${primaryColor} !important;
        --clr-primary-dark: ${primaryColor} !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Toggles
  const featAuctions = localStorage.getItem('tc_feat_auctions') !== '0';
  const featPlans = localStorage.getItem('tc_feat_plans') !== '0';
  const featSocial = localStorage.getItem('tc_feat_social_login') !== '0';

  if (!featAuctions) {
    document.querySelectorAll('.nav-live, [href="leiloes.html"]').forEach(el => el.style.display = 'none');
  }

  if (!featPlans) {
    document.querySelectorAll('[href="planos.html"]').forEach(el => el.style.display = 'none');
  }

  if (!featSocial) {
    document.querySelectorAll('.social-login, .divider').forEach(el => el.style.display = 'none');
  }
}

// ─────────────────────────────────────────────────────────────
// AD BANNER RENDERER (Monetization Strategy)
// ─────────────────────────────────────────────────────────────
window.renderAdBanner = function(position, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const banners = JSON.parse(localStorage.getItem('tc_banners')) || [];
  const activeBanners = banners.filter(b => b.status === 'active' && b.position === position);
  
  // Basic dimensions mapping for placeholders
  let pWidth = '100%';
  let pHeight = '90px';
  let pFormat = 'Leaderboard (728x90)';
  
  if (position.includes('sidebar')) {
    pHeight = '250px';
    pFormat = 'Medium Rectangle (300x250)';
  } else if (position === 'leilao_footer') {
    pHeight = '90px';
    pFormat = 'Sponsor Banner';
  }

  if (activeBanners.length > 0) {
    // Pick a random banner for that position (simple rotation)
    const b = activeBanners[Math.floor(Math.random() * activeBanners.length)];
    container.innerHTML = `
      <div class="ad-banner-wrapper" style="width: 100%; display: flex; justify-content: center; margin: 1.5rem 0; overflow: hidden; border-radius: 8px;">
        <a href="${b.link}" target="_blank" rel="noopener sponsored" style="display: block; width: 100%; text-align: center;">
          <img src="${b.image}" alt="${b.name}" style="max-width: 100%; max-height: ${pHeight}; object-fit: contain; display: block; margin: 0 auto; border-radius: 8px;">
        </a>
      </div>
    `;
  } else {
    // Placeholder - Anuncie Aqui
    container.innerHTML = `
      <div class="ad-banner-placeholder" style="width: 100%; height: ${pHeight}; background: rgba(0,0,0,0.03); border: 2px dashed rgba(0,0,0,0.1); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 1.5rem 0; cursor: pointer; transition: all 0.3s;" onclick="window.location.href='planos.html'" onmouseover="this.style.background='rgba(0,0,0,0.05)'; this.style.borderColor='var(--clr-primary)'" onmouseout="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='rgba(0,0,0,0.1)'">
        <span style="font-weight: 700; color: var(--clr-text); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px;">Anuncie Aqui</span>
        <span style="font-size: 0.8rem; color: var(--clr-text-light); margin-top: 4px;">Formato: ${pFormat}</span>
      </div>
    `;
  }
};
