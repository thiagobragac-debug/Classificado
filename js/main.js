// ============================================
//   TAUZE CLASS — Main JavaScript
// ============================================

// ─── STATE ───────────────────────────────────
let currentLang = localStorage.getItem('tc_lang') || null; // null = still auto-detecting

// ─── LANG AUTO-DETECT ────────────────────────────────────────────
// Hierarquia de prioridade:
//   1. tc_lang_manual (escolha manual do usuario — sempre prevalece)
//   2. Pais do usuario logado (perfil Supabase)
//   3. Idioma do navegador (navigator.language)
//   4. Padrao: 'pt'

/** Mapeia um codigo/nome de pais ao idioma do site */
function _countryToLang(country) {
  if (!country) return null;
  const c = country.toString().toUpperCase().trim();
  // Paises do Mercosul que falam espanhol
  const esCountries = ['AR','ARGENTINA','UY','URUGUAI','URUGUAY','PY','PARAGUAI','PARAGUAY','BO','BOLIVIA','VE','VENEZUELA','CL','CHILE','CO','COLOMBIA','PE','PERU','EC','ECUADOR'];
  if (esCountries.includes(c)) return 'es';
  // Brasil fala portugues
  if (['BR','BRASIL','BRAZIL'].includes(c)) return 'pt';
  return null;
}

/** Detecta idioma pelo navegador (navigator.language) */
function _browserLang() {
  const bl = (navigator.language || navigator.userLanguage || 'pt').toLowerCase();
  if (bl.startsWith('pt')) return 'pt';
  if (bl.startsWith('es')) return 'es';
  return null;
}

/** Retorna o idioma salvo manualmente pelo usuario (clique no botao PT/ES) */
function _manualLang() {
  return localStorage.getItem('tc_lang_manual') || null;
}

/** Determina o idioma inicial antes de ter o perfil do usuario */
function _getInitialLang() {
  // 1. Escolha manual sempre prevalece
  const manual = _manualLang();
  if (manual) return manual;
  // 2. Idioma do navegador como estimativa rapida
  return _browserLang() || 'pt';
}

currentLang = _getInitialLang();

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
        // console.log('[geo] usando cache (localStorage):', loc);
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
        // console.log('[geo] Provedor 1 — GPS+Nominatim ok:', loc);
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
      // console.log('[geo] Provedor 2 — ipapi.co ok:', loc);
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
      // console.log('[geo] Provedor 3 — freeipapi.com ok:', loc);
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
  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = 'flex-shrink:0;font-size:1rem';
  iconSpan.textContent = icons[type] || 'ℹ️';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
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

  // Removida verificação de login: permite favoritar deslogado (apenas localmente)

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
  // Marca como escolha MANUAL do usuario (nao sera sobreposta por auto-deteccao)
  localStorage.setItem('tc_lang_manual', lang);
  document.querySelectorAll('.lang-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  updatePageText();
  // Se estiver no painel, atualiza o campo de documento (Mercosul)
  if (typeof updateDocField === 'function') updateDocField();

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
  const dict = I18N[currentLang] || I18N.pt;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      if (key.includes('_html_')) {
        el.innerHTML = dict[key];
      } else {
        el.textContent = dict[key];
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key]) el.placeholder = dict[key];
  });
  document.querySelectorAll('option[data-i18n-opt]').forEach(el => {
    const key = el.dataset.i18nOpt;
    if (dict[key]) el.textContent = dict[key];
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
function animateCount(el, target, duration = 1800, format = null) {
  const suffix = el.dataset.suffix || '';
  const fmt = format || el.dataset.format || 'k';
  const fmtAbbr = (n) => {
    if (fmt === 'full') return Math.floor(n).toLocaleString('pt-BR');
    if (fmt === 'mil' && n >= 1000) return (n/1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0','') + 'mil';
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
  if (ad.price != null && ad.price !== '') {
    const numPrice = Number(ad.price);
    if (!isNaN(numPrice)) {
      const currency = ad.currency || 'BRL';
      priceStr = new Intl.NumberFormat(lang === 'es' ? 'es-AR' : 'pt-BR', { style: 'currency', currency }).format(numPrice);
    } else {
      priceStr = escapeHTML(ad.price);
    }
  }

  const unit  = escapeHTML(lang === 'es' ? ad.price_unit_es : ad.price_unit_pt);
  
  const flags = {
    'Brasil': '🇧🇷',
    'Argentina': '🇦🇷',
    'Paraguai': '🇵🇾',
    'Uruguai': '🇺🇾',
    'Bolivia': '🇧🇴',
    'Chile': '🇨🇱',
    'Colombia': '🇨🇴'
  };

  const locParts = [ad.city, ad.state].filter(Boolean);
  let locStr = locParts.length ? locParts.join(', ') : '';
  if (ad.country) {
    const flag = flags[ad.country] || '🌎';
    locStr += (locStr ? ' — ' : '') + `${flag} ${ad.country}`;
  }
  const loc = escapeHTML(ad.location_text || locStr);
  
  let image = ad.images && ad.images.length > 0 ? ad.images[0] : ad.image;
  if (!image) image = 'https://placehold.co/400x300?text=Sem+Foto';

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
  if (customCats && customCats.length > 0) {
    CATEGORIES.length = 0; // Clear mock categories if DB/Admin is available
    customCats.forEach(cc => {
        CATEGORIES.push({
          id: cc.id,
          name_pt: cc.name,
          name_es: cc.nameEs || cc.name,
          icon: cc.icon,
          color: cc.color || '',
          count: cc.ads || 0,
          active: cc.active !== false
        });
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
    container.innerHTML = '';
    tgs.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag-pill';
      span.textContent = t; // textContent escapes automatically
      span.style.flexShrink = '0';
      span.addEventListener('click', () => doSearch(t));
      container.appendChild(span);
    });

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
    el.innerHTML = links[key].map(l => `<li><a href="${l.href}">${l.label}</a></li>`).join('');
  });
}

// ─── FULL PAGE REFRESH ────────────────────────
function refreshPage() {
  updatePageText();
  if (typeof renderCategoriesHome !== 'function') {
    renderCategories();
  }
  
  
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

  // ── Auto-detect por pais do usuario logado (async, sem bloquear UI) ──
  (async () => {
    // Se usuario ja escolheu manualmente, respeitar sempre
    if (_manualLang()) return;
    try {
      if (typeof getSession !== 'function') return;
      const session = await getSession();
      if (!session) return;
      const user = await getCurrentUser();
      const pais = user?.profile?.pais || user?.profile?.country || null;
      const detectedLang = _countryToLang(pais);
      if (detectedLang && detectedLang !== currentLang) {
        // Aplica o idioma detectado pelo pais do perfil
        // (sem marcar como 'manual' para nao bloquear futura auto-deteccao)
        currentLang = detectedLang;
        localStorage.setItem('tc_lang', detectedLang);
        setLang(detectedLang);
      }
    } catch (_) {
      // Silencioso — nao quebra nada se falhar
    }
  })();

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
  syncPlatformSettings(); // async background update
  updateHeaderAuth();
});

// ─── AUTH STATE UPDATE ───────────────────────
async function updateHeaderAuth() {
  if (typeof getSession !== 'function' || typeof getCurrentUser !== 'function') return;
  try {
    const session = await getSession();
    if (!session) return;
    const user = await getCurrentUser();
    if (!user) return;
    
    const p = user.profile || {};
    const name = p.display_name || p.name || user.email?.split('@')[0] || 'U';
    const ini = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    
    // Salva para o anti-flicker CSS usar na próxima tela imediatamente
    localStorage.setItem('tc_user_initials', ini);
    document.documentElement.style.setProperty('--tc-user-ini', '"' + ini + '"');
    
    document.querySelectorAll('.header-nav, .mobile-menu').forEach(nav => {
      const authWrapper = nav.querySelector('.auth-wrapper');
      if (authWrapper) {
        const wrapper = document.createElement('div');
        wrapper.className = 'header-user-wrapper';
        wrapper.style = 'position:relative;display:flex;align-items:center;gap:16px;';

        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'msg-wrapper';
        msgWrapper.style = 'position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#f8fafc;transition:background 0.2s, box-shadow 0.2s;border:1px solid #e2e8f0;';
        msgWrapper.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: stroke 0.2s, transform 0.2s;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
        msgWrapper.onclick = () => window.location.href = 'painel.html#messages';
        msgWrapper.onmouseover = () => msgWrapper.style.background = '#f1f5f9';
        msgWrapper.onmouseout = () => msgWrapper.style.background = '#f8fafc';
        msgWrapper.title = 'Minhas Mensagens';

        const msgBadge = document.createElement('span');
        msgBadge.className = 'msg-badge';
        msgBadge.style = 'position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;font-size:10px;font-weight:800;width:18px;height:18px;border-radius:50%;display:none;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 4px rgba(239,68,68,0.3);';
        msgWrapper.appendChild(msgBadge);
        wrapper.appendChild(msgWrapper);

        const avatar = document.createElement('div');
        avatar.id = 'header-avatar';
        avatar.style = 'width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg, var(--clr-primary), #0ea5e9);color:white !important;display:flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer;font-size:1rem;transition:all .3s cubic-bezier(0.4, 0, 0.2, 1);user-select:none;box-shadow:0 4px 10px rgba(22, 163, 74, 0.25);border:2px solid #fff;';
        avatar.onmouseover = () => { avatar.style.transform = 'scale(1.08) translateY(-2px)'; avatar.style.boxShadow = '0 6px 14px rgba(22, 163, 74, 0.35)'; };
        avatar.onmouseout = () => { avatar.style.transform = 'scale(1) translateY(0)'; avatar.style.boxShadow = '0 4px 10px rgba(22, 163, 74, 0.25)'; };
        avatar.textContent = ini;
        avatar.title = 'Minha Conta';

        const dropdown = document.createElement('div');
        dropdown.className = 'header-user-dropdown';
        dropdown.style = 'position:absolute;top:120%;right:0;background:#ffffff;min-width:260px;border-radius:16px;box-shadow:0 20px 40px -10px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.05);border:1px solid rgba(0,0,0,0.06);padding:8px;display:none;flex-direction:column;z-index:1000;transform-origin:top right;transition:opacity 0.2s, transform 0.2s;opacity:0;transform:scale(0.95);';

        // 1. User Info Header
        const userHeader = document.createElement('div');
        userHeader.style = 'padding:12px 16px;margin-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;flex-direction:column;gap:2px;';
        userHeader.innerHTML = `
          <span style="font-weight:700;color:var(--clr-heading);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
          <span style="font-size:0.8rem;color:var(--clr-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.email || 'Usuário Premium'}</span>
        `;
        dropdown.appendChild(userHeader);

        // Detect context: are we on the painel?
        const isOnPainel = window.location.pathname.includes('painel.html');

        const dLinkStyle = 'display:flex;align-items:center;gap:12px;padding:12px 16px;color:var(--clr-text);text-decoration:none;font-size:0.92rem;border-radius:10px;font-weight:600;transition:all 0.2s;';

        // Sleek SVG Icons
        const icons = {
          panel: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
          ads: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
          sub: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
          msg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
          logout: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
        };

        // Full links for all pages
        const links = [
          { icon: icons.panel, text: 'Meu Painel', href: 'painel.html', color: 'var(--clr-heading)' },
          { icon: icons.ads, text: 'Meus Anúncios', href: 'painel.html#ads', color: 'var(--clr-heading)' },
          { icon: icons.msg, text: 'Minhas Mensagens', href: 'painel.html#messages', color: 'var(--clr-heading)' },
          { icon: icons.sub, text: 'Minha Assinatura', href: 'painel.html#billing', color: 'var(--clr-heading)' },
          { divider: true },
          { icon: icons.logout, text: 'Sair da Conta', href: '#', id: 'header-logout-btn', color: '#DC2626', hoverBg: 'rgba(220, 38, 38, 0.08)' }
        ];

        links.forEach(l => {
          if (l.divider) {
            const div = document.createElement('div');
            div.style = 'height:1px;background:rgba(0,0,0,0.06);margin:4px 8px;';
            dropdown.appendChild(div);
            return;
          }
          const a = document.createElement('a');
          a.href = l.href;
          a.style = dLinkStyle + `color:${l.color};`;
          if (l.id) a.id = l.id;
          a.innerHTML = `<span style="display:flex;align-items:center;color:inherit;opacity:0.8;">${l.icon}</span> <span>${l.text}</span>`;
          a.onmouseover = () => {
            a.style.background = l.hoverBg || 'rgba(0,0,0,0.04)';
            a.style.transform = 'translateX(4px)';
          };
          a.onmouseout = () => {
            a.style.background = 'transparent';
            a.style.transform = 'translateX(0)';
          };
          
          if (l.id === 'header-logout-btn') {
            a.onclick = async (e) => {
              e.preventDefault();
              try {
                if (typeof logout === 'function') await logout();
                else {
                  const sb = getSupabase ? getSupabase() : null;
                  if (sb) await sb.auth.signOut();
                }
              } catch(err) {
                console.warn('Logout error:', err);
              } finally {
                window.location.href = 'index.html';
              }
            };
          }
          dropdown.appendChild(a);
        });

        wrapper.appendChild(avatar);
        wrapper.appendChild(dropdown);
        authWrapper.innerHTML = '';
        authWrapper.appendChild(wrapper);

        // Toggle dropdown logic with smooth animation
        let closeTimeout;
        avatar.onclick = (e) => {
          e.stopPropagation();
          const isVisible = dropdown.style.display === 'flex';
          
          document.querySelectorAll('.header-user-dropdown').forEach(d => {
            if (d !== dropdown) {
              d.style.opacity = '0';
              d.style.transform = 'scale(0.95)';
              setTimeout(() => d.style.display = 'none', 200);
            }
          });
          
          if (!isVisible) {
            clearTimeout(closeTimeout);
            dropdown.style.display = 'flex';
            // Trigger reflow
            void dropdown.offsetWidth;
            dropdown.style.opacity = '1';
            dropdown.style.transform = 'scale(1)';
          } else {
            dropdown.style.opacity = '0';
            dropdown.style.transform = 'scale(0.95)';
            closeTimeout = setTimeout(() => dropdown.style.display = 'none', 200);
          }
        };

        document.addEventListener('click', (e) => {
          if (!wrapper.contains(e.target) && dropdown.style.display === 'flex') {
            dropdown.style.opacity = '0';
            dropdown.style.transform = 'scale(0.95)';
            closeTimeout = setTimeout(() => dropdown.style.display = 'none', 200);
          }
        });

        dropdown.addEventListener('mouseleave', () => {
          dropdown.style.opacity = '0';
          dropdown.style.transform = 'scale(0.95)';
          setTimeout(() => dropdown.style.display = 'none', 200);
        });
        // -- Global Realtime Messages Subscription --
        if (typeof getMyMessages === 'function' && typeof subscribeToMessages === 'function') {
          const updateGlobalBadge = (msgs) => {
            let unread = 0;
            const convos = {};
            msgs.forEach(m => {
              const otherId = m.sender_id === session.user.id ? m.receiver_id : m.sender_id;
              const k = m.ad_id + '__' + otherId;
              if (!convos[k] || new Date(m.created_at) > new Date(convos[k].created_at)) convos[k] = m;
            });
            Object.values(convos).forEach(m => {
              if (m.sender_id !== session.user.id) unread++;
            });
            if (unread > 0) {
              msgBadge.textContent = unread > 9 ? '9+' : unread;
              msgBadge.style.display = 'flex';
              msgWrapper.classList.add('has-unread');
            } else {
              msgBadge.style.display = 'none';
              msgWrapper.classList.remove('has-unread');
            }
          };

          getMyMessages().then(msgs => {
            updateGlobalBadge(msgs);
            subscribeToMessages(session.user.id, (payload) => {
              if (payload.new) {
                msgs.push(payload.new);
                updateGlobalBadge(msgs);
                if (!window.location.hash.includes('messages') && typeof showToast === 'function') {
                  showToast('Nova mensagem recebida!', 'success');
                }
              }
            });
          }).catch(e => console.error('Erro RT messages', e));
        }

      }
      const planosBtn = nav.querySelector('a[href="planos.html"]');
      if (planosBtn) {
        planosBtn.style.display = 'none';
      }
    });

    document.querySelectorAll('header a[href="anunciar.html"] span, .mobile-menu a[href="anunciar.html"] span, .hero-actions a[href="anunciar.html"] span').forEach(span => {
      span.textContent = 'Novo Anúncio';
      span.removeAttribute('data-i18n');
    });

    const ctaBtn = document.querySelector('.cta-actions a[href="login.html?mode=register"]');
    if (ctaBtn) {
      ctaBtn.href = 'anunciar.html';
      ctaBtn.textContent = 'Novo Anúncio';
      ctaBtn.removeAttribute('data-i18n');
      const ctaSub = document.querySelector('.cta-text p');
      if (ctaSub) {
        ctaSub.textContent = 'Publique seu anúncio em minutos. Alcance compradores em todo o Mercosul.';
        ctaSub.removeAttribute('data-i18n');
      }
    }

    // Sincronizar favoritos para evitar corações dessincronizados
    if (typeof getMyFavorites === 'function') {
      try {
        await getMyFavorites();
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
      } catch(e) {
        console.error('Erro ao sincronizar favoritos:', e);
      }
    }

  } catch (e) {
    console.error('Erro ao verificar sessão:', e);
  }
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

// ─── CSS COLOR SANITIZER ──────────────────────
function sanitizeCssColor(value) {
  if (typeof value !== 'string') return null;
  // Permite apenas: #RGB, #RRGGBB, #RRGGBBAA ou rgb()/rgba() seguros
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+)?\s*\)$/.test(value)) return value;
  return null;
}

function applyDynamicSettings() {
  const rawLogoUrl = localStorage.getItem('tc_logo_url');
  const heroTitle = localStorage.getItem('tc_hero_title');
  const rawColor = localStorage.getItem('tc_primary_color');

  // Sanitize logo URL usando sanitizeBannerUrl (já disponível no escopo)
  const logoUrl = (function sanitizeBannerUrlLocal(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) return null;
      return url;
    } catch {
      return url.startsWith('javascript') ? null : url;
    }
  })(rawLogoUrl);

  if (logoUrl) {
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = logoUrl;

    document.querySelectorAll('.logo-mark, .adm-logo-mark').forEach(el => {
      el.textContent = '';
      el.style.backgroundImage = `url('${logoUrl}')`;
      el.style.backgroundSize = 'contain';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'left center';
      el.style.backgroundColor = 'transparent';
    });
  }

  if (heroTitle) {
    const heroH1 = document.querySelector('.hero-content h1');
    if (heroH1) heroH1.textContent = heroTitle;
  }

  const primaryColor = sanitizeCssColor(rawColor);
  if (primaryColor) {
    const style = document.createElement('style');
    style.textContent = `:root { --clr-primary: ${primaryColor} !important; --clr-primary-mid: ${primaryColor} !important; }`;
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

  // Sanitize banner URLs to prevent javascript: protocol injection
  function sanitizeBannerUrl(url) {
    if (!url) return '#';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '#';
      return url;
    } catch {
      // Relative URL — ensure no javascript: prefix
      return url.startsWith('javascript') ? '#' : url;
    }
  }

  let activeBanners = [];
  try {
    if (typeof getBanners === 'function') {
      const userLoc = await detectUserLocation();
      activeBanners = await getBanners(position, userLoc);
    }
  } catch (e) {
    console.error('Falha ao carregar banners:', e);
  }

  if (activeBanners && activeBanners.length > 0) {
    const b = activeBanners[0];
    const imageUrl  = b.image_url || b.image || '';
    const linkUrl   = sanitizeBannerUrl(b.link_url  || b.link  || '#');
    const bannerName = b.name || 'Banner';

    container.innerHTML = `
      <div class="ad-banner-wrapper" style="width:100%;height:${heightStyle};position:relative;margin:1.5rem 0;overflow:hidden;border-radius:12px;background:#000;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <a href="${escapeHTML(linkUrl)}" target="_blank" rel="noopener sponsored" style="display:block;width:100%;height:100%;position:relative;">
          <img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(bannerName)}" style="width:100%;height:100%;object-fit:cover;opacity:0.85;transition:opacity 0.3s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'" loading="lazy">
        </a>
      </div>`;
    return;
  }

  // Sem banners ativos — sem placeholder
  container.innerHTML = '';
};

// ─── SEGURANÇA: TIMEOUT POR INATIVIDADE (1 HORA) ─────────────
// Exigência de "Segurança Nível Bancário"
(function initInactivityTimeout() {
  const TIMEOUT_MS = 60 * 60 * 1000; // 1 Hora em milissegundos
  let inactivityTimer;

  // Apenas roda se o usuário estiver logado (verifica a existência de token)
  let isLogged = false;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i).includes('auth-token')) {
      isLogged = true;
      break;
    }
  }
  if (!isLogged) return;

  function resetTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      console.warn('Sessão encerrada por inatividade (1 Hora).');
      if (typeof logout === 'function') {
        logout();
      } else {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login.html';
      }
    }, TIMEOUT_MS);
  }

  // Eventos que configuram atividade
  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });

  // Inicia o timer
  resetTimer();
})();

// ─── PWA CUSTOM INSTALL MODAL ─────────────────────────────
let deferredPrompt;
const pwaModalId = 'tc-pwa-modal';

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Check if we should show the prompt (e.g., user hasn't dismissed it recently)
  const lastDismissed = localStorage.getItem('tc_pwa_dismissed');
  if (lastDismissed && (Date.now() - parseInt(lastDismissed, 10)) < 7 * 24 * 60 * 60 * 1000) {
    return; // Don't show if dismissed within the last 7 days
  }

  // Show the prompt after a slight delay to let the user engage with the page
  setTimeout(showCustomPwaPrompt, 4000);
});

function showCustomPwaPrompt() {
  if (document.getElementById(pwaModalId)) return;

  const appName = localStorage.getItem('tc_hero_title') || 'Tauze Class';
  const logoUrl = localStorage.getItem('tc_logo_url');
  const bgStyle = logoUrl ? `background-image: url('${logoUrl}');` : `background-image: url('assets/logo.png');`;

  const modalHtml = `
    <div id="${pwaModalId}">
      <div class="pwa-close-icon" id="pwa-close-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
      <div class="pwa-modal-header">
        <div class="pwa-modal-icon" style="${bgStyle}"></div>
        <div class="pwa-modal-info">
          <h3>Instale o App</h3>
          <p>Adicione o <strong>${appName}</strong> à sua tela inicial para um acesso mais rápido e seguro.</p>
        </div>
      </div>
      <div class="pwa-modal-actions">
        <button class="btn-pwa-cancel" id="pwa-cancel-btn">Mais tarde</button>
        <button class="btn-pwa-install" id="pwa-install-btn">Instalar App</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = document.getElementById(pwaModalId);
  // Trigger animation
  requestAnimationFrame(() => {
    modal.classList.add('show');
  });

  const hideModal = (saveDismiss = false) => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 500);
    if (saveDismiss) {
      localStorage.setItem('tc_pwa_dismissed', Date.now().toString());
    }
  };

  document.getElementById('pwa-close-btn').addEventListener('click', () => hideModal(true));
  document.getElementById('pwa-cancel-btn').addEventListener('click', () => hideModal(true));
  
  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    hideModal();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      // console.log('PWA prompt outcome:', outcome);
      deferredPrompt = null;
    }
  });
}
