// ============================================
//   TAUZE CLASS — home.js  (v4 — clean)
//   Stats reais + categorias reais + geo-aware ads
//   Skeleton loading + cache funcional
// ============================================

// ─── INJECT CSS ──────────────────────────────
(function() {
  if (document.getElementById('tc-home-style')) return;
  const s = document.createElement('style');
  s.id = 'tc-home-style';
  s.textContent = `
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position:  200% 0; }
    }
    .sk-card {
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .sk-img  { height: 200px; background: linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    .sk-body { padding: 14px; }
    .sk-line { height: 12px; border-radius: 4px; margin-bottom: 10px; background: linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    .geo-badge { margin-bottom: 12px; }
    .geo-badge span {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: .76rem; font-weight: 600;
      color: var(--clr-primary-mid,#15803d);
      background: #f0fdf4; border: 1px solid #bbf7d0;
      padding: 3px 12px; border-radius: 99px;
    }
  `;
  document.head.appendChild(s);
})();

// ─── SKELETON ────────────────────────────────
function skeleton(n) {
  return Array(n).fill(`
    <div class="sk-card">
      <div class="sk-img"></div>
      <div class="sk-body">
        <div class="sk-line" style="width:40%"></div>
        <div class="sk-line" style="width:85%"></div>
        <div class="sk-line" style="width:55%;height:18px"></div>
        <div class="sk-line" style="width:60%;margin-bottom:0"></div>
      </div>
    </div>`).join('');
}

// ─── GEO BADGE ───────────────────────────────
function geoBadge(level, loc) {
  const map = {
    city:    `📍 Perto de você • ${loc?.city || ''}`,
    state:   `📍 No seu estado • ${loc?.state || ''}`,
    country: `📍 No seu país • ${loc?.country || ''}`,
  };
  const label = map[level];
  return label ? `<div class="geo-badge"><span>${label}</span></div>` : '';
}

function detectLevel(ads, loc) {
  if (!loc || !ads || !ads.length) return 'global';
  const n = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const a = ads[0];
  if (loc.city    && n(a.city)    === n(loc.city))    return 'city';
  if (loc.state   && n(a.state)   === n(loc.state))   return 'state';
  if (loc.country && n(a.country) === n(loc.country)) return 'country';
  return 'global';
}

// ─── NORMALIZA LINHA DO RPC ──────────────────
function norm(row) {
  const hasCat = row.categories && typeof row.categories === 'object' && row.categories.name_pt;
  return {
    ...row,
    title_es:      row.title_es      || row.title_pt || '',
    price_unit_es: row.price_unit_es || row.price_unit_pt || '',
    categories: hasCat ? row.categories : {
      name_pt: row.cat_name_pt || '',
      name_es: row.cat_name_es || row.cat_name_pt || '',
    },
    image: (row.images && row.images.length > 0) ? row.images[0] : (row.image || null),
  };
}

// ─── FETCH RPC COM FALLBACK ───────────────────
async function rpcAds(rpcName, loc, limit) {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.rpc(rpcName, {
      p_city:    loc?.city    || null,
      p_state:   loc?.state   || null,
      p_country: loc?.country || null,
      p_limit:   limit,
    });
    if (error) throw error;
    // console.log(`[home] ${rpcName} ok — ${(data||[]).length} anúncios`);
    return (data || []).map(norm);
  } catch (e) {
    console.warn(`[home] ${rpcName} RPC falhou (${e.message}), usando fallback`);
  }

  try {
    const isFeatured = rpcName.includes('featured');
    let q = sb.from('ads')
      .select('id, title_pt, title_es, price, currency, price_unit_pt, price_unit_es, status, featured, images, category_id, location_text, city, state, country, created_at, negotiable, categories(name_pt, name_es)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (isFeatured) q = q.eq('featured', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(norm);
  } catch (e2) {
    console.error('[home] fallback também falhou:', e2);
    return null;
  }
}

// ─── 1. STATS REAIS + ANIMAÇÃO ───────────────
async function initHomeStats() {
  // console.log('[home] initHomeStats — buscando...');

  // Não invalida o cache — deixa fetchPlatformStats decidir se usa cache (TTL 2min)
  try {
    const stats = await fetchPlatformStats();
    if (!stats) throw new Error('fetchPlatformStats retornou null');

    const allStats = {
      'fc-bovinos':     { val: stats.total_bovinos,  suffix: '' },
      'fc-verificados': { val: stats.total_sellers,  suffix: '+' },
      'fc-leiloes':     { val: stats.total_auctions, suffix: '' },
      'fc-maquinas':    { val: stats.total_machines, suffix: '' },
      'stat-ads':       { val: stats.total_ads,       suffix: '+' },
      'stat-users':     { val: stats.total_sellers,   suffix: '+' },
      'stat-paises':    { val: stats.total_countries, suffix: '' },
      'stat-cidades':   { val: stats.total_cities,    suffix: '+' },
    };

    Object.entries(allStats).forEach(([id, {val, suffix}]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const finalSuffix = stats.plus === false ? suffix.replace('+', '') : suffix;
      el.setAttribute('data-target', String(val));
      el.setAttribute('data-suffix', finalSuffix);
      el.setAttribute('data-format', stats.format || 'k');
      el.textContent = '0' + finalSuffix;
      if (typeof animateCount === 'function') {
        animateCount(el, val, 1800, stats.format || 'k');
      } else {
        const n = val;
        let numStr = n.toString();
        if (stats.format === 'k' && n >= 1000) numStr = (n/1000).toFixed(n%1000===0?0:1).replace('.0','') + 'k';
        else if (stats.format === 'mil' && n >= 1000) numStr = (n/1000).toFixed(n%1000===0?0:1).replace('.0','') + 'mil';
        else if (n >= 1000000) numStr = (n/1e6).toFixed(1) + 'M';
        el.textContent = numStr + finalSuffix;
      }
    });

  } catch (e) {
    console.error('[home] initHomeStats erro:', e);
  }
}

// ─── 2. CATEGORIAS COM CONTAGENS REAIS ────────
// Uma única função que busca categorias E contagens em paralelo
async function renderCategoriesHome() {
  // console.log('[home] renderCategoriesHome — buscando...');

  try {
    const sb = getSupabase();
    if (!sb) return;

    // Executa fetchCategoriesFromDB e get_category_counts em paralelo
    const [, countsResult] = await Promise.all([
      typeof fetchCategoriesFromDB === 'function' ? fetchCategoriesFromDB() : Promise.resolve(),
      sb.rpc('get_category_counts'),
    ]);

    const { data: countsData, error: countsError } = countsResult;
    if (countsError) throw countsError;

    const countMap = {};
    (countsData || []).forEach(r => { if (r.category_id) countMap[r.category_id] = Number(r.total); });

    if (typeof CATEGORIES !== 'undefined') {
      CATEGORIES.forEach(cat => {
        cat.count = countMap[cat.id] ?? countMap['cat-' + cat.id] ?? 0;
      });
    }

    if (typeof renderCategories === 'function') {
      renderCategories();
    }
  } catch (e) {
    console.error('[home] renderCategoriesHome erro:', e);
  }
}

// ─── 3. ANÚNCIOS EM DESTAQUE ─────────────────
async function renderFeaturedAdsHome() {
  const grid  = document.getElementById('featured-ads');
  const badge = document.getElementById('featured-geo-badge');
  if (!grid) return;

  grid.innerHTML = skeleton(4);

  try {
    const loc = await _locationPromise;
    const ads = await rpcAds('get_localized_featured_ads', loc, 4);

    if (ads && ads.length > 0) {
      if (badge) badge.innerHTML = geoBadge(detectLevel(ads, loc), loc);
      grid.innerHTML = ads.map(a => buildAdCard(a, currentLang)).join('');
      if (typeof initObserver === 'function') setTimeout(initObserver, 60);
      return;
    }
  } catch (e) {
    console.error('[home] renderFeaturedAdsHome erro:', e);
  }

  grid.innerHTML = '';
}

// ─── 4. ÚLTIMOS ANÚNCIOS (cursor keyset) ──────
// Usa search_ads RPC com cursor para Load More — evita OFFSET lento
let _recentCursor = null;
let _recentHasMore = false;

async function renderCountriesHome() {
  const grid = document.getElementById('countries-grid');
  if (!grid) return;

  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc('get_country_counts');
    if (error) throw error;

    // Mapa: nome → código ISO — SVGs em assets/flags/ (hospedados localmente)
    const flagMap = {
      'Brasil':    'br',
      'Argentina': 'ar',
      'Paraguai':  'py',
      'Uruguai':   'uy',
      'Bolivia':   'bo',
      'Chile':     'cl',
      'Colombia':  'co',
    };

    const lang = (typeof currentLang !== 'undefined') ? currentLang : 'pt';
    const imgStyle = 'width:42px;height:42px;object-fit:cover;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.1);flex-shrink:0;';

    function adsLabel(total) {
      const n = Number(total);
      if (lang === 'es') return n === 1 ? '1 anuncio' : n.toLocaleString('pt-BR') + ' anuncios';
      return n === 1 ? '1 anúncio' : n.toLocaleString('pt-BR') + ' anúncios';
    }

    if (data && data.length > 0) {
      grid.innerHTML = data.map(c => {
        const code = flagMap[c.country_name] || '';
        const imgTag = code
          ? `<img src="assets/flags/${code}.svg" alt="${c.country_name}" class="country-flag" width="42" height="42" style="${imgStyle}" loading="lazy">`
          : `<span class="country-flag" style="font-size:2rem;">🌎</span>`;
        return `<div class="country-card fade-in-up">
            ${imgTag}
            <div>
              <div style="font-weight:700;color:var(--clr-heading);font-size:1.05rem;">${c.country_name}</div>
              <div style="font-size:0.85rem;color:var(--clr-text-muted);margin-top:2px;">${adsLabel(c.total)}</div>
            </div>
          </div>`;
      }).join('');
    } else {
      grid.innerHTML = '<p style="text-align:center;width:100%;color:var(--text-light)">Nenhum anúncio por país no momento.</p>';
    }
  } catch(e) {
    console.error('Erro em renderCountriesHome:', e);
  }
}
async function renderRecentAdsHome() {
  const grid  = document.getElementById('recent-ads');
  const badge = document.getElementById('recent-geo-badge');
  if (!grid) return;

  const limit = 8;
  const isLoadMore = (window.recentPage || 0) > 0;

  if (!isLoadMore) {
    // Primeira carga — skeleton + geo-aware via RPC
    _recentCursor  = null;
    _recentHasMore = false;
    grid.innerHTML = skeleton(limit);

    try {
      const loc = await _locationPromise;
      const ads = await rpcAds('get_localized_recent_ads', loc, limit);

      if (ads && ads.length > 0) {
        if (badge) badge.innerHTML = geoBadge(detectLevel(ads, loc), loc);
        grid.innerHTML = ads.map(a => buildAdCard(a, currentLang)).join('');
        const btn = document.getElementById('btn-load-more');
        if (btn) btn.style.display = ads.length >= limit ? 'inline-block' : 'none';
        if (typeof initObserver === 'function') setTimeout(initObserver, 60);
        return;
      }
    } catch (e) {
      console.error('[home] renderRecentAdsHome erro:', e);
    }

    grid.innerHTML = '';

  } else {
    // Load More — usa search_ads com cursor (sem OFFSET)
    try {
      const result = await getAds({
        cursor: _recentCursor,
        limit,
      });
      const ads = result.ads || [];
      _recentCursor  = result.nextCursor;
      _recentHasMore = result.hasMore;

      ads.forEach(a => {
        grid.insertAdjacentHTML('beforeend', buildAdCard(norm(a), currentLang));
      });

      const btn = document.getElementById('btn-load-more');
      if (btn) btn.style.display = _recentHasMore ? 'inline-block' : 'none';
      if (typeof initObserver === 'function') setTimeout(initObserver, 60);
    } catch (e) {
      console.error('[home] load-more erro:', e);
    }
  }
}

// ─── INIT ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // console.log('[home] DOMContentLoaded — iniciando...');

  const btn = document.getElementById('btn-load-more');
  if (btn) {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      window.recentPage = (window.recentPage || 0) + 1;
      renderRecentAdsHome();
    });
  }

  // Carrega tudo em paralelo
  Promise.all([
    initHomeStats(),
    renderCategoriesHome(),
    renderFeaturedAdsHome(),
    renderRecentAdsHome(),
    renderCountriesHome(),
  ]).then(() => {
    // console.log('[home] ✅ Tudo carregado!');
  }).catch(e => {
    console.error('[home] ❌ Erro no carregamento:', e);
  });
});
