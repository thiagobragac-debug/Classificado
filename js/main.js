// ============================================
//   TAUZE CLASS — Main JavaScript
// ============================================

// ─── STATE ───────────────────────────────────
let currentLang = localStorage.getItem('tc_lang') || 'pt';

// ─── ICONS ───────────────────────────────────
// ICONS object moved to ui_constants.js

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

// ─── SECURITY ─────────────────────────────────
window.escapeHTML = function(str) {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
};

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
    let delayIndex = 0;
    let delayTimeout = null;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), delayIndex * 80);
          delayIndex++;
          obs.unobserve(e.target);
        }
      });
      clearTimeout(delayTimeout);
      delayTimeout = setTimeout(() => { delayIndex = 0; }, 100);
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
  const title = escapeHTML(lang === 'es' ? ad.title_es : ad.title_pt);
  const cat   = escapeHTML(lang === 'es' ? ad.category_es : ad.category_pt);
  const tags  = lang === 'es' ? ad.tags_es : ad.tags_pt;
  const price = escapeHTML(ad.price);
  const unit  = escapeHTML(lang === 'es' ? ad.price_unit_es : ad.price_unit_pt);
  const loc   = escapeHTML(ad.location);

  // Pick stripe color from category
  const catId = CATEGORIES.find(c => (lang === 'es' ? c.name_es : c.name_pt) === (lang === 'es' ? ad.category_es : ad.category_pt))?.id || 'outros';
  const catColor = (typeof CAT_COLORS !== 'undefined' && CAT_COLORS[catId]) ? CAT_COLORS[catId] : { bg: '#F0FDF4', clr: '#16A34A' };

  return `
    <article class="ad-card fade-in-up${ad.featured ? ' ad-card--featured' : ''}"
             onclick="location.href='anuncio.html?id=${ad.id}'" role="listitem" tabindex="0"
             aria-label="${title}"
             onkeydown="if(event.key==='Enter')location.href='anuncio.html?id=${ad.id}'">
      <div class="ad-card__image">
        <img src="${escapeHTML(ad.image)}" alt="${title}" loading="lazy">
        <button class="ad-card__fav" onclick="event.stopPropagation(); toggleFavorite(this)" title="Favoritar" aria-label="Favoritar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="ad-card__stripe" style="background:linear-gradient(90deg,${catColor.clr}cc,${catColor.clr}44)"></div>
      <div class="ad-card__body">
        <div class="ad-card__category" style="color:${catColor.clr}">${cat}</div>
        <h3 class="ad-card__title">${title}</h3>
        <div class="ad-card__tags">
          ${tags.map(tag => `<span class="ad-tag">${escapeHTML(tag)}</span>`).join('')}
          ${ad.negotiable ? `<span class="ad-tag" style="color:var(--clr-success);background:#DCFCE7;font-weight:600">${t('negociable')}</span>` : ''}
        </div>
        <div class="ad-card__price">
          ${price}
          <small>${unit}</small>
        </div>
        <div class="ad-card__meta">
          <div class="ad-card__location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${loc}</span>
          </div>
          <span class="ad-card__time">${escapeHTML(ad.date)}</span>
        </div>
      </div>
    </article>
  `;
}


// ─── CATEGORY COLOR MAP ──────────────────────
// CAT_COLORS object moved to ui_constants.js

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

// getCatSvgPath function moved to ui_constants.js


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
      <div class="ad-banner-wrapper" style="width: 100%; display: flex; justify-content: center; margin: 1.5rem 0; overflow: hidden; border-radius: 8px; background: rgba(0,0,0,0.02);">
        <a href="${b.link}" target="_blank" rel="noopener sponsored" style="display: block; width: 100%; text-align: center;">
          <img src="${b.image}" alt="${b.name}" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'728\\\' height=\\\'90\\\' viewBox=\\\'0 0 728 90\\\'%3E%3Crect width=\\\'728\\\' height=\\\'90\\\' fill=\\\'%23f3f4f6\\\'/%3E%3Ctext x=\\\'50%25\\\' y=\\\'50%25\\\' dominant-baseline=\\\'middle\\\' text-anchor=\\\'middle\\\' fill=\\\'%239ca3af\\\' font-family=\\\'sans-serif\\\' font-size=\\\'16\\\' font-weight=\\\'bold\\\'%3EImagem do Banner Indisponível%3C/text%3E%3C/svg%3E';" style="max-width: 100%; max-height: ${pHeight}; object-fit: contain; display: block; margin: 0 auto; border-radius: 8px;">
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
