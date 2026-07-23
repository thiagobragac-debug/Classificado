import { useState } from 'react';
import { AdBanner } from '@/components/AdBanner';
import { Category, COUNTRY_FLAGS } from './AdCard';
import { useAdsFilter } from './AdsFilterContext';

const TRANSLATIONS = {
  pt: {
    filters: 'Filtros', clear: 'Limpar', search: 'Buscar anúncios...',
    category: 'Categoria', allCats: 'Todas as Categorias',
    location: 'Localização', allCountries: 'Todos os Países',
    allStates: 'Todos os Estados', allCities: 'Todas as Cidades',
    priceRange: 'Faixa de Preço', min: 'Mínimo', max: 'Máximo', upTo: 'Até',
    offerType: 'Tipo de Oferta', onlyFeatured: 'Apenas Destaques',
    negotiable: 'Negociável', apply: 'Aplicar Filtros'
  },
  es: {
    filters: 'Filtros', clear: 'Limpiar', search: 'Buscar anuncios...',
    category: 'Categoría', allCats: 'Todas las Categorías',
    location: 'Ubicación', allCountries: 'Todos los Países',
    allStates: 'Todos los Estados', allCities: 'Todas las Ciudades',
    priceRange: 'Rango de Precio', min: 'Mínimo', max: 'Máximo', upTo: 'Hasta',
    offerType: 'Tipo de Oferta', onlyFeatured: 'Solo Destacados',
    negotiable: 'Negociable', apply: 'Aplicar Filtros'
  }
};

function FilterGroup({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="filter-group">
      <button className="filter-group-title" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && <div className="filter-options">{children}</div>}
    </div>
  );
}

export default function AdsSidebar() {
  const {
    lang, categories, countries, states, cities,
    hasFilters, clearFilters, applyFilters, handleSearch,
    busca, categoria, setCategoria,
    pais, setPais, estado, setEstado, cidade, setCidade,
    precoMin, setPrecoMin, precoMax, setPrecoMax, setPrice,
    destaque, setDestaque, negociavel, setNegociavel
  } = useAdsFilter();

  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;

  return (
    <>
      <div className="filter-header">
        <h2 className="filter-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          {t.filters}
        </h2>
        {hasFilters && <button className="filter-clear" onClick={clearFilters} id="clear-filters-btn">{t.clear}</button>}
      </div>

      <div className="filter-group" style={{ paddingBottom: '1.5rem' }}>
        <div className="location-group" style={{ display: 'flex', alignItems: 'center', paddingLeft: 'var(--sp-3)' }}>
          <span className="search-icon" style={{ color: 'var(--clr-text-muted)', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input type="search" className="filter-select-clean" placeholder="Buscar raça, marca..."
            value={busca} onChange={e => handleSearch(e.target.value)} />
        </div>
      </div>

      <FilterGroup title={t.category}>
        <label className="filter-option category-option">
          <input type="radio" name="category" value="" checked={categoria === ''} onChange={() => { setCategoria(''); applyFilters({ categoria: '' }); }} />
          <span className="cat-icon-wrap" style={{ color: 'var(--clr-text-muted)', fontSize: '14px' }}>🗂️</span>
          <span>{t.allCats}</span>
        </label>
        {categories.map(cat => (
          <label key={cat.id} className="filter-option category-option">
            <input type="radio" name="category" value={cat.id} checked={categoria === cat.id} onChange={() => { setCategoria(cat.id); applyFilters({ categoria: cat.id }); }} />
            <span className="cat-icon-wrap" style={{ color: cat.color || 'var(--clr-text-muted)' }} dangerouslySetInnerHTML={{ __html: cat.icon || '🗂️' }} />
            <span>{lang === 'es' ? cat.name_es : cat.name_pt}</span>
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title={t.location}>
        <div className="location-group">
          <div className="location-select-wrapper">
            <select className="filter-select-clean" aria-label={t.allCountries}
              value={pais} onChange={e => { setPais(e.target.value); setEstado(''); setCidade(''); applyFilters({ pais: e.target.value, estado: '', cidade: '' }); }}>
              <option value="">{t.allCountries}</option>
              {countries.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c] || '🌎'} {c}</option>)}
            </select>
          </div>
          <div className="location-divider"></div>
          <div className="location-select-wrapper">
            <select className="filter-select-clean" aria-label={t.allStates} disabled={!pais}
              value={estado} onChange={e => { setEstado(e.target.value); setCidade(''); applyFilters({ estado: e.target.value, cidade: '' }); }}>
              <option value="">{t.allStates}</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="location-divider"></div>
          <div className="location-select-wrapper">
            <select className="filter-select-clean" aria-label={t.allCities} disabled={!estado}
              value={cidade} onChange={e => { setCidade(e.target.value); applyFilters({ cidade: e.target.value }); }}>
              <option value="">{t.allCities}</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </FilterGroup>

      <FilterGroup title={t.priceRange}>
        <div className="price-input-group">
          <span className="price-currency">R$</span>
          <input type="number" className="price-input-clean" placeholder={t.min} aria-label={t.min}
            value={precoMin} onChange={e => setPrecoMin(e.target.value)} />
          <div className="price-divider"></div>
          <input type="number" className="price-input-clean" placeholder={t.max} aria-label={t.max}
            value={precoMax} onChange={e => setPrecoMax(e.target.value)} />
        </div>
        <div className="price-shortcuts" role="group" aria-label="Atalhos de preço">
          <button className="price-shortcut" onClick={() => { setPrice('', '5000'); applyFilters({ precoMin: '', precoMax: '5000' }); }}>{t.upTo} 5k</button>
          <button className="price-shortcut" onClick={() => { setPrice('5000', '20000'); applyFilters({ precoMin: '5000', precoMax: '20000' }); }}>5k–20k</button>
          <button className="price-shortcut" onClick={() => { setPrice('20000', '100000'); applyFilters({ precoMin: '20000', precoMax: '100000' }); }}>20k–100k</button>
          <button className="price-shortcut" onClick={() => { setPrice('100000', ''); applyFilters({ precoMin: '100000', precoMax: '' }); }}>+100k</button>
        </div>
      </FilterGroup>

      <FilterGroup title={t.offerType}>
        <label className="filter-option" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={destaque} onChange={e => { setDestaque(e.target.checked); applyFilters({ destaque: e.target.checked }); }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--clr-accent-pale)" stroke="var(--clr-accent)" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          {t.onlyFeatured}
        </label>
        <label className="filter-option" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={negociavel} onChange={e => { setNegociavel(e.target.checked); applyFilters({ negociavel: e.target.checked }); }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary-mid)" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          {t.negotiable}
        </label>
      </FilterGroup>

      <button className="btn btn--primary" onClick={() => applyFilters()} style={{ width: '100%', marginTop: 'var(--sp-4)' }}>
        {t.apply}
      </button>

      {/* Ad Banner dinâmico da Sidebar */}
      <AdBanner position="listagem_sidebar" />
    </>
  );
}
