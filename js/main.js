// ============================================
//   TAUZE CLASS — Main JavaScript
// ============================================

// ─── STATE ───────────────────────────────────
let currentLang = localStorage.getItem('tc_lang') || 'pt';

// ─── LOCATION — detecção em cascata com 4 provedores ─────────
// Provedor 1: GPS do dispositivo + Nominatim reverse-geocode (mais preciso)
// Provedor 2: ipapi.co — gratuito, suporta HTTPS nativo
// Provedor 3: freeipapi.com — contingência secundária, também HTTPS
// Provedor 4: null — fallback global (exibe anúncios sem filtro geo)
// Cache em localStorage com TTL de 24h
const _locationPromise = (async () => {
  const CACHE_KEY = 'user_loc_v5';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

  // Limpa versões antigas de cache de geo
  ['user_loc_v4', 'user_loc_v3', 'user_loc_v2', 'user_loc'].forEach(k => {
    try { localStorage.removeItem(k); } catch (_) {}
  });

  // Lê cache com TTL
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, loc } = JSON.parse(cached);
      if (loc && (loc.city || loc.state || loc.country) && (Date.now() - ts < CACHE_TTL)) {
        console.log('[geo] usando cache (localStorage):', loc);
        return loc;
      }
    }
  } catch (_) {}

  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise(res => setTimeout(() => res(null), ms))
  ]);

  const save = loc => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), loc })); } catch (_) {}
    return loc;
  };

  const normalizeCountry = (c) => {
    if (!c) return null;
    const map = {
      'BR': 'Brasil', 'Brazil': 'Brasil',
      'UY': 'Uruguai', 'Uruguay': 'Uruguai',
      'AR': 'Argentina',
      'PY': 'Paraguai', 'Paraguay': 'Paraguai',
      'CL': 'Chile',
      'CO': 'Colômbia', 'Colombia': 'Colômbia',
      'PE': 'Peru',
      'BO': 'Bolívia', 'Bolivia': 'Bolívia',
      'VE': 'Venezuela',
      'EC': 'Equador', 'Ecuador': 'Equador',
      'US': 'Estados Unidos', 'United States': 'Estados Unidos',
      'PT': 'Portugal'
    };
    return map[c] || map[c.toUpperCase()] || c;
  };

  // ── Provedor 1: GPS + Nominatim (mais preciso, requer permissão) ──
  try {
    const coords = await withTimeout(
      new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('no geolocation'));
        navigator.geolocation.getCurrentPosition(
          pos => res({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          err => rej(err),
          { timeout: 5000, maximumAge: 3600000 }
        );
      }),
      6000
    );
    if (coords) {
      const geo = await withTimeout(
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lon}&format=json&accept-language=pt`)
          .then(r => r.ok ? r.json() : null),
        5000
      );
      if (geo && geo.address) {
        const loc = {
          city:    geo.address.city || geo.address.town || geo.address.village || null,
          state:   geo.address.state || null,
          country: geo.address.country || null,
        };
        console.log('[geo] Provedor 1 — GPS+Nominatim ok:', loc);
        return save(loc);
      }
    }
  } catch (_) {}

  // ── Provedor 2: ipapi.co — gratuito, HTTPS nativo ──
  try {
    const data = await withTimeout(
      fetch('https://ipapi.co/json/')
        .then(r => r.ok ? r.json() : null),
      4000
    );
    if (data && !data.error && data.country_code) {
      const loc = {
        city:    data.city         || null,
        state:   data.region       || null,
        country: normalizeCountry(data.country_code),
      };
      console.log('[geo] Provedor 2 — ipapi.co ok:', loc);
      return save(loc);
    }
  } catch (_) {}

  // ── Provedor 3: freeipapi.com — contingência secundária, HTTPS ──
  try {
    const data = await withTimeout(
      fetch('https://freeipapi.com/api/json')
        .then(r => r.ok ? r.json() : null),
      4000
    );
    if (data && data.countryCode && data.countryCode !== '-') {
      const loc = {
        city:    data.cityName    || null,
        state:   data.regionName  || null,
        country: normalizeCountry(data.countryCode),
      };
      console.log('[geo] Provedor 3 — freeipapi.com ok:', loc);
      return save(loc);
    }
  } catch (_) {}

  // ── Provedor 4: fallback global ──
  console.warn('[geo] Todos os provedores falharam — exibindo resultados globais');
  return null;
})();

// ─── ICONS ───────────────────────────────────
// ICONS object moved to ui_constants.js

function icon(name, size = 20) {
  const svg = ICONS[name] || ICONS.more;
  return svg.replace('<svg', `<svg width="${size}" height="${size}"`);
}

// ─── FAVORITES & RECENTLY VIEWED ─────────────
window.tcFavorites = new Set(JSON.parse(localStorage.getItem('tc_favorites') || '[]'));
window.tcRecentViews = JSON.parse(localStorage.getItem('tc_recent_views') || '[]');
window.recentPage = 0;

/**
 * toggleFavorite — versão unificada.
 * Gerencia estado local (localStorage + UI) com atualização otimista
 * e sincroniza com o banco via _rpcToggleFav (rollback em caso de erro).
 */
// ─── TOAST NOTIFICATION ─────────────────────
// Notificação visual leve, auto-injetada, sem dependência externa
(function injectToastStyles() {
  if (document.getElementById('tc-toast-style')) return;
  const s = document.createElement('style');
  s.id = 'tc-toast-style';
  s.textContent = `
    #tc-toast-container {
      position: fixed; bottom: 24px; right: 24px;
      z-index: 99999; display: flex; flex-direction: column;
      gap: 10px; pointer-events: none;
    }
    .tc-toast {
      display: flex; align-items: center; gap: 10px;
      padding: 13px 18px; border-radius: 12px;
      font-family: var(--font-body,'Inter',sans-serif);
      font-size: .875rem; font-weight: 500; line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 2px 6px rgba(0,0,0,.08);
      pointer-events: auto; min-width: 240px; max-width: 360px;
      animation: tcToastIn .3s cubic-bezier(.34,1.56,.64,1);
      transition: opacity .35s, transform .35s;
    }
    .tc-toast.hiding { opacity: 0; transform: translateY(8px); }
    .tc-toast--error   { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .tc-toast--success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .tc-toast--info    { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .tc-toast--warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    @keyframes tcToastIn {
      from { opacity: 0; transform: translateY(16px) scale(.95); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
  `;
  document.head.appendChild(s);
})();

window.showToast = function(message, type = 'info', durationMs = 4000) {
  let container = document.getElementById('tc-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tc-toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    error:   '❌',
    success: '✅',
    info:    'ℹ️',
    warning: '⚠️',
  };

  const toast = document.createElement('div');
  toast.className = `tc-toast tc-toast--${type}`;
  toast.innerHTML = `<span style="flex-shrink:0;font-size:1rem">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 380);
  };

  const timer = setTimeout(dismiss, durationMs);
  toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
};

async function toggleFavorite(event, adId) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  // Verificar login antes de fazer qualquer coisa
  if (typeof getSession === 'function') {
    const sess = await getSession();
    if (!sess) {
      window.location.href = 'login.html';
      return false;
    }
  }

  const isFav = window.tcFavorites.has(adId);

  // 1. Atualização otimista: estado local imediatamente
  if (isFav) {
    window.tcFavorites.delete(adId);
  } else {
    window.tcFavorites.add(adId);
  }
  localStorage.setItem('tc_favorites', JSON.stringify([...window.tcFavorites]));

  // 2. Atualiza visual de todos os botões deste anúncio na página
  const updateVisuals = (active) => {
    document.querySelectorAll('.ad-card__fav').forEach(btn => {
      if (btn.closest('[aria-label]')?.getAttribute('aria-label') === adId || btn.dataset.adId === adId) {
        btn.classList.toggle('active', active);
      }
    });
  };
  updateVisuals(!isFav);

  // 3. Sincroniza com banco
  let finalState = !isFav;
  if (typeof _rpcToggleFav === 'function') {
    try {
      const serverState = await _rpcToggleFav(adId);
      if (typeof serverState === 'boolean' && serverState !== finalState) {
        if (serverState) window.tcFavorites.add(adId);
        else window.tcFavorites.delete(adId);
        localStorage.setItem('tc_favorites', JSON.stringify([...window.tcFavorites]));
        updateVisuals(serverState);
        finalState = serverState;
      }
    } catch (err) {
      // Rollback: desfaz a atualização otimista e notifica o usuário
      if (isFav) window.tcFavorites.add(adId);
      else window.tcFavorites.delete(adId);
      localStorage.setItem('tc_favorites', JSON.stringify([...window.tcFavorites]));
      updateVisuals(isFav);
      finalState = isFav;
      console.error('[toggleFavorite] Erro ao sincronizar, revertido:', err.message);
      if (typeof window.showToast === 'function') {
        window.showToast('Não foi possível salvar o favorito. Verifique sua conexão e tente novamente.', 'error', 5000);
      }
    }
  }

  return finalState;
}

function isFavorite(adId) {
  return window.tcFavorites.has(adId);
}

function recordRecentView(ad) {
  if (!ad || !ad.id) return;
  window.tcRecentViews = window.tcRecentViews.filter(v => v.id !== ad.id);
  window.tcRecentViews.unshift({
    id: ad.id,
    title_pt: ad.title_pt,
    title_es: ad.title_es,
    price: ad.price,
    currency: ad.currency,
    price_unit_pt: ad.price_unit_pt,
    price_unit_es: ad.price_unit_es,
    location_text: ad.location_text,
    category_id: ad.category_id,
    images: ad.images,
    image: ad.image
  });
  if (window.tcRecentViews.length > 10) window.tcRecentViews.pop();
  localStorage.setItem('tc_recent_views', JSON.stringify(window.tcRecentViews));
}

async function renderRecentlyViewed() {
  const grid = document.getElementById('recently-viewed-ads');
  const section = document.getElementById('recently-viewed-section');
  if (!grid || !section) return;

  if (window.tcRecentViews.length > 0) {
    section.style.display = 'block';
    grid.innerHTML = window.tcRecentViews.map(ad => buildAdCard(ad, currentLang)).join('');
  } else {
    section.style.display = 'none';
  }
}

// ─── LANGUAGE ─────────────────────────────────
let _firstLangSet = true; // controle do FOUC

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('tc_lang', lang);
  document.querySelectorAll('.lang-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  updatePageText();

  // Revela o conteúdo da página após primeira aplicação do idioma correto
  // (evita flash de tradução — FOUC)
  if (_firstLangSet) {
    _firstLangSet = false;
    document.documentElement.style.removeProperty('--tc-fouc-hidden');
    const body = document.body;
    if (body && body.style.visibility === 'hidden') {
      body.style.transition = 'opacity .15s ease';
      body.style.opacity    = '0';
      body.style.visibility = 'visible';
      requestAnimationFrame(() => { body.style.opacity = '1'; });
    }
  }
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
  document.querySelectorAll('option[data-i18n-opt]').forEach(el => {
    el.textContent = t(el.dataset.i18nOpt);
  });
  const countryFirst = document.querySelector('#filter-country option[value=""]');
  if (countryFirst) countryFirst.textContent = t('filter_country_all');
  const stateFirst = document.querySelector('#filter-state option[value=""]');
  if (stateFirst) stateFirst.textContent = t('filter_state_all');
  const cityFirst = document.querySelector('#filter-city option[value=""]');
  if (cityFirst) cityFirst.textContent = t('filter_city_all');
  const listTitle = document.getElementById('list-page-title');
  if (listTitle && listTitle.dataset.catDefault) {
    listTitle.textContent = t('list_title_all');
  }
  if (typeof renderAdsList === 'function') {
    renderAdsList();
  }
  if (typeof updateResultsCount === 'function') {
    updateResultsCount();
  }
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

// ─── SECURITY ─────────────────────────────
window.escapeHTML = function(str) {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
};

// ─── UTILS ────────────────────────────────────
function animateNumbers() {
  const elements = document.querySelectorAll('.num[data-target]');
  elements.forEach(el => {
    const target = parseInt(el.getAttribute('data-target'), 10);
    if (isNaN(target)) return;
    const suffix = el.getAttribute('data-suffix') || '';

    const formatValue = (val) => {
      if (val >= 1000) {
        return (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1).replace('.0', '') + 'k' + suffix;
      }
      return val + suffix;
    };

    let start = 0;
    const duration = 2000;
    const stepTime = Math.abs(Math.floor(duration / 60));
    const increment = target / (duration / stepTime);

    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        el.innerText = formatValue(target);
        clearInterval(timer);
      } else {
        el.innerText = formatValue(Math.ceil(start));
      }
    }, stepTime);
  });
}

// ─── FORMAT CURRENCY ─────────────────────────────
function formatNum(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

// ─── ANIMATE COUNT UP ─────────────────────────
function animateCount(el, target, duration = 1800) {
  const suffix = el.dataset.suffix || '';
  const fmtAbbr = (n) => {
    if (n >= 1e6) return (n/1e6).toFixed(1).replace('.0','') + 'M';
    if (n >= 1000) return (n/1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0','') + 'k';
    return Math.floor(n).toString();
  };
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = fmtAbbr(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ─── INTERSECTION OBSERVER ────────────────────
function initObserver() {
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
  const title = escapeHTML(lang === 'es' ? (ad.title_es || ad.title_pt) : ad.title_pt);

  const rawCatId  = ad.category_id || '';
  const catIdNorm = rawCatId.startsWith('cat-') ? rawCatId.slice(4) : rawCatId;

  let catName = '';
  if (ad.categories && ad.categories.name_pt) {
    catName = escapeHTML(lang === 'es' ? (ad.categories.name_es || ad.categories.name_pt) : ad.categories.name_pt);
  } else {
    const trans = t('cat_' + catIdNorm);
    if (trans !== 'cat_' + catIdNorm) {
      catName = trans;
    } else {
      catName = escapeHTML(lang === 'es' ? (ad.category_es || '') : (ad.category_pt || ''));
    }
  }

  const tags = ad.tags_pt || (lang === 'es' ? ad.tags_es : ad.tags_pt) || [];

  let priceStr = '';
  if (typeof ad.price === 'number') {
    const currency = ad.currency || 'BRL';
    priceStr = new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'pt-BR', { style: 'currency', currency }).format(ad.price);
  } else {
    priceStr = escapeHTML(ad.price);
  }

  const unit  = escapeHTML(lang === 'es' ? ad.price_unit_es : ad.price_unit_pt);
  // Monta localização: usa location_text se disponível, senão compõe cidade + estado
  const locParts = [ad.city, ad.state].filter(Boolean);
  const loc = escapeHTML(ad.location_text || (locParts.length ? locParts.join(', ') : ''));
  const image = ad.images && ad.images.length > 0 ? ad.images[0] : ad.image;

  let dateStr = ad.date || '';
  if (ad.created_at) {
    const d = new Date(ad.created_at);
    dateStr = d.toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR');
  }

  const catColor = (typeof CAT_COLORS !== 'undefined' && CAT_COLORS[catIdNorm])
    ? CAT_COLORS[catIdNorm]
    : { bg: '#F0FDF4', clr: '#16A34A' };

  return `
    <article class="ad-card fade-in-up${ad.featured ? ' ad-card--featured' : ''}"
             onclick="location.href='anuncio.html?id=${ad.id}'" role="listitem" tabindex="0"
             aria-label="${title}"
             onkeydown="if(event.key==='Enter')location.href='anuncio.html?id=${ad.id}'">
      <div class="ad-card__image">
        <img src="${escapeHTML(image)}" alt="${title}" loading="lazy">
        ${catName ? `<div class="ad-card__category-badge" style="background:${catColor.clr}; color:white;">${catName}</div>` : ''}
        <button class="ad-card__fav ${isFavorite(ad.id) ? 'active' : ''}" data-ad-id="${ad.id}" onclick="toggleFavorite(event, '${ad.id}')" title="Favoritar" aria-label="Favoritar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="ad-card__body">
        <h3 class="ad-card__title">${title}</h3>
        <div class="ad-card__price">
          ${priceStr}
          <small>${unit}</small>
        </div>
        <div class="ad-card__tags">
          ${tags.map(tag => `<span class="ad-tag">${escapeHTML(tag)}</span>`).join('')}
          ${ad.negotiable ? `<span class="ad-tag ad-tag--success">${t('negociable')}</span>` : ''}
        </div>
        <div class="ad-card__meta">
          <div class="ad-card__location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${loc}</span>
          </div>
          <span class="ad-card__time">${escapeHTML(dateStr)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderCategories() {
  const customCats = JSON.parse(localStorage.getItem('tc_admin_cats'));
  if (customCats) {
    customCats.forEach(cc => {
      const existing = CATEGORIES.find(x => x.id === cc.id);
      if (existing) {
        existing.name_pt = cc.name;
        if (cc.nameEs) existing.name_es = cc.nameEs;
        existing.icon = cc.icon;
        if (cc.active === false) existing.active = false;
        else existing.active = true;
      } else {
        CATEGORIES.push({
          id: cc.id,
          name_pt: cc.name,
          name_es: cc.nameEs || cc.name,
          icon: cc.icon,
          count: cc.ads || 0,
          active: cc.active !== false
        });
      }
    });
  }

  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  grid.innerHTML = CATEGORIES.filter(c => c.active !== false).map(cat => {
    const colorBg = cat.color ? cat.color + '22' : (CAT_COLORS[cat.id]?.bg || CAT_COLORS.outros.bg);
    const colorClr = cat.color || CAT_COLORS[cat.id]?.clr || CAT_COLORS.outros.clr;

    const isEmoji = cat.icon && !/^[a-z\-]+$/.test(cat.icon);

    return `
    <div class="cat-card fade-in-up" onclick="location.href='listagem.html?cat=${cat.id}'" role="listitem" tabindex="0"
         style="--cat-bg:${colorBg};--cat-clr:${colorClr}"
         onkeydown="if(event.key==='Enter')location.href='listagem.html?cat=${cat.id}'">
      <div class="cat-icon" style="background:${colorBg}; ${isEmoji ? 'font-size:1.6rem;' : ''}">
        ${isEmoji ? cat.icon : `
        <svg viewBox="0 0 24 24" fill="none" stroke="${colorClr}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
          ${getCatSvgPath(cat.icon)}
        </svg>
        `}
      </div>
      <span class="cat-name">${currentLang === 'es' ? cat.name_es : cat.name_pt}</span>
      <span class="cat-count">${formatNum(cat.count)}</span>
    </div>
  `}).join('');

  if (typeof initObserver === 'function') setTimeout(initObserver, 60);
}

// detectUserLocation lê a promise compartilhada
async function detectUserLocation() {
  return _locationPromise;
}

// ─── LOCATION SORT ─────────────────────────────
function sortByLocation(ads, loc) {
  if (!loc) return ads;
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const city = norm(loc.city);
  const state = norm(loc.state);
  const country = norm(loc.country);
  return [...ads].sort((a, b) => {
    const score = ad => {
      const aCity = norm(ad.city); const aState = norm(ad.state); const aCountry = norm(ad.country);
      if (city && aCity === city) return 3;
      if (state && aState === state) return 2;
      if (country && aCountry === country) return 1;
      return 0;
    };
    return score(b) - score(a);
  });
}

// Stubs de compatibilidade — home.js cuida da renderização real
async function renderFeaturedAds() {
  if (typeof renderFeaturedAdsHome === 'function') { renderFeaturedAdsHome(); return; }
  const grid = document.getElementById('featured-ads');
  if (!grid) return;
  const featured = (typeof ADS !== 'undefined') ? ADS.filter(a => a.featured) : [];
  grid.innerHTML = featured.slice(0, 4).map(ad => buildAdCard(ad, currentLang)).join('');
  setTimeout(initObserver, 50);
}

async function renderRecentAds() {
  if (typeof renderRecentAdsHome === 'function') { renderRecentAdsHome(); return; }
  const grid = document.getElementById('recent-ads');
  if (!grid) return;
  const limit = 8;
  const offset = (window.recentPage || 0) * limit;
  const activeAds = (typeof ADS !== 'undefined') ? ADS.filter(a => a.status !== 'inactive') : [];
  const paged = activeAds.slice(offset, offset + limit);
  const html = paged.map(ad => buildAdCard(ad, currentLang)).join('');
  if ((window.recentPage || 0) === 0) grid.innerHTML = html;
  else grid.insertAdjacentHTML('beforeend', html);
  const btn = document.getElementById('btn-load-more');
  if (btn) btn.style.display = activeAds.length > offset + limit ? 'inline-block' : 'none';
  setTimeout(initObserver, 50);
}

function renderCountries() {
  const grid = document.getElementById('countries-grid');
  if (!grid) return;
  grid.innerHTML = COUNTRIES.map(c => `
    <div class="country-card fade-in-up">
      <div class="country-flag">${c.flag}</div>
      <div class="country-name">${currentLang === 'es' ? c.name_es : c.name_pt}</div>
      <div class="country-ads">${c.ads} ${t('country_ads_label')}</div>
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

let cachedPopularTags = {};

async function renderPopularTags() {
  const container = document.getElementById('popular-tags');
  if (!container) return;
  
  let tags = cachedPopularTags[currentLang] || POPULAR_TAGS[currentLang] || POPULAR_TAGS.pt;

  const searchBar = document.querySelector('.hero-search-inner');
  const availableWidth = searchBar ? searchBar.offsetWidth : container.offsetWidth;

  const render = (tgs) => {
    container.innerHTML = tgs.map(t =>
      `<span class="tag-pill" onclick="doSearch('${t}')" style="flex-shrink:0">${t}</span>`
    ).join('');

    const labelWidth = container.previousElementSibling?.offsetWidth || 70;
    const gap = 8;
    let usedWidth = 0;
    const budget = availableWidth - labelWidth - gap * 2;

    Array.from(container.children).forEach(pill => {
      usedWidth += pill.offsetWidth + gap;
      if (usedWidth > budget) pill.remove();
    });
  };
  
  render(tags);

  if (!cachedPopularTags[currentLang]) {
    if (typeof fetchPopularTags === 'function') {
      const dynamicTags = await fetchPopularTags(currentLang);
      if (dynamicTags && dynamicTags.length > 0) {
        cachedPopularTags[currentLang] = dynamicTags;
        render(dynamicTags);
      } else {
        cachedPopularTags[currentLang] = tags;
      }
    }
  }
}

function initPopularTagsObserver() {
  const searchBar = document.querySelector('.hero-search-inner');
  if (!searchBar || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => renderPopularTags()).observe(searchBar);
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
  if (typeof renderCategoriesHome !== 'function') {
    renderCategories();
  }
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
function doSearch(term) {
  const input = document.getElementById('hero-search-input') || document.getElementById('header-search-input');
  const cat   = document.getElementById('hero-category-select');
  const rawTerm = term ? term : (input ? input.value.trim() : '');
  const q     = encodeURIComponent(rawTerm);
  const c     = cat ? cat.value : '';
  
  if (typeof logSearchTerm === 'function' && rawTerm) {
    logSearchTerm(rawTerm, currentLang);
  }
  
  location.href = `listagem.html?q=${q}&cat=${c}`;
}

// ─── INIT UNIVERSAL (todas as páginas) ─────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  initMobileMenu();
  initHeroSelect();

  const langToggle = document.querySelector('.lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', () => {
      const newLang = currentLang === 'pt' ? 'es' : 'pt';
      setLang(newLang);
    });
  }
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.langBtn));
  });

  setLang(currentLang);
  refreshPage();
  setTimeout(() => { initPopularTagsObserver(); }, 100);

  document.querySelectorAll('#hero-search-input, #header-search-input').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href && href !== '#') {
        try {
          const target = document.querySelector(href);
          if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
        } catch (err) {}
      }
    });
  });

  renderRecentlyViewed();
  applyDynamicSettings();
  // syncPlatformSettings roda com delay para não competir com o init do painel
  setTimeout(() => { syncPlatformSettings(); }, 2000);
  updateHeaderAuth();
});

// ─── AUTH STATE UPDATE ───────────────────────
async function updateHeaderAuth() {
  if (typeof getSession !== 'function' || typeof getCurrentUser !== 'function') return;

  // Fast path: renderiza avatar instantaneamente com dados do localStorage
  // sem esperar nenhuma query ao banco
  const cachedIni = localStorage.getItem('tc_user_initials');
  if (cachedIni) {
    _applyAvatarToHeader(cachedIni);
  }

  try {
    const session = await getSession();
    if (!session) return;

    // getCurrentUser usa cache em memória — se o painel já chamou, retorna instantâneo
    const user = await getCurrentUser(session);
    if (!user) return;
    
    const p = user.profile || {};
    const name = p.name || user.email?.split('@')[0] || 'U';
    const ini = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    
    localStorage.setItem('tc_user_initials', ini);
    document.documentElement.style.setProperty('--tc-user-ini', '"' + ini + '"');
    
    // Aplica avatar (se já foi renderizado pelo fast path, apenas atualiza)
    _applyAvatarToHeader(ini);

    // Favoritos: sincroniza em background SEM bloquear renderização
    if (typeof getMyFavorites === 'function') {
      getMyFavorites().then(() => {
        document.querySelectorAll('.ad-card__fav').forEach(btn => {
          const adId = btn.dataset.adId || btn.closest('[aria-label]')?.getAttribute('aria-label');
          if (adId) btn.classList.toggle('active', isFavorite(adId));
        });
        const favBtn = document.getElementById('btn-favorite');
        if (favBtn) {
          const saved = isFavorite(favBtn.dataset.adId || new URLSearchParams(location.search).get('id'));
          if (saved) {
            favBtn.style.color = '#ef4444';
            favBtn.style.borderColor = '#ef4444';
            favBtn.textContent = '❤️ Salvo';
          } else {
            favBtn.style.color = '';
            favBtn.style.borderColor = '';
            favBtn.textContent = '🤍 Salvar';
          }
        }
      }).catch(e => {
        console.error('Erro ao sincronizar favoritos:', e);
      });
    }

  } catch (e) {
    console.error('Erro ao verificar sessão:', e);
  }
}

// Função helper para aplicar o avatar no header sem duplicar código
function _applyAvatarToHeader(ini) {
  document.querySelectorAll('.header-nav, .mobile-menu').forEach(nav => {
    const loginBtn = nav.querySelector('a[href="login.html"]');
    if (loginBtn) {
      const avatar = document.createElement('a');
      avatar.id = 'header-avatar';
      avatar.href = 'painel.html';
      avatar.style = 'width:40px;height:40px;border-radius:50%;background:var(--clr-primary,#16a34a);color:white !important;display:flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer;font-size:.9rem;transition:transform .2s;text-decoration:none;padding:0;margin:0;';
      avatar.onmouseover = () => avatar.style.transform = 'scale(1.05)';
      avatar.onmouseout = () => avatar.style.transform = 'scale(1)';
      avatar.textContent = ini;
      avatar.title = 'Meu Painel';
      loginBtn.replaceWith(avatar);
    }
    const planosBtn = nav.querySelector('a[href="planos.html"]');
    if (planosBtn) {
      planosBtn.style.display = 'none';
    }
  });
}

// ─── DYNAMIC CONFIGURATIONS ────────────────
async function syncPlatformSettings() {
  if (typeof getSupabase !== 'function') return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('platform_settings').select('*');
    if (!error && data && data.length > 0) {
      let changed = false;
      data.forEach(s => {
        if (localStorage.getItem(s.key) !== s.value) {
           localStorage.setItem(s.key, s.value);
           changed = true;
        }
      });
      if (changed) applyDynamicSettings();
    }
  } catch(e) {}
}

function applyDynamicSettings() {
  const logoUrl = localStorage.getItem('tc_logo_url');
  const heroTitle = localStorage.getItem('tc_hero_title');
  const primaryColor = localStorage.getItem('tc_primary_color');

  if (logoUrl) {
    document.querySelectorAll('.logo-mark, .adm-logo-mark').forEach(el => {
      el.textContent = '';
      el.style.backgroundImage = `url('${logoUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundColor = 'transparent';
    });
  }

  if (heroTitle) {
    const heroH1 = document.querySelector('.hero-content h1');
    if (heroH1) heroH1.textContent = heroTitle;
  }

  if (primaryColor) {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --clr-primary: ${primaryColor} !important;
        --clr-primary-mid: ${primaryColor} !important;
      }
    `;
    document.head.appendChild(style);
  }

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
// AD BANNER RENDERER
// ─────────────────────────────────────────────────────────────
window.renderAdBanner = async function(position, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isSidebar = position.includes('sidebar');
  let heightStyle = isSidebar ? '250px' : '120px';

  let activeBanners = [];
  try {
    if (typeof getBanners === 'function') {
      activeBanners = await getBanners(position);
    }
  } catch (e) {
    console.error('Falha ao carregar banners:', e);
  }

  if (activeBanners && activeBanners.length > 0) {
    const b = activeBanners[0];
    const imageUrl  = b.image_url || b.image || '';
    const linkUrl   = b.link_url  || b.link  || '#';
    const bannerName = b.name || 'Banner';

    container.innerHTML = `
      <div class="ad-banner-wrapper" style="width:100%;height:${heightStyle};position:relative;margin:1.5rem 0;overflow:hidden;border-radius:12px;background:#000;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <a href="${linkUrl}" target="_blank" rel="noopener sponsored" style="display:block;width:100%;height:100%;position:relative;">
          <img src="${imageUrl}" alt="${bannerName}" style="width:100%;height:100%;object-fit:cover;opacity:0.85;transition:opacity 0.3s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'" loading="lazy">
        </a>
      </div>`;
    return;
  }

  // Sem banners ativos — sem placeholder
  container.innerHTML = '';
};
