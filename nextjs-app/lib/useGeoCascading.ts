import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

export function useGeoCascading(pais: string, estado: string, categoria?: string) {
  const sb = getSupabase();
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    let isActive = true;
    let q = sb.from('ads').select('country').neq('country', null);
    if (categoria) q = q.eq('category_id', categoria);
    
    q.then(({ data }) => {
        if (!isActive) return;
        if (data) {
          const unique = Array.from(new Set(data.map(d => d.country)));
          setCountries(unique as string[]);
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
    
    q.then(({ data }) => {
        if (!isActive) return;
        if (data) {
          const unique = Array.from(new Set(data.map(d => d.state).filter(Boolean)));
          setStates(unique.map(s => ({ id: s as string, name: s as string })));
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
    
    q.then(({ data }) => {
        if (!isActive) return;
        if (data) {
          const unique = Array.from(new Set(data.map(d => d.city).filter(Boolean)));
          setCities(unique as string[]);
        }
      });
    return () => { isActive = false; };
  }, [estado, pais, sb]);

  return { countries, states, cities };
}
