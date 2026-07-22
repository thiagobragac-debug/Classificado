// ============================================================
//   TAUZE CLASS — Smart Search Autocomplete
//   Funciona em todas as páginas que têm #header-search-input
// ============================================================

(function () {
  const RECENT_KEY  = 'tc_recent_searches';
  const MAX_RECENT  = 6;

  // ── Popular suggestions (bilingual) ──────────────────────
  const POPULAR = {
    pt: ['nelore', 'angus', 'trator', 'fazenda', 'soja', 'milho', 'garrote', 'novilha', 'cavalo', 'suíno'],
    es: ['nelore', 'angus', 'tractor', 'estancia', 'soja', 'maíz', 'novillo', 'vaquillona', 'caballo', 'porcino'],
  };

  // ── Locations for Autocomplete ─────────────────────────────
  const LOCATIONS = [
    { name: 'Brasil', flag: '🇧🇷', id: 'BR' },
    { name: 'Paraguai', flag: '🇵🇾', id: 'PY' },
    { name: 'Argentina', flag: '🇦🇷', id: 'AR' },
    { name: 'Uruguai', flag: '🇺🇾', id: 'UY' },
    { name: 'Mato Grosso', flag: '📍', id: 'MT' },
    { name: 'Goiás', flag: '📍', id: 'GO' },
    { name: 'Mato Grosso do Sul', flag: '📍', id: 'MS' },
    { name: 'São Paulo', flag: '📍', id: 'SP' },
    { name: 'Minas Gerais', flag: '📍', id: 'MG' },
    { name: 'Paraná', flag: '📍', id: 'PR' },
    { name: 'Rio Grande do Sul', flag: '📍', id: 'RS' }
  ];

  // ── Icons per category (emoji fallback) ──────────────────
  const CAT_EMOJI = {
    bovinos: '🐄', equinos: '🐎', suinos: '🐷', ovinos: '🐑',
    aves: '🐔', insumos: '🌱', maquinas: '🚜', imoveis: '🏡',
    genetica: '🧬', aquicult: '🐟', servicos: '🔧', outros: '📦',
  };

  function getLang() {
    return (typeof currentLang !== 'undefined' ? currentLang : null) ||
           localStorage.getItem('tc_lang') || 'pt';
  }

  function getRecentSearches() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }

  function saveSearch(term) {
    if (!term || term.length < 2) return;
    let recents = getRecentSearches().filter(r => r !== term);
    recents.unshift(term);
    if (recents.length > MAX_RECENT) recents = recents.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
  }

  function formatCount(n) {
    return n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : n;
  }

  function matchCategories(query, lang) {
    if (!query || typeof CATEGORIES === 'undefined') return [];
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return CATEGORIES.filter(c => {
      const name = (lang === 'es' ? c.name_es : c.name_pt)
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q);
    });
  }

  function matchLocations(query) {
    if (!query) return [];
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return LOCATIONS.filter(l => l.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
  }

  function matchPopular(query, lang) {
    if (!query) return [];
    const q = query.toLowerCase();
    return POPULAR[lang] ? POPULAR[lang].filter(p => p.includes(q) && p !== q) : [];
  }

  function navigateTo(term, catId) {
    saveSearch(term);
    const base = 'listagem.html';
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (catId) params.set('cat', catId);
    window.location.href = `${base}?${params.toString()}`;
  }

  function buildDropdown(input, dropdown, query) {
    const lang    = getLang();
    const recents = getRecentSearches();
    const cats    = matchCategories(query, lang);
    const locs    = matchLocations(query);
    const popular = matchPopular(query, lang).slice(0, 4);
    const hasQ    = query && query.length >= 1;

    let html = '';

    // ── Localidades matching ──────────────────────────────
    if (hasQ && locs.length) {
      html += `<div class="sac-group-label">Localização</div>`;
      html += locs.slice(0, 3).map(l => `
        <div class="sac-item sac-loc" data-term="${l.name}">
          <span class="sac-emoji">${l.flag}</span>
          <span class="sac-text">${highlightMatch(l.name, query)}</span>
        </div>`).join('');
    }

    // ── Categorias matching ──────────────────────────────
    if (hasQ && cats.length) {
      html += `<div class="sac-group-label">Categorias</div>`;
      html += cats.slice(0, 3).map(c => `
        <div class="sac-item sac-cat" data-cat="${c.id}" data-term="">
          <span class="sac-emoji">${CAT_EMOJI[c.id] || '📦'}</span>
          <span class="sac-text">${lang === 'es' ? c.name_es : c.name_pt}</span>
          <span class="sac-count">${formatCount(c.count)} anúncios</span>
        </div>`).join('');
    }

    // ── Popular suggestions ──────────────────────────────
    if (hasQ && popular.length) {
      html += `<div class="sac-group-label">Sugestões</div>`;
      html += popular.map(p => `
        <div class="sac-item sac-popular" data-term="${p}">
          <span class="sac-emoji">🔎</span>
          <span class="sac-text">${highlightMatch(p, query)}</span>
        </div>`).join('');
    }

    // ── Pesquisar por "query" ────────────────────────────
    if (hasQ) {
      html += `
        <div class="sac-item sac-go" data-term="${query}">
          <span class="sac-emoji">⏎</span>
          <span class="sac-text">Pesquisar <strong>"${query}"</strong></span>
        </div>`;
    }

    // ── Recentes (quando sem query) ──────────────────────
    if (!hasQ && recents.length) {
      html += `<div class="sac-group-label">Buscas Recentes</div>`;
      html += recents.map(r => `
        <div class="sac-item sac-recent" data-term="${r}">
          <span class="sac-emoji">⏱️</span>
          <span class="sac-text">${r}</span>
        </div>`).join('');
    }

    // ── Estado vazio ─────────────────────────────────────
    if (!html) return false;

    dropdown.innerHTML = html;

    // bind clicks
    dropdown.querySelectorAll('.sac-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const term  = el.dataset.term  || '';
        const catId = el.dataset.cat   || '';
        input.value = term || (catId ? (lang === 'es'
          ? CATEGORIES.find(c => c.id === catId)?.name_es
          : CATEGORIES.find(c => c.id === catId)?.name_pt) : '');
        navigateTo(term, catId);
      });
    });

    return true;
  }

  function highlightMatch(text, query) {
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return text;
    return text.slice(0, i) + `<mark>${text.slice(i, i + query.length)}</mark>` + text.slice(i + query.length);
  }

  function initSearch(inputEl) {
    if (!inputEl || inputEl.dataset.sacInit) return;
    inputEl.dataset.sacInit = '1';

    // ── Create dropdown ───────────────────────────────────
    const wrapper  = inputEl.parentElement;
    wrapper.style.position = 'relative';

    const dropdown = document.createElement('div');
    dropdown.className = 'sac-dropdown';
    dropdown.setAttribute('aria-live', 'polite');
    wrapper.appendChild(dropdown);

    let visible = false;

    function showDropdown() {
      const hasContent = buildDropdown(inputEl, dropdown, inputEl.value.trim());
      if (hasContent) {
        dropdown.style.display = 'block';
        visible = true;
        // Scroll into view on mobile
        setTimeout(() => {
          if (window.innerWidth < 768) dropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      } else {
        hideDropdown();
      }
    }

    function hideDropdown() {
      dropdown.style.display = 'none';
      visible = false;
    }

    // Events
    inputEl.addEventListener('focus', showDropdown);
    inputEl.addEventListener('input', showDropdown);
    inputEl.addEventListener('blur', () => setTimeout(hideDropdown, 150));

    // Keyboard navigation
    inputEl.addEventListener('keydown', e => {
      const items = [...dropdown.querySelectorAll('.sac-item')];
      const active = dropdown.querySelector('.sac-item.sac-active');
      const idx = active ? items.indexOf(active) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[idx + 1] || items[0];
        if (active) active.classList.remove('sac-active');
        if (next) { next.classList.add('sac-active'); inputEl.value = next.dataset.term || inputEl.value; }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[idx - 1] || items[items.length - 1];
        if (active) active.classList.remove('sac-active');
        if (prev) { prev.classList.add('sac-active'); inputEl.value = prev.dataset.term || inputEl.value; }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active) {
          const term = active.dataset.term || '';
          const cat  = active.dataset.cat  || '';
          navigateTo(term, cat);
        } else {
          const term = inputEl.value.trim();
          if (term) navigateTo(term, '');
        }
        hideDropdown();
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });
  }

  // ── Auto-init on DOMContentLoaded ────────────────────────
  function init() {
    const inputs = document.querySelectorAll('#header-search-input, #hero-search-input');
    inputs.forEach(initSearch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual init (e.g. after lang change)
  window.initSearchAutocomplete = init;
})();
