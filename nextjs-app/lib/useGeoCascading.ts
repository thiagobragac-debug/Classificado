import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

// GAP CORRIGIDO (reteste do site, 2026-08-25): os dropdowns de localização
// vinham de `new Set(...)` sobre os valores brutos de country/state/city em
// `ads` — como esses campos são texto livre sem normalização de caixa no
// cadastro, "Brasil" e "brasil" (ou "SP"/"sp") apareciam como duas opções
// distintas no mesmo dropdown. Não é um bug de código (o dado no banco está
// mesmo inconsistente), mas o dropdown não precisa expor essa inconsistência
// ao usuário — agrupa por chave normalizada e mantém a primeira grafia vista.
function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return Array.from(seen.values());
}

export function useGeoCascading(pais: string, estado: string, categoria?: string) {
  const sb = getSupabase();
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    let isActive = true;
    let q = sb.from('ads').select('country').neq('country', null);
    if (categoria) q = q.eq('category_id', categoria);
    
    q.then(({ data }: { data: any[] | null }) => {
        if (!isActive) return;
        if (data) {
          setCountries(dedupeCaseInsensitive(data.map(d => d.country)));
        }
      });
    return () => { isActive = false; };
  }, [sb]);

  useEffect(() => {
    if (!pais) {
      setStates([]);
      return;
    }
    let isActive = true;
    let q = sb.from('ads').select('state').eq('country', pais);
    if (categoria) q = q.eq('category_id', categoria);
    
    q.then(({ data }: { data: any[] | null }) => {
        if (!isActive) return;
        if (data) {
          const unique = dedupeCaseInsensitive(data.map(d => d.state).filter(Boolean));
          setStates(unique.map(s => ({ id: s, name: s })));
        }
      });
    return () => { isActive = false; };
  }, [pais, sb]);

  useEffect(() => {
    if (!estado) {
      setCities([]);
      return;
    }
    let isActive = true;
    let q = sb.from('ads').select('city').eq('country', pais).eq('state', estado);
    if (categoria) q = q.eq('category_id', categoria);
    
    q.then(({ data }: { data: any[] | null }) => {
        if (!isActive) return;
        if (data) {
          setCities(dedupeCaseInsensitive(data.map(d => d.city).filter(Boolean)));
        }
      });
    return () => { isActive = false; };
  }, [estado, pais, sb]);

  return { countries, states, cities };
}
