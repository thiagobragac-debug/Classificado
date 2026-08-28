'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/lang-context';
import { POPULAR_TAGS } from '@/lib/constants';
import { useCategories } from '@/lib/categories-context';

const POPULAR = {
  pt: ['nelore', 'angus', 'trator', 'fazenda', 'soja', 'milho', 'garrote', 'novilha', 'cavalo', 'suíno'],
  es: ['nelore', 'angus', 'tractor', 'estancia', 'soja', 'maíz', 'novillo', 'vaquillona', 'caballo', 'porcino'],
};

const LOCATIONS = {
  pt: [
    { name: 'Brasil', flag: '🇧🇷', id: 'BR' },
    { name: 'Paraguai', flag: '🇵🇾', id: 'PY' },
    { name: 'Argentina', flag: '🇦🇷', id: 'AR' },
    { name: 'Uruguai', flag: '🇺🇾', id: 'UY' },
    { name: 'Mato Grosso', flag: '📍', id: 'MT' },
    { name: 'Goiás', flag: '📍', id: 'GO' },
    { name: 'Mato Grosso do Sul', flag: '📍', id: 'MS' },
    { name: 'São Paulo', flag: '📍', id: 'SP' },
  ],
  es: [
    { name: 'Brasil', flag: '🇧🇷', id: 'BR' },
    { name: 'Paraguay', flag: '🇵🇾', id: 'PY' },
    { name: 'Argentina', flag: '🇦🇷', id: 'AR' },
    { name: 'Uruguay', flag: '🇺🇾', id: 'UY' },
    { name: 'Mato Grosso', flag: '📍', id: 'MT' },
    { name: 'Goiás', flag: '📍', id: 'GO' },
    { name: 'Mato Grosso do Sul', flag: '📍', id: 'MS' },
    { name: 'São Paulo', flag: '📍', id: 'SP' },
  ],
};

const TRANSLATIONS = {
  pt: {
    searchAria: 'Busca principal',
    categoryAria: 'Categoria',
    allCats: 'Todos',
    termAria: 'Termo de busca',
    searchBtnAria: 'Buscar',
    locations: 'Locais',
    categories: 'Categorias',
    suggestions: 'Sugestões',
    popularHeading: 'Populares',
    popularTagsAria: 'Buscas populares',
  },
  es: {
    searchAria: 'Búsqueda principal',
    categoryAria: 'Categoría',
    allCats: 'Todos',
    termAria: 'Término de búsqueda',
    searchBtnAria: 'Buscar',
    locations: 'Ubicaciones',
    categories: 'Categorías',
    suggestions: 'Sugerencias',
    popularHeading: 'Populares',
    popularTagsAria: 'Búsquedas populares',
  },
} as const;

export function HeroSearchBar() {
  const categories = useCategories();
  const { lang, t } = useLang();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [catSelect, setCatSelect] = useState('');
  const [showAuto, setShowAuto] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowAuto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tt = TRANSLATIONS[lang as 'pt' | 'es'];
  const locations = LOCATIONS[lang as 'pt' | 'es'] || LOCATIONS.pt;

  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(search);

  const activeCats = categories && categories.length > 0 ? categories : [];
  const matchedCats = q ? activeCats.filter((c: any) => norm(lang === 'es' ? (c.name_es || c.name_pt) : c.name_pt).includes(q)) : [];
  const matchedLocs = q ? locations.filter(l => norm(l.name).includes(q)) : [];
  const popular = (POPULAR[lang as 'pt' | 'es'] || POPULAR.pt).filter(p => p.includes(q) && p !== q).slice(0, 4);

  const doSearch = (termOverride?: string, catOverride?: string) => {
    setShowAuto(false);
    const finalTerm = termOverride !== undefined ? termOverride : search;
    const finalCat = catOverride !== undefined ? catOverride : catSelect;
    const params = new URLSearchParams();
    if (finalTerm) params.set('busca', finalTerm);
    if (finalCat) params.set('categoria', finalCat);
    
    startTransition(() => {
      router.push(`/listagem?${params.toString()}`);
    });
  };

  return (
    <>
      <div ref={searchRef} className="hero-search-box" role="search" aria-label={tt.searchAria} style={{ position: 'relative' }}>
        <form 
          className="hero-search-inner" 
          onSubmit={(e) => {
            e.preventDefault();
            doSearch();
          }}
        >
          <select
            id="hero-category-select"
            aria-label={tt.categoryAria}
            value={catSelect}
            onChange={(e) => setCatSelect(e.target.value)}
          >
            <option value="">{tt.allCats}</option>
            {activeCats.map((c: any) => (
              <option key={c.id} value={c.id}>
                {lang === 'es' ? (c.name_es || c.name_pt) : c.name_pt}
              </option>
            ))}
          </select>
          <input
            type="search"
            id="hero-search-input"
            placeholder={t('search_placeholder')}
            aria-label={tt.termAria}
            value={search}
            onFocus={() => setShowAuto(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowAuto(true);
            }}
          />
          <button type="submit" className="hero-search-btn" aria-label={tt.searchBtnAria}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <span>{t('search_btn')}</span>
          </button>
        </form>

        {showAuto && (search.length > 1 || popular.length > 0) && (
          <div className="search-autocomplete-dropdown" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, 
            background: 'white', borderRadius: '0 0 var(--r-xl) var(--r-xl)', 
            marginTop: 4, zIndex: 50, 
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            textAlign: 'left'
          }}>
            {matchedLocs.length > 0 && (
              <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{tt.locations}</div>
                {matchedLocs.map(l => (
                  <div key={l.id} onClick={() => { setSearch(l.name); doSearch(l.name); }} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
                    <span>{l.flag}</span> <span style={{ fontSize: '0.9rem' }}>{l.name}</span>
                  </div>
                ))}
              </div>
            )}

            {matchedCats.length > 0 && (
              <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{tt.categories}</div>
                {matchedCats.map((c: any) => (
                  <div key={c.id} onClick={() => doSearch('', c.id)} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a' }}>
                    <span style={{ fontSize: '0.9rem' }}>{lang === 'es' ? (c.name_es || c.name_pt) : c.name_pt}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '8px 0' }}>
              <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{search ? tt.suggestions : tt.popularHeading}</div>
              {popular.map(p => (
                <div key={p} onClick={() => { setSearch(p); doSearch(p); }} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#334155' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <span style={{ fontSize: '0.9rem' }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="hero-popular-tags" aria-label={tt.popularTagsAria}>
        <span style={{ flexShrink: 0 }}>{t('popular')}</span>
        <div id="popular-tags" style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flexWrap: 'nowrap' }}>
          {(POPULAR_TAGS[lang as 'pt' | 'es'] || POPULAR_TAGS.pt).map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-pill"
              onClick={() => { setSearch(tag); doSearch(tag); }}
            >{tag}</button>
          ))}
        </div>
      </div>
    </>
  );
}
