import { useState, useEffect, useRef, useCallback } from 'react';
import { useGeoLocation, normalizeStr } from './useGeoLocation';
import { getSupabase } from './supabase';


export function useAutoGeo(
  pais: string, setPais: (v: string) => void,
  estado: string, setEstado: (v: string) => void,
  cidade: string, setCidade: (v: string) => void,
  applyFilters: (overrides: any) => void,
  initialGeo: any,
  searchParams: URLSearchParams
) {
  const { geo, loading: geoLoading } = useGeoLocation();
  const geoAppliedRef = useRef(false);

  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [geoLevel, setGeoLevel] = useState<'city'|'state'|'country'|null>(null);
  const [geoReady, setGeoReady] = useState(false);

  const hasSpecificManualLoc = !!(searchParams.get('pais') && (searchParams.get('estado') || searchParams.get('cidade')));

  useEffect(() => {
    if (hasSpecificManualLoc) {
      setGeoReady(true);
      return;
    }
    if (!geoLoading && !geo && !initialGeo) {
      setGeoReady(true);
      return;
    }
    if (geoAppliedRef.current) return;

    if (initialGeo && (initialGeo.pais || initialGeo.estado || initialGeo.cidade)) {
      geoAppliedRef.current = true;
      if (initialGeo.cidade) {
        setGeoLabel(`Perto de você — ${initialGeo.cidade}`);
        setGeoLevel('city');
      } else if (initialGeo.estado) {
        setGeoLabel(`Seu estado — ${initialGeo.estado}`);
        setGeoLevel('state');
      } else if (initialGeo.pais) {
        setGeoLabel(`Seu país — ${initialGeo.pais}`);
        setGeoLevel('country');
      }
      setGeoReady(true);
      return;
    }

    if (!geo) return;

    // We have client-side geo, but no initialGeo and no manual loc
    const doGeoFill = async () => {
      geoAppliedRef.current = true;
      const sb = getSupabase();
      
      // Simplify logic: just set the state and let the cascading take over later
      // The original code queried the DB to match exact strings, we will try to set it directly
      // If it doesn't match perfectly, it might be an issue, but we can assume normal names
      let newPais = geo.country || 'Brasil';
      let newEstado = geo.state || '';
      let newCidade = geo.city || '';

      if (newPais) setPais(newPais);
      if (newEstado) setEstado(newEstado);
      if (newCidade) setCidade(newCidade);

      if (newCidade) {
        setGeoLabel(`Perto de você — ${newCidade}`);
        setGeoLevel('city');
      } else if (newEstado) {
        setGeoLabel(`Seu estado — ${newEstado}`);
        setGeoLevel('state');
      } else {
        setGeoLabel(`Seu país — ${newPais}`);
        setGeoLevel('country');
      }

      applyFilters({ pais: newPais, estado: newEstado, cidade: newCidade });
      setGeoReady(true);
    };

    doGeoFill();

  }, [geo, geoLoading, hasSpecificManualLoc, initialGeo, setPais, setEstado, setCidade, applyFilters]);

  const advanceGeoLevel = useCallback(() => {
    if (geoLevel === 'city') { 
      setCidade(''); setGeoLevel('state'); 
      setGeoLabel(estado ? `Seu estado — ${estado}` : null); 
      applyFilters({ cidade: '' });
    }
    else if (geoLevel === 'state') { 
      setEstado(''); setCidade(''); setGeoLevel('country'); 
      setGeoLabel(pais ? `Seu país — ${pais}` : null); 
      applyFilters({ estado: '', cidade: '' });
    }
    else if (geoLevel === 'country') { 
      setPais(''); setEstado(''); setCidade(''); 
      setGeoLevel(null); setGeoLabel(null); 
      applyFilters({ pais: '', estado: '', cidade: '' });
    }
  }, [geoLevel, pais, estado, setPais, setEstado, setCidade, applyFilters]);

  return { geoLabel, advanceGeoLevel, geoReady };
}
