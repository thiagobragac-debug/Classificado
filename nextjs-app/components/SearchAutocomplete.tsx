'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/lang-context';
import { CATEGORIES } from '@/lib/constants';

const POPULAR = {
  pt: ['nelore', 'angus', 'trator', 'fazenda', 'soja', 'milho', 'garrote', 'novilha', 'cavalo', 'suíno'],
  es: ['nelore', 'angus', 'tractor', 'estancia', 'soja', 'maíz', 'novillo', 'vaquillona', 'caballo', 'porcino'],
};

const LOCATIONS = [
  { name: 'Brasil', flag: '🇧🇷', id: 'BR' },
  { name: 'Paraguai', flag: '🇵🇾', id: 'PY' },
  { name: 'Argentina', flag: '🇦🇷', id: 'AR' },
  { name: 'Uruguai', flag: '🇺🇾', id: 'UY' },
  { name: 'Mato Grosso', flag: '📍', id: 'MT' },
  { name: 'Goiás', flag: '📍', id: 'GO' },
  { name: 'Mato Grosso do Sul', flag: '📍', id: 'MS' },
  { name: 'São Paulo', flag: '📍', id: 'SP' },
];

export function SearchAutocomplete() {
  const router = useRouter();
  const { lang, t } = useLang();
  
  const [query, setQuery] = useState('');
  const [show, setShow] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (term: string, catId?: string) => {
    setShow(false);
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (catId) params.set('cat', catId);
    router.push(`/listagem?${params.toString()}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      handleSearch(query.trim());
    }
  };

  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(query);

  const matchedCats = q ? CATEGORIES.filter(c => norm(lang === 'es' ? c.name_es : c.name_pt).includes(q)) : [];
  const matchedLocs = q ? LOCATIONS.filter(l => norm(l.name).includes(q)) : [];
  const popular = (POPULAR[lang as 'pt' | 'es'] || POPULAR.pt).filter(p => p.includes(q) && p !== q).slice(0, 4);

  return (
    <div ref={wrapperRef} className="search-bar" style={{ position: 'relative' }}>
      <form onSubmit={onSubmit} style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
        <input 
          type="search" 
          placeholder={t('search_placeholder') || 'Buscar animais, máquinas...'} 
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setShow(true)}
          style={{ 
            flex: 1, padding: '10px 16px', border: '1px solid #e2e8f0', 
            borderRadius: '8px 0 0 8px', outline: 'none' 
          }} 
        />
        <button 
          type="submit" 
          style={{ 
            padding: '10px 20px', background: '#16A34A', color: 'white', 
            border: 'none', borderRadius: '0 8px 8px 0', cursor: 'pointer' 
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      </form>

      {show && (query.length > 1 || popular.length > 0) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, 
          background: 'white', border: '1px solid #e2e8f0', 
          borderRadius: 8, marginTop: 4, zIndex: 50, 
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
        }}>
          {matchedLocs.length > 0 && (
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Locais</div>
              {matchedLocs.map(l => (
                <div key={l.id} onClick={() => handleSearch(l.name)} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} className="hover-bg-slate">
                  <span>{l.flag}</span> <span style={{ fontSize: '0.9rem' }}>{l.name}</span>
                </div>
              ))}
            </div>
          )}

          {matchedCats.length > 0 && (
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Categorias</div>
              {matchedCats.map(c => (
                <div key={c.id} onClick={() => handleSearch('', c.id)} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} className="hover-bg-slate">
                  <span style={{ fontSize: '0.9rem', color: '#0f172a' }}>{lang === 'es' ? c.name_es : c.name_pt}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '8px 0' }}>
            <div style={{ padding: '4px 16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{query ? 'Sugestões' : 'Populares'}</div>
            {popular.map(p => (
              <div key={p} onClick={() => handleSearch(p)} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} className="hover-bg-slate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span style={{ fontSize: '0.9rem', color: '#334155' }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
