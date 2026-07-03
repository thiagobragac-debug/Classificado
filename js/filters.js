// ============================================
//   TAUZE CLASS — Filters Logic
// ============================================

let currentFilters = { category: '', country: '', state: '', priceMin: '', priceMax: '', featured: false, negotiable: false, verified: false };
let currentView = 'grid';
let filteredAds = [...ADS];

function initFiltersPage() {
  // Read URL params
  const params = new URLSearchParams(location.search);
  const catParam = params.get('cat') || '';
  const qParam   = params.get('q') || '';
  const featParam = params.get('featured') === 'true';

  if (catParam) {
    currentFilters.category = catParam;
    const radio = document.querySelector(`input[name="category"][value="${catParam}"]`);
    if (radio) radio.checked = true;
  }
  if (featParam) {
    currentFilters.featured = true;
    const chk = document.getElementById('chk-featured');
    if (chk) chk.checked = true;
  }

  if (typeof LOCATIONS_DATA !== 'undefined') {
    initLocations();
  }

  applyFilters(qParam);
  updatePageTitle(catParam);
}

function updatePageTitle(catId) {
  const catObj = CATEGORIES.find(c => c.id === catId);
  const titleEl = document.getElementById('list-page-title');
  const bcCat   = document.getElementById('bc-category');
  if (catObj && titleEl) {
    const name = currentLang === 'es' ? catObj.name_es : catObj.name_pt;
    titleEl.textContent = name;
    if (bcCat) bcCat.textContent = name;
  }
}

function applyFilters(searchQuery = '') {
  const catRadio   = document.querySelector('input[name="category"]:checked');
  const countryEl  = document.getElementById('filter-country');
  const stateEl    = document.getElementById('filter-state');
  const cityEl     = document.getElementById('filter-city');
  
  const country    = countryEl?.value || '';
  const state      = stateEl?.value || '';
  const city       = cityEl?.value || '';
  
  const priceMin   = parseFloat(document.getElementById('price-min')?.value || 0) || 0;
  const priceMax   = parseFloat(document.getElementById('price-max')?.value || Infinity) || Infinity;
  const onlyFeat   = document.getElementById('chk-featured')?.checked || false;
  const onlyNeg    = document.getElementById('chk-negotiable')?.checked || false;
  const onlyVerif  = document.getElementById('chk-verified')?.checked || false;

  const cat = catRadio ? catRadio.value : '';

  const q = (searchQuery || document.getElementById('header-search-input')?.value || '').toLowerCase();

  const countryName = country && countryEl.options[countryEl.selectedIndex] ? countryEl.options[countryEl.selectedIndex].text : '';
  const stateName = state && stateEl.options[stateEl.selectedIndex] ? stateEl.options[stateEl.selectedIndex].text : '';
  const cityName = city && cityEl.options[cityEl.selectedIndex] ? cityEl.options[cityEl.selectedIndex].text : '';

  filteredAds = ADS.filter(ad => {
    const title    = currentLang === 'es' ? ad.title_es : ad.title_pt;
    const adCat    = currentLang === 'es' ? ad.category_es : ad.category_pt;

    if (cat) {
      const catObj = CATEGORIES.find(c => c.id === cat);
      if (catObj) {
        const catName = currentLang === 'es' ? catObj.name_es : catObj.name_pt;
        if (adCat !== catName) return false;
      }
    }
    if (onlyFeat   && !ad.featured)    return false;
    if (onlyNeg    && !ad.negotiable)  return false;
    if (onlyVerif  && !ad.verified)    return false;
    if (q && !title.toLowerCase().includes(q) && !adCat.toLowerCase().includes(q)) return false;

    if (typeof ad.price === 'number') {
      if (ad.price < priceMin || ad.price > priceMax) return false;
    }

    if (ad.location) {
      if (cityName && !ad.location.includes(cityName)) return false;
      if (!cityName && stateName && !ad.location.includes(stateName) && !ad.location.includes(state)) return false;
      if (!cityName && !stateName && countryName && !ad.location.includes(countryName)) return false;
    }

    return true;
  });

  // Premium (Featured) ADS to the Top
  filteredAds.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return 0;
  });

  renderAdsList();
  updateResultsCount();
  updateActiveFilterTags(cat, onlyFeat, onlyNeg, onlyVerif);
  
  // Show clear button if any filter active
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) clearBtn.style.display = (cat || onlyFeat || onlyNeg || onlyVerif || priceMin || (priceMax !== Infinity) || country) ? 'block' : 'none';
}

function renderAdsList() {
  const container = document.getElementById('ads-container');
  if (!container) return;

  if (filteredAds.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:var(--sp-16);color:var(--clr-text-muted)">
        <div style="font-size:3rem;margin-bottom:var(--sp-4)">🔍</div>
        <h3 style="font-size:var(--fs-xl);margin-bottom:var(--sp-2);color:var(--clr-text)">Nenhum anúncio encontrado</h3>
        <p>Tente ajustar os filtros ou busque por outros termos.</p>
        <button onclick="clearFilters()" class="btn btn--primary" style="margin-top:var(--sp-6)">Limpar Filtros</button>
      </div>`;
    return;
  }

  container.innerHTML = filteredAds.map(ad => buildAdCard(ad, currentLang)).join('');

  // Re-init observer for new cards
  setTimeout(() => {
    const fadeEls = container.querySelectorAll('.fade-in-up');
    let delayIndex = 0;
    let delayTimeout = null;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), delayIndex * 60);
          delayIndex++;
          obs.unobserve(e.target);
        }
      });
      clearTimeout(delayTimeout);
      delayTimeout = setTimeout(() => { delayIndex = 0; }, 100);
    }, { threshold: 0.05 });
    fadeEls.forEach(el => obs.observe(el));
  }, 50);
}

function updateResultsCount() {
  const el = document.getElementById('results-count');
  if (!el) return;
  const n = filteredAds.length;
  el.textContent = currentLang === 'es' ? `${n} anuncios encontrados` : `${n} anúncios encontrados`;
}

function updateActiveFilterTags(cat, feat, neg, verif) {
  const container = document.getElementById('active-filters');
  if (!container) return;
  const tags = [];
  if (cat) {
    const catObj = CATEGORIES.find(c => c.id === cat);
    if (catObj) tags.push({ label: currentLang === 'es' ? catObj.name_es : catObj.name_pt, clear: () => { document.querySelector('input[name="category"][value=""]').checked = true; applyFilters(); } });
  }
  if (feat) tags.push({ label: '★ Destaque', clear: () => { document.getElementById('chk-featured').checked = false; applyFilters(); } });
  if (neg)  tags.push({ label: '💬 Negociável', clear: () => { document.getElementById('chk-negotiable').checked = false; applyFilters(); } });
  if (verif) tags.push({ label: '✓ Verificado', clear: () => { document.getElementById('chk-verified').checked = false; applyFilters(); } });

  container.innerHTML = tags.map((tag, i) => `
    <button class="active-filter-tag" onclick="removeFilterTag(${i})" aria-label="Remover filtro: ${tag.label}">
      ${tag.label} <span aria-hidden="true">✕</span>
    </button>
  `).join('');

  // Store clear functions
  container._clearFns = tags.map(t => t.clear);
}

function removeFilterTag(i) {
  const container = document.getElementById('active-filters');
  if (container && container._clearFns && container._clearFns[i]) {
    container._clearFns[i]();
  }
}

function clearFilters() {
  document.querySelectorAll('input[name="category"]')[0].checked = true;
  ['chk-featured','chk-negotiable','chk-verified'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  ['price-min','price-max'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
    
  // Reset locations
  const countryEl = document.getElementById('filter-country');
  if (countryEl) countryEl.selectedIndex = 0;
    
  const stateEl = document.getElementById('filter-state');
  if (stateEl) {
    stateEl.innerHTML = '<option value="">Todos os Estados</option>';
    stateEl.disabled = true;
  }
    
  const cityEl = document.getElementById('filter-city');
  if (cityEl) {
    cityEl.innerHTML = '<option value="">Todas as Cidades</option>';
    cityEl.disabled = true;
  }

  document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));
  applyFilters();
}

async function initLocations() {
  const countryEl = document.getElementById('filter-country');
  if (!countryEl) return;
    
  countryEl.innerHTML = '<option value="">Carregando Países...</option>';
  countryEl.disabled = true;

  try {
    const countries = await getCountries();
    countryEl.innerHTML = '<option value="">Todos os Países</option>';
    countries.forEach(country => {
      const opt = document.createElement('option');
      opt.value = country.id;
      // Para manter a busca atual (que salva string no banco, ou ID),
      // o user pediu integração.
      opt.textContent = `${country.nome}`;
      countryEl.appendChild(opt);
    });
    countryEl.disabled = false;
  } catch(e) {
    console.error('Erro ao carregar países:', e);
    countryEl.innerHTML = '<option value="">Erro ao carregar</option>';
  }
}
  
async function updateLocationOptions(type) {
  const countryEl = document.getElementById('filter-country');
  const stateEl = document.getElementById('filter-state');
  const cityEl = document.getElementById('filter-city');
    
  if (type === 'country') {
    const selectedCountryId = countryEl.value;
      
    // Reset State and City
    stateEl.innerHTML = '<option value="">Todos os Estados</option>';
    cityEl.innerHTML = '<option value="">Todas as Cidades</option>';
    cityEl.disabled = true;
      
    if (!selectedCountryId) {
      stateEl.disabled = true;
    } else {
      stateEl.innerHTML = '<option value="">Carregando Estados...</option>';
      stateEl.disabled = true;
      try {
        const states = await getStates(selectedCountryId);
        stateEl.innerHTML = '<option value="">Todos os Estados</option>';
        states.forEach(state => {
          const opt = document.createElement('option');
          opt.value = state.id;
          opt.textContent = state.nome;
          stateEl.appendChild(opt);
        });
        stateEl.disabled = false;
      } catch(e) {
        console.error('Erro ao carregar estados:', e);
        stateEl.innerHTML = '<option value="">Erro</option>';
      }
    }
  } else if (type === 'state') {
    const selectedStateId = stateEl.value;
      
    // Reset City
    cityEl.innerHTML = '<option value="">Todas as Cidades</option>';
      
    if (!selectedStateId) {
      cityEl.disabled = true;
    } else {
      cityEl.innerHTML = '<option value="">Carregando Cidades...</option>';
      cityEl.disabled = true;
      try {
        const cities = await getCities(selectedStateId);
        cityEl.innerHTML = '<option value="">Todas as Cidades</option>';
        cities.forEach(city => {
          const opt = document.createElement('option');
          opt.value = city.id;
          opt.textContent = city.nome;
          cityEl.appendChild(opt);
        });
        cityEl.disabled = false;
      } catch(e) {
        console.error('Erro ao carregar cidades:', e);
        cityEl.innerHTML = '<option value="">Erro</option>';
      }
    }
  }
  
  applyFilters();
}

function setPrice(min, max, e) {
  const minEl = document.getElementById('price-min');
  const maxEl = document.getElementById('price-max');
  if (minEl) minEl.value = min || '';
  if (maxEl) maxEl.value = max || '';
  document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  applyFilters();
}

function setView(mode) {
  currentView = mode;
  const container = document.getElementById('ads-container');
  if (!container) return;

  const gridBtn = document.getElementById('view-grid');
  const listBtn = document.getElementById('view-list');

  if (mode === 'list') {
    container.classList.add('list-mode');
    if (listBtn) { listBtn.classList.add('active'); listBtn.setAttribute('aria-pressed','true'); }
    if (gridBtn) { gridBtn.classList.remove('active'); gridBtn.setAttribute('aria-pressed','false'); }
  } else {
    container.classList.remove('list-mode');
    if (gridBtn) { gridBtn.classList.add('active'); gridBtn.setAttribute('aria-pressed','true'); }
    if (listBtn) { listBtn.classList.remove('active'); listBtn.setAttribute('aria-pressed','false'); }
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

function changePage(dir) { /* stub — would implement real pagination with backend */ }
function goToPage(n) { /* stub */ }

// Hook into DOMContentLoaded from main.js
document.addEventListener('DOMContentLoaded', () => {
  initFiltersPage();

  // Live search
  const searchInput = document.getElementById('header-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => applyFilters(), 300);
    });
  }
});
