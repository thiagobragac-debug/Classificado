// ─── GEO-FILTER ──────────────────────────────
// Os dropdowns (País/Estado/Cidade) são a ÚNICA fonte de verdade.
// Quando a localização é detectada, os dropdowns são pré-preenchidos
// automaticamente em cascata: País → Estado → Cidade.
// O geo-badge é apenas uma representação visual do que está nos dropdowns.
// Clicar ✕ no badge limpa o nível mais específico ativo (cidade → estado → país).

/**
 * Lê os dropdowns e retorna o nível geo ativo:
 * 'city' | 'state' | 'country' | 'global'
 */
function _getActiveGeoLevel() {
  const cityEl    = document.getElementById('filter-city');
  const stateEl   = document.getElementById('filter-state');
  const countryEl = document.getElementById('filter-country');
  if (cityEl    && cityEl.selectedIndex    > 0) return 'city';
  if (stateEl   && stateEl.selectedIndex   > 0) return 'state';
  if (countryEl && countryEl.selectedIndex > 0) return 'country';
  return 'global';
}

/**
 * Renderiza o geo-badge lendo os valores actuais dos dropdowns.
 * Badge mostra cidade se selecionada, senão estado, senão país.
 * Se nenhum dropdown estiver selecionado, remove o badge.
 */
function renderGeoFilterBadge() {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const existing = document.getElementById('geo-filter-badge');
  if (existing) existing.remove();

  const level = _getActiveGeoLevel();
  if (level === 'global') return;

  const cityEl    = document.getElementById('filter-city');
  const stateEl   = document.getElementById('filter-state');
  const countryEl = document.getElementById('filter-country');

  const cityName    = cityEl    && cityEl.selectedIndex    > 0 ? cityEl.options[cityEl.selectedIndex].text       : '';
  const stateName   = stateEl   && stateEl.selectedIndex   > 0 ? stateEl.options[stateEl.selectedIndex].text     : '';
  const countryName = countryEl && countryEl.selectedIndex > 0 ? countryEl.options[countryEl.selectedIndex].text : '';

  const labels = {
    city:    `Perto de você — ${cityName}`,
    state:   `Seu estado — ${stateName}`,
    country: `Seu país — ${countryName}`,
  };

  const nextLabels = {
    city:    stateName  ? `Ver todo ${stateName}`  : 'Ver todo o estado',
    state:   countryName? `Ver todo ${countryName}`: 'Ver todo o país',
    country: 'Ver anúncios de todos os países',
  };

  const badge = document.createElement('div');
  badge.id = 'geo-filter-badge';
  badge.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    <span>${labels[level]}</span>
    <button title="${nextLabels[level]}" aria-label="${nextLabels[level]}">✕</button>
  `;

  badge.querySelector('button').addEventListener('click', advanceGeoLevel);
  container.insertBefore(badge, container.firstChild);
}

/**
 * Avança para o nível geo mais amplo limpando o dropdown do nível atual.
 * cidade ativo → limpa cidade → filtro por estado
 * estado ativo → limpa estado+cidade → filtro por país
 * país ativo  → limpa tudo → sem filtro geo
 */
function advanceGeoLevel() {
  const level     = _getActiveGeoLevel();
  const cityEl    = document.getElementById('filter-city');
  const stateEl   = document.getElementById('filter-state');
  const countryEl = document.getElementById('filter-country');

  if (level === 'city' && cityEl) {
    cityEl.selectedIndex = 0;
    cityEl.disabled = true;
  } else if (level === 'state' && stateEl) {
    stateEl.selectedIndex = 0;
    stateEl.disabled = true;
    if (cityEl) { cityEl.innerHTML = '<option value="">Todas as Cidades</option>'; cityEl.disabled = true; }
  } else if (level === 'country' && countryEl) {
    countryEl.selectedIndex = 0;
    if (stateEl) { stateEl.innerHTML = '<option value="">Todos os Estados</option>'; stateEl.disabled = true; }
    if (cityEl)  { cityEl.innerHTML  = '<option value="">Todas as Cidades</option>'; cityEl.disabled  = true; }
  }

  applyFilters(); // readFilters() lerá os novos valores dos dropdowns
}

/**
 * Pré-preenche os dropdowns com a localização detectada automaticamente.
 * Usa RPC resolve_location para obter todos os IDs em 1 round-trip,
 * depois carrega estados e cidades em paralelo (Promise.all).
 */
async function prefillLocationFromGeo(loc) {
  if (!loc || (!loc.city && !loc.state && !loc.country)) return;

  const countryEl = document.getElementById('filter-country');
  const stateEl   = document.getElementById('filter-state');
  const cityEl    = document.getElementById('filter-city');
  if (!countryEl) return;

  try {
    // 1 RPC substitui 3 queries sequenciais (waterfall eliminado)
    let resolved = typeof resolveLocation === 'function'
      ? await resolveLocation(loc.country, loc.state, loc.city)
      : null;

    if (!resolved || !resolved.found) {
      // Fallback: carrega países e tenta match por nome (sem RPC)
      await getCountries(); // garante cache
      const countryOpt = Array.from(countryEl.options).find(o =>
        normalizeStr(o.text) === normalizeStr(loc.country)
      );
      if (!countryOpt) { applyFilters(); return; }
      countryEl.value = countryOpt.value;
      resolved = { pais_id: countryOpt.value }; // Pseudo-resolved
    } else {
      // Garante que países estão carregados no dropdown
      await getCountries();
      const countryOpt = Array.from(countryEl.options).find(o => o.value == resolved.pais_id);
      if (countryOpt) countryEl.value = countryOpt.value;
    }

    // Carrega estados e cidades (usando IDs da RPC, se disponíveis)
    let states = [];
    let cities = [];
    if (resolved.pais_id) {
      states = await getStates(resolved.pais_id);
    }
    if (resolved.estado_id) {
      cities = await getCities(resolved.estado_id);
    }

    // Popula e seleciona estado SEMPRE que tivermos states
    let finalStateId = resolved.estado_id;
    if (states.length > 0) {
      stateEl.innerHTML = '<option value="">Todos os Estados</option>';
      states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nome;
        if (s.sigla) opt.dataset.sigla = s.sigla;
        stateEl.appendChild(opt);
      });
      stateEl.disabled = false;

      // Fallback JS se a RPC falhou no estado
      if (!finalStateId && loc.state) {
        const normLocState = normalizeStr(loc.state);
        const stateOpt = Array.from(stateEl.options).find(o =>
          normalizeStr(o.text) === normLocState || (o.dataset.sigla && o.dataset.sigla.toUpperCase() === loc.state.toUpperCase())
        );
        if (stateOpt) finalStateId = stateOpt.value;
      }

      if (finalStateId) {
        stateEl.value = finalStateId;
        // Se a RPC falhou no estado mas JS encontrou, precisamos buscar as cidades aqui
        if (cities.length === 0) {
          cities = await getCities(finalStateId);
        }
      }
    }

    // Popula e seleciona cidade
    if (cities.length > 0 && finalStateId) {
      cityEl.innerHTML = '<option value="">Todas as Cidades</option>';
      cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        cityEl.appendChild(opt);
      });
      cityEl.disabled = false;

      let finalCityId = resolved.cidade_id;
      // Fallback JS se a RPC falhou na cidade
      if (!finalCityId && loc.city) {
        const normLocCity = normalizeStr(loc.city);
        const cityOpt = Array.from(cityEl.options).find(o => normalizeStr(o.text) === normLocCity);
        if (cityOpt) finalCityId = cityOpt.value;
      }

      if (finalCityId) {
        cityEl.value = finalCityId;
      }
    }

    applyFilters();

  } catch (e) {
    console.warn('[geo] Erro ao pré-preencher localização:', e.message);
    applyFilters();
  }
}

let _nextCursor   = null;   // cursor keyset para próxima página
let _hasMore      = false;
let _isLoading    = false;
let _totalShown   = 0;
let _debounceTimer = null;

// ─── CONSTANTES ───────────────────────────────
const PAGE_SIZE = 16;

const normalizeStr = (str) => str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

const COUNTRY_NAMES = {
  pt: { 'AR': 'Argentina', 'BO': 'Bolívia', 'BR': 'Brasil', 'CL': 'Chile', 'CO': 'Colômbia', 'EC': 'Equador', 'GY': 'Guiana', 'PY': 'Paraguai', 'PE': 'Peru', 'SR': 'Suriname', 'UY': 'Uruguai', 'VE': 'Venezuela' },
  es: { 'AR': 'Argentina', 'BO': 'Bolivia', 'BR': 'Brasil', 'CL': 'Chile', 'CO': 'Colombia', 'EC': 'Ecuador', 'GY': 'Guyana', 'PY': 'Paraguay', 'PE': 'Perú', 'SR': 'Surinam', 'UY': 'Uruguay', 'VE': 'Venezuela' }
};

// ─── LEITURA DE FILTROS DO DOM ────────────────
function readFilters() {
  const lang      = (typeof currentLang !== 'undefined') ? currentLang : 'pt';
  const catRadio  = document.querySelector('input[name="category"]:checked');
  const countryEl = document.getElementById('filter-country');
  const stateEl   = document.getElementById('filter-state');
  const cityEl    = document.getElementById('filter-city');
  const searchEl  = document.getElementById('header-search-input');

  const countryOpt  = countryEl && countryEl.selectedIndex >= 0 ? countryEl.options[countryEl.selectedIndex] : null;
  const stateOpt    = stateEl && stateEl.selectedIndex > 0 ? stateEl.options[stateEl.selectedIndex] : null;
  const stateName   = stateOpt ? stateOpt.text : '';
  const stateSigla  = stateOpt && stateOpt.dataset.sigla ? stateOpt.dataset.sigla : '';
  const cityName    = cityEl  && cityEl.selectedIndex  > 0 ? cityEl.options[cityEl.selectedIndex].text   : '';

  return {
    search:   searchEl?.value.trim() || '',
    category: catRadio?.value || '',
    country:  countryEl && countryEl.selectedIndex > 0 ? countryEl.options[countryEl.selectedIndex].text : '',

    state:    stateSigla || stateName,
    city:     cityName,
    priceMin: parseFloat(document.getElementById('price-min')?.value) || null,
    priceMax: parseFloat(document.getElementById('price-max')?.value) || null,
    featured: document.getElementById('chk-featured')?.checked  || false,
    countryOpt, stateName, cityName, stateSigla,
    lang,
  };
}

// ─── RENDERIZA CATEGORIA FILTERS ─────────────
function renderCategoryFilters() {
  const container = document.getElementById('filter-category');
  if (!container || typeof CATEGORIES === 'undefined') return;

  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'pt';
  const existingInputs = container.querySelectorAll('input[name="category"]:not([value=""])');
  existingInputs.forEach(i => i.parentElement.remove());

  // Usar DocumentFragment para evitar Layout Thrashing
  const fragment = document.createDocumentFragment();

  CATEGORIES.forEach(cat => {
    if (!cat.active) return;
    const name   = escapeHTML(lang === 'es' ? (cat.name_es || cat.name_pt) : cat.name_pt);
    const colors = (typeof CAT_COLORS !== 'undefined' && CAT_COLORS[cat.id]) ? CAT_COLORS[cat.id] : { bg: '#F8FAFC', clr: '#475569' };

    let iconHtml = '';
    if (cat.icon) {
      if (cat.icon.includes('<svg')) {
        iconHtml = cat.icon.replace('<svg ', '<svg style="width:16px;height:16px;" ');
      } else if (cat.icon.includes('<path') || cat.icon.includes('<circle')) {
        iconHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">${cat.icon}</svg>`;
      } else if (typeof ICONS !== 'undefined' && ICONS[cat.icon]) {
        iconHtml = ICONS[cat.icon].replace('<svg ', '<svg style="width:16px;height:16px;" ');
      } else {
        iconHtml = `<span style="font-size:14px;line-height:1;">${escapeHTML(cat.icon)}</span>`;
      }
    } else {
      iconHtml = `<span style="font-size:14px;line-height:1;">🗂️</span>`;
    }

    const label = document.createElement('label');
    label.className = 'filter-option category-option';
    label.innerHTML = `
      <input type="radio" name="category" value="${cat.id}">
      <span class="cat-icon-wrap" style="color:${colors.clr};background:${colors.clr}1A;">
        ${iconHtml}
      </span>
      ${name} <span class="filter-count" id="count-${cat.id}"></span>
    `;
    fragment.appendChild(label);
  });
  container.appendChild(fragment);
}

// Cache em memória para contagens por categoria (evita chamar RPC a cada applyFilters)
let _catCountsCache  = null;
let _catCountsCacheTs = 0;
const CAT_COUNTS_TTL  = 60 * 1000; // 60 segundos

async function loadCategoryCountsFromDB() {
  try {
    // Usa cache se ainda válido
    if (_catCountsCache && (Date.now() - _catCountsCacheTs < CAT_COUNTS_TTL)) {
      _applyCatCounts(_catCountsCache);
      return;
    }

    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc('get_category_counts');
    if (error || !data) return;

    _catCountsCache   = data;
    _catCountsCacheTs = Date.now();
    _applyCatCounts(data);
  } catch (e) {
    console.warn('[filters] Erro ao carregar contagens:', e.message);
  }
}

function _applyCatCounts(data) {
  document.querySelectorAll('.filter-count').forEach(el => el.textContent = '');
  data.forEach(row => {
    if (!row.category_id || !row.total) return;
    const rawId  = row.category_id;
    const normId = rawId.startsWith('cat-') ? rawId.slice(4) : rawId;
    const el = document.getElementById(`count-${normId}`) || document.getElementById(`count-${rawId}`);
    if (el) el.textContent = `(${row.total})`;
  });
}

// ─── SKELETON LOADING ─────────────────────────
function renderSkeleton(container, n = 4) {
  container.innerHTML = Array(n).fill(`
    <div class="sk-card" style="border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <div style="height:200px;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.4s ease-in-out infinite;"></div>
      <div style="padding:14px;">
        <div style="height:12px;border-radius:4px;margin-bottom:10px;width:40%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.4s ease-in-out infinite;"></div>
        <div style="height:12px;border-radius:4px;margin-bottom:10px;width:85%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.4s ease-in-out infinite;"></div>
        <div style="height:18px;border-radius:4px;width:55%;background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.4s ease-in-out infinite;"></div>
      </div>
    </div>`).join('');
}

// ─── BUSCA DE ANÚNCIOS DO BANCO ───────────────
let _fetchAdsController = null;

/**
 * Carrega anúncios do banco via getAds() com paginação keyset.
 * @param {boolean} append - se true, adiciona aos resultados existentes
 */
async function fetchAndRenderAds(append = false) {
  if (_isLoading) return;
  _isLoading = true;

  if (_fetchAdsController) _fetchAdsController.abort();
  _fetchAdsController = new AbortController();
  const signal = _fetchAdsController.signal;

  const container = document.getElementById('ads-container');
  if (!container) { _isLoading = false; return; }

  const f = readFilters();

  // Parâmetros de localização lidos diretamente dos dropdowns (única fonte de verdade)
  const geoParams = { country: f.country || null, state: f.state || null, city: f.city || null };

  if (!append) {
    _nextCursor  = null;
    _totalShown  = 0;
    renderSkeleton(container, PAGE_SIZE);
  }

  try {
    const result = await getAds({
      search:    f.search   || null,
      category:  f.category || null,
      country:   geoParams.country,
      state:     geoParams.state,
      city:      geoParams.city,
      preco_min: f.priceMin,
      preco_max: f.priceMax,
      featured:  f.featured || null,
      cursor:    append ? _nextCursor : null,
      limit:     PAGE_SIZE,
      signal:    signal,
    });

    if (signal.aborted) {
      _isLoading = false;
      return; 
    }

    const lang = f.lang;
    const ads  = result.ads || [];
    _nextCursor = result.nextCursor;
    _hasMore    = result.hasMore;
    _totalShown += ads.length;

    if (!append) {
      if (ads.length === 0) {
        // Contexto inteligente: se há filtro de localização ativo nos dropdowns, sugere expandir
        const hasGeoFilter = geoParams.city || geoParams.state || geoParams.country;
        const geoLabel = hasGeoFilter && (
          geoParams.city    ? `em ${geoParams.city}`    :
          geoParams.state   ? `em ${f.stateName || geoParams.state}`   :
          geoParams.country ? `em ${geoParams.country}` : ''
        );

        const title    = hasGeoFilter
          ? `Nenhum anúncio encontrado ${geoLabel}`
          : 'Nenhum anúncio encontrado';

        const subtitle = hasGeoFilter
          ? 'Tente expandir o raio de busca ou remova o filtro de localização.'
          : 'Tente ajustar os filtros ou buscar por outro termo.';

        const nextLevelLabel = geoParams.city
          ? 'Ver anúncios no estado inteiro'
          : geoParams.state ? 'Ver anúncios em todo o país' : 'Ver anúncios globais';

        container.innerHTML = `
          <div style="
            grid-column: 1 / -1;
            text-align: center;
            padding: var(--sp-16) var(--sp-6);
            color: var(--clr-text-muted);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--sp-3);
          ">
            <div style="
              width: 72px; height: 72px; border-radius: 50%;
              background: #f0fdf4; display: flex; align-items: center;
              justify-content: center; font-size: 2.2rem; margin-bottom: var(--sp-2);
            ">🔍</div>
            <h3 style="font-size: var(--fs-xl); font-weight: 700; color: var(--clr-text); margin: 0;">${title}</h3>
            <p style="max-width: 340px; line-height: 1.6; margin: 0;">${subtitle}</p>
            <div style="display: flex; gap: var(--sp-3); flex-wrap: wrap; justify-content: center; margin-top: var(--sp-4);">
              ${hasGeoFilter ? `
                <button onclick="advanceGeoLevel()" class="btn btn--primary">
                  📍 ${nextLevelLabel}
                </button>
              ` : ''}
              <button onclick="clearFilters()" class="btn btn--outline" style="border: 1.5px solid var(--clr-primary-mid); color: var(--clr-primary-mid); background: transparent; padding: var(--sp-2) var(--sp-6); border-radius: var(--radius-full); font-weight: 600; cursor: pointer;">
                Limpar todos os filtros
              </button>
            </div>
          </div>`;
      } else {
        container.innerHTML = ads.map(ad => buildAdCard(ad, lang)).join('');
      }
    } else {
      // Append para load more
      ads.forEach(ad => {
        container.insertAdjacentHTML('beforeend', buildAdCard(ad, lang));
      });
    }

    updateResultsCount(_totalShown, _hasMore);
    setupInfiniteScroll();
    setTimeout(initObserver, 50);

  } catch (e) {
    console.error('[filters] Erro ao buscar anúncios:', e);
    if (!append) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:var(--sp-16);">
          <p style="color:var(--clr-text-muted)">Erro ao carregar anúncios. Tente novamente.</p>
          <button onclick="applyFilters()" class="btn btn--primary" style="margin-top:1rem">Tentar novamente</button>
        </div>`;
    }
  } finally {
    _isLoading = false;
  }
}

// ─── INFINITE SCROLL (cursor-based) ──────────
function setupInfiniteScroll() {
  const pagContainer = document.getElementById('pagination');
  if (!pagContainer) return;

  if (_hasMore) {
    pagContainer.innerHTML = `<div id="infinite-sentinel" style="padding:var(--sp-8);text-align:center;color:var(--clr-text-muted);width:100%;">Carregando mais anúncios...</div>`;
    setTimeout(() => {
      const sentinel = document.getElementById('infinite-sentinel');
      if (!sentinel) return;
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && _hasMore && !_isLoading) {
          obs.disconnect();
          fetchAndRenderAds(true);
        }
      }, { rootMargin: '400px' });
      obs.observe(sentinel);
    }, 50);
  } else {
    pagContainer.innerHTML = '';
  }
}

// ─── APPLY FILTERS (debounced) ────────────────
function applyFilters(searchQuery) {
  if (searchQuery !== undefined) {
    const searchEl = document.getElementById('header-search-input');
    if (searchEl && searchQuery !== undefined) searchEl.value = searchQuery;
  }

  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    fetchAndRenderAds(false);
    // loadCategoryCountsFromDB() é chamada apenas no init — não muda durante a sessão
    const f = readFilters();
    updateActiveFilterTags(f.category, f.featured, false, false, f.priceMin, f.priceMax, f.countryOpt, f.stateName, f.cityName);
    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) {
      const hasFilters = f.category || f.featured || f.priceMin !== null || f.priceMax !== null || f.country || f.search;
      clearBtn.style.display = hasFilters ? 'block' : 'none';
    }
  }, 350);
}

// ─── RESULTS COUNT ────────────────────────────
function updateResultsCount(total, hasMore) {
  const el = document.getElementById('results-count');
  if (!el) return;
  const label = hasMore ? `${total}+ anúncios encontrados` : `${total} anúncio${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`;
  el.textContent = currentLang === 'es'
    ? label.replace('anúncios', 'anuncios').replace('anúncio', 'anuncio').replace('encontrados', 'encontrados')
    : label;
}

// ─── PAGE TITLE ───────────────────────────────
function updatePageTitle(catId) {
  const catObj = typeof CATEGORIES !== 'undefined' ? CATEGORIES.find(c => c.id === catId) : null;
  const titleEl = document.getElementById('list-page-title');
  const bcCat   = document.getElementById('bc-category');
  if (catObj && titleEl) {
    const name = currentLang === 'es' ? catObj.name_es : catObj.name_pt;
    titleEl.textContent = name;
    if (bcCat) bcCat.textContent = name;
  }
}

// ─── ACTIVE FILTER TAGS ───────────────────────
function updateActiveFilterTags(cat, feat, neg, verif, pMin, pMax, countryOpt, stateName, cityName) {
  const container = document.getElementById('active-filters');
  if (!container) return;
  const tags = [];
  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'pt';

  if (cat) {
    const catObj = typeof CATEGORIES !== 'undefined' ? CATEGORIES.find(c => c.id === cat) : null;
    if (catObj) tags.push({ label: lang === 'es' ? catObj.name_es : catObj.name_pt, clear: () => { const r = document.querySelector(`input[name="category"][value="${cat}"]`); if (r) r.checked = false; const all = document.querySelector('input[name="category"][value=""]'); if (all) all.checked = true; applyFilters(); } });
  }
  if (feat) tags.push({ label: t('filter_featured'), clear: () => { const el = document.getElementById('chk-featured'); if (el) el.checked = false; applyFilters(); } });

  if (pMin !== null || pMax !== null) {
    let lbl = '';
    if (pMin !== null && pMax !== null) lbl = `R$ ${pMin} - ${pMax}`;
    else if (pMin !== null) lbl = `Acima R$ ${pMin}`;
    else lbl = `Até R$ ${pMax}`;
    tags.push({ label: lbl, clear: () => {
      const minEl = document.getElementById('price-min'); if (minEl) minEl.value = '';
      const maxEl = document.getElementById('price-max'); if (maxEl) maxEl.value = '';
      document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));
      applyFilters();
    }});
  }

  // Localização não gera tag separada — o geo-badge já exibe cidade/estado/país.
  // Evita duplicação: "Perto de você — Belo Horizonte ✕" + "Belo Horizonte ✕".

  container.innerHTML = tags.map((tag, i) => `<button class="active-filter-tag" onclick="removeFilterTag(${i})" aria-label="Remover filtro: ${tag.label}">${tag.label} <span aria-hidden="true">✕</span></button>`).join('');
  container._clearFns = tags.map(t => t.clear);

  // Adiciona o geo-badge no topo (lê os dropdowns como fonte de verdade)
  renderGeoFilterBadge();

} // ← fechamento correto de updateActiveFilterTags

function removeFilterTag(i) {
  const container = document.getElementById('active-filters');
  if (container && container._clearFns && container._clearFns[i]) container._clearFns[i]();
}

// ─── CLEAR FILTERS ────────────────────────────
function clearFilters() {
  document.querySelectorAll('input[name="category"]').forEach(r => r.checked = false);
  const catAll = document.querySelector('input[name="category"][value=""]');
  if (catAll) catAll.checked = true;

  const chkFeat = document.getElementById('chk-featured');   if (chkFeat)  chkFeat.checked  = false;
  const chkNeg  = document.getElementById('chk-negotiable');  if (chkNeg)   chkNeg.checked   = false;
  const chkVerif = document.getElementById('chk-verified');   if (chkVerif) chkVerif.checked  = false;

  const minEl = document.getElementById('price-min'); if (minEl) minEl.value = '';
  const maxEl = document.getElementById('price-max'); if (maxEl) maxEl.value = '';

  const countryEl = document.getElementById('filter-country');
  if (countryEl) countryEl.selectedIndex = 0;

  const stateEl = document.getElementById('filter-state');
  if (stateEl) { stateEl.innerHTML = '<option value="">Todos os Estados</option>'; stateEl.disabled = true; }

  const cityEl = document.getElementById('filter-city');
  if (cityEl) { cityEl.innerHTML = '<option value="">Todas as Cidades</option>'; cityEl.disabled = true; }

  document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));

  const searchEl = document.getElementById('header-search-input');
  if (searchEl) searchEl.value = '';

  // Remove geo-filter badge (os dropdowns já foram limpos acima)
  const geoBadge = document.getElementById('geo-filter-badge');
  if (geoBadge) geoBadge.remove();

  applyFilters();
}

// ─── LOCATIONS (sem dependência de API externa) ──
async function initLocations() {
  const countryEl = document.getElementById('filter-country');
  if (!countryEl) return;

  countryEl.innerHTML = '<option value="">Carregando Países...</option>';
  countryEl.disabled = true;

  try {
    const countries = await getCountries();
    countryEl.innerHTML = '<option value="">Todos os Países</option>';
    const fragment = document.createDocumentFragment();
    countries.forEach(country => {
      const opt = document.createElement('option');
      opt.value = country.id;
      const lang = (typeof currentLang !== 'undefined') ? currentLang : 'pt';
      const translatedName = (COUNTRY_NAMES[lang] && COUNTRY_NAMES[lang][country.sigla]) ? COUNTRY_NAMES[lang][country.sigla] : country.nome;
      opt.textContent = translatedName;
      opt.dataset.sigla = country.sigla;
      opt.dataset.nome  = country.nome;
      fragment.appendChild(opt);
    });
    countryEl.appendChild(fragment);
    countryEl.disabled = false;
  } catch (e) {
    console.error('Erro ao carregar países:', e);
    countryEl.innerHTML = '<option value="">Erro ao carregar</option>';
  }
}

async function updateLocationOptions(type) {
  const countryEl = document.getElementById('filter-country');
  const stateEl   = document.getElementById('filter-state');
  const cityEl    = document.getElementById('filter-city');

  if (type === 'country') {
    const selectedCountryId = countryEl.value;
    stateEl.innerHTML = '<option value="">Todos os Estados</option>';
    cityEl.innerHTML  = '<option value="">Todas as Cidades</option>';
    cityEl.disabled   = true;

    if (!selectedCountryId) {
      stateEl.disabled = true;
    } else {
      stateEl.innerHTML = '<option value="">Carregando Estados...</option>';
      stateEl.disabled  = true;
      try {
        const states = await getStates(selectedCountryId);
        stateEl.innerHTML = '<option value="">Todos os Estados</option>';
        const fragment = document.createDocumentFragment();
        states.forEach(state => {
          const opt = document.createElement('option');
          opt.value = state.id;
          opt.textContent = state.nome;
          opt.dataset.sigla = state.sigla || '';
          fragment.appendChild(opt);
        });
        stateEl.appendChild(fragment);
        stateEl.disabled = false;
      } catch (e) {
        stateEl.innerHTML = '<option value="">Erro</option>';
      }
    }
  } else if (type === 'state') {
    const selectedStateId = stateEl.value;
    cityEl.innerHTML = '<option value="">Todas as Cidades</option>';

    if (!selectedStateId) {
      cityEl.disabled = true;
    } else {
      cityEl.innerHTML = '<option value="">Carregando Cidades...</option>';
      cityEl.disabled  = true;
      try {
        const cities = await getCities(selectedStateId);
        cityEl.innerHTML = '<option value="">Todas as Cidades</option>';
        const fragment = document.createDocumentFragment();
        cities.forEach(city => {
          const opt = document.createElement('option');
          opt.value = city.id;
          opt.textContent = city.nome;
          fragment.appendChild(opt);
        });
        cityEl.appendChild(fragment);
        cityEl.disabled = false;
      } catch (e) {
        cityEl.innerHTML = '<option value="">Erro</option>';
      }
    }
  }
  applyFilters();
}

// ─── PRICE SHORTCUT ───────────────────────────
function setPrice(min, max, e) {
  const minEl = document.getElementById('price-min');
  const maxEl = document.getElementById('price-max');
  if (minEl) minEl.value = min || '';
  if (maxEl) maxEl.value = max || '';
  document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  applyFilters();
}

// ─── VIEW MODE ────────────────────────────────
function setView(mode) {
  currentView = mode;
  const container = document.getElementById('ads-container');
  if (!container) return;
  const gridBtn = document.getElementById('view-grid');
  const listBtn = document.getElementById('view-list');
  if (mode === 'list') {
    container.classList.add('list-mode');
    if (listBtn) { listBtn.classList.add('active'); listBtn.setAttribute('aria-pressed', 'true'); }
    if (gridBtn) { gridBtn.classList.remove('active'); gridBtn.setAttribute('aria-pressed', 'false'); }
  } else {
    container.classList.remove('list-mode');
    if (gridBtn) { gridBtn.classList.add('active'); gridBtn.setAttribute('aria-pressed', 'true'); }
    if (listBtn) { listBtn.classList.remove('active'); listBtn.setAttribute('aria-pressed', 'false'); }
  }
}

function toggleFilterGroup(btn) {
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
}

function openFilterSheet() {
  document.getElementById('filter-overlay').style.display = 'block';
  document.getElementById('filter-sheet').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeFilterSheet() {
  document.getElementById('filter-overlay').style.display = 'none';
  document.getElementById('filter-sheet').style.display = 'none';
  document.body.style.overflow = '';
}

// ─── COMPATIBILIDADE ─────────────────────────
function renderAdsList() { /* delegado ao fetchAndRenderAds */ }
function changePage()    { /* obsoletado pelo Infinite Scroll */ }
function goToPage()      { /* obsoletado pelo Infinite Scroll */ }

// ─── INIT ─────────────────────────────────────
async function initFiltersPage() {
  // Garante que as categorias estão carregadas do banco antes de renderizar filtros
  if (typeof fetchCategoriesFromDB === 'function') {
    await fetchCategoriesFromDB();
  }

  renderCategoryFilters();

  const params    = new URLSearchParams(location.search);
  const catParam  = params.get('cat')  || '';
  const qParam    = params.get('q')    || '';
  const featParam = params.get('featured') === 'true';

  // Aplica parâmetros da URL nos filtros
  if (catParam) {
    const radio = document.querySelector(`input[name="category"][value="${catParam}"]`);
    if (radio) radio.checked = true;
  }
  if (featParam) {
    const chk = document.getElementById('chk-featured');
    if (chk) chk.checked = true;
  }
  if (qParam) {
    const searchEl = document.getElementById('header-search-input');
    if (searchEl) searchEl.value = qParam;
  }

  // Bind de eventos
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.addEventListener('change', () => applyFilters());

  document.querySelectorAll('input[name="category"]').forEach(r => r.addEventListener('change', () => applyFilters()));

  ['chk-featured', 'chk-negotiable', 'chk-verified'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => applyFilters());
  });

  ['price-min', 'price-max'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('blur', () => applyFilters());
      el.addEventListener('keyup', e => { if (e.key === 'Enter') applyFilters(); });
    }
  });

  // Carrega países no dropdown (com cache — apenas 1 query ao banco)
  if (typeof getCountries === 'function') {
    await initLocations();
  }

  // ── Estratégia de localização automática ──────────────────────────────────
  // 1. Busca inicial sem filtro geo (resposta imediata para o usuário)
  // 2. Quando a localização chega (GPS/IP), pré-preenche os dropdowns em cascata
  //    País → Estado → Cidade, sem double-fetch desnecessário quando o geo
  //    chega rápido (< 600ms) — nesse caso, prefill roda ANTES da busca inicial.

  const geoPromise = typeof _locationPromise !== 'undefined'
    ? _locationPromise.catch(() => null)
    : Promise.resolve(null);

  // Race: geo vs timeout de 600ms
  const loc = await Promise.race([
    geoPromise,
    new Promise(res => setTimeout(res, 600))
  ]);

  if (loc && (loc.city || loc.state || loc.country)) {
    // Geo chegou rápido: pré-preenche dropdowns e busca com filtro geo
    await prefillLocationFromGeo(loc);
  } else {
    // Geo não chegou ainda: busca sem filtro e aplica quando chegar
    await Promise.all([
      fetchAndRenderAds(false),
      loadCategoryCountsFromDB(),
    ]);

    geoPromise.then(lateLoc => {
      if (!lateLoc || (!lateLoc.city && !lateLoc.state && !lateLoc.country)) return;
      // Só pré-preenche se o usuário não tiver feito seleção manual
      const f = readFilters();
      const hasManualLocation = f.country || f.state || f.city;
      if (!hasManualLocation) prefillLocationFromGeo(lateLoc);
    });
  }

  updatePageTitle(catParam);

}

document.addEventListener('DOMContentLoaded', () => {
  initFiltersPage();

  const searchInput = document.getElementById('header-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => applyFilters(), 350);
    });
  }
});
