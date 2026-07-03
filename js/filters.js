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
  const country    = document.getElementById('filter-country')?.value || '';
  const state      = document.getElementById('filter-state')?.value || '';
  const priceMin   = parseFloat(document.getElementById('price-min')?.value || 0) || 0;
  const priceMax   = parseFloat(document.getElementById('price-max')?.value || Infinity) || Infinity;
  const onlyFeat   = document.getElementById('chk-featured')?.checked || false;
  const onlyNeg    = document.getElementById('chk-negotiable')?.checked || false;
  const onlyVerif  = document.getElementById('chk-verified')?.checked || false;

  const cat = catRadio ? catRadio.value : '';

  const q = (searchQuery || document.getElementById('header-search-input')?.value || '').toLowerCase();

  filteredAds = ADS.filter(ad => {
    const title    = currentLang === 'es' ? ad.title_es : ad.title_pt;
    const adCat    = currentLang === 'es' ? ad.category_es : ad.category_pt;

    if (cat && !ad.id.toString().includes('') && cat !== '') {
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

    return true;
  });

  renderAdsList();
  updateResultsCount();
  updateActiveFilterTags(cat, onlyFeat, onlyNeg, onlyVerif);

  // Show clear button if any filter active
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) clearBtn.style.display = (cat || onlyFeat || onlyNeg || onlyVerif || priceMin || (priceMax !== Infinity)) ? 'block' : 'none';
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
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), i * 60);
          obs.unobserve(e.target);
        }
      });
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
  ['filter-country','filter-state'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));
  applyFilters();
}

function setPrice(min, max) {
  const minEl = document.getElementById('price-min');
  const maxEl = document.getElementById('price-max');
  if (minEl) minEl.value = min || '';
  if (maxEl) maxEl.value = max || '';
  document.querySelectorAll('.price-shortcut').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
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
