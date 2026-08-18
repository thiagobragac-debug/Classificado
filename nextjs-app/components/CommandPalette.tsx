'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useCategories } from '@/lib/categories-context';
import { useLang } from '@/lib/lang-context';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { lang, t } = useLang();
  const categories = useCategories();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      setSearch('');
      document.body.style.overflow = '';
    }
  }, [open]);

  // Focus Trap Logic
  useEffect(() => {
    if (!open) return;
    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!modalRef.current) return;
      
      const focusableElements = modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    
    window.addEventListener('keydown', handleFocusTrap);
    return () => window.removeEventListener('keydown', handleFocusTrap);
  }, [open]);

  const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(search);

  const matchedCats = q ? categories.filter(c => norm(lang === 'es' ? (c.name_es || c.name_pt) : c.name_pt).includes(q)) : categories.slice(0, 5);

  const navigateTo = (url: string) => {
    setOpen(false);
    router.push(url);
  };

  const executeSearch = () => {
    if (search.trim()) {
      navigateTo(`/listagem?busca=${encodeURIComponent(search)}`);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="cmd-backdrop" onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '10vh'
        }}>
          <motion.div 
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="cmd-modal" 
            onClick={e => e.stopPropagation()}
            style={{
              width: '90%', maxWidth: '600px', background: 'white',
              borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden', border: '1px solid var(--clr-border)'
            }}
          >
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <svg width="20" height="20" fill="none" stroke="var(--clr-text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input 
                ref={inputRef}
                type="text" 
                placeholder="Buscar anúncios, categorias..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && executeSearch()}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: '1.1rem', color: 'var(--clr-text)'
                }}
              />
              <div style={{ fontSize: '0.75rem', background: 'var(--clr-bg-alt)', padding: '4px 8px', borderRadius: '4px', color: 'var(--clr-text-muted)', fontWeight: 600 }}>ESC</div>
            </div>

            <div style={{ padding: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
              {search && (
                <div 
                  onClick={executeSearch}
                  style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--clr-bg-alt)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <div>
                    <div style={{ fontWeight: 600 }}>Buscar por "{search}"</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>Ver todos os resultados</div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clr-text-light)', textTransform: 'uppercase', padding: '1rem 1rem 0.5rem', letterSpacing: '0.05em' }}>
                Categorias {search ? 'Encontradas' : 'Populares'}
              </div>
              
              {matchedCats.map(cat => (
                <div 
                  key={cat.id} 
                  onClick={() => navigateTo(`/listagem?cat=${cat.id}`)}
                  style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--clr-bg-alt)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontSize: '1.5rem' }}>{cat.icon}</div>
                  <div style={{ fontWeight: 500, color: 'var(--clr-text)' }}>{lang === 'es' ? (cat.name_es || cat.name_pt) : cat.name_pt}</div>
                </div>
              ))}

              {!search && (
                <>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clr-text-light)', textTransform: 'uppercase', padding: '1rem 1rem 0.5rem', letterSpacing: '0.05em' }}>
                    Acesso Rápido
                  </div>
                  <div 
                    onClick={() => navigateTo('/dashboard')}
                    style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--clr-bg-alt)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <div style={{ fontWeight: 500, color: 'var(--clr-text)' }}>Meu Painel</div>
                  </div>
                  <div 
                    onClick={() => navigateTo('/novo-anuncio')}
                    style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--clr-bg-alt)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg width="18" height="18" fill="none" stroke="var(--clr-primary)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <div style={{ fontWeight: 600, color: 'var(--clr-primary)' }}>Criar Anúncio</div>
                  </div>
                </>
              )}
            </div>
            <div style={{ padding: '0.75rem 1.5rem', background: 'var(--clr-bg-alt)', borderTop: '1px solid var(--clr-border)', fontSize: '0.8rem', color: 'var(--clr-text-muted)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><kbd style={{ background: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--clr-border)' }}>↑↓</kbd> Navegar</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><kbd style={{ background: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--clr-border)' }}>Enter</kbd> Selecionar</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
