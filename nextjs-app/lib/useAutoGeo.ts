import { useState, useEffect, useRef, useCallback } from 'react';
import { useGeoLocation, normalizeStr } from './useGeoLocation';
import { getSupabase } from './supabase';

const TRANSLATIONS = {
  pt: {
    nearYou: (place: string) => `Perto de você — ${place}`,
    yourState: (place: string) => `Seu estado — ${place}`,
    yourCountry: (place: string) => `Seu país — ${place}`,
  },
  es: {
    nearYou: (place: string) => `Cerca de ti — ${place}`,
    yourState: (place: string) => `Tu provincia — ${place}`,
    yourCountry: (place: string) => `Tu país — ${place}`,
  }
};

export function useAutoGeo(
  pais: string, setPais: (v: string) => void,
  estado: string, setEstado: (v: string) => void,
  cidade: string, setCidade: (v: string) => void,
  applyFilters: (overrides: any) => void,
  initialGeo: any,
  searchParams: URLSearchParams,
  disabled?: boolean,
  lang?: string
) {
  const T = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const { geo, loading: geoLoading } = useGeoLocation();
  const geoAppliedRef = useRef(false);
  // Guarda exatamente o que o auto-geo aplicou, pra distinguir de uma
  // mudança manual do usuário (ver efeito de sincronização abaixo).
  const autoAppliedRef = useRef<{ pais: string; estado: string; cidade: string } | null>(null);

  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [geoLevel, setGeoLevel] = useState<'city'|'state'|'country'|null>(null);
  const [geoReady, setGeoReady] = useState(false);

  const hasSpecificManualLoc = !!(searchParams.get('pais') || searchParams.get('estado') || searchParams.get('cidade'));

  useEffect(() => {
    // Ex: página de um vendedor específico — a listagem já é escopada por
    // esse vendedor, geolocalização automática do visitante não deveria se
    // aplicar (ver comentário em AdsBrowser.tsx).
    if (disabled) {
      setGeoReady(true);
      return;
    }
    if (hasSpecificManualLoc) {
      setGeoReady(true);
      return;
    }
    if (!geoLoading && !geo && !initialGeo) {
      setGeoReady(true);
      return;
    }
    if (geoAppliedRef.current) return;

    if (initialGeo && (initialGeo.cidade || initialGeo.estado || initialGeo.pais)) {
      geoAppliedRef.current = true;
      autoAppliedRef.current = { pais: initialGeo.pais || '', estado: initialGeo.estado || '', cidade: initialGeo.cidade || '' };
      if (initialGeo.cidade) {
        setGeoLabel(T.nearYou(initialGeo.cidade));
        setGeoLevel('city');
      } else if (initialGeo.estado) {
        setGeoLabel(T.yourState(initialGeo.estado));
        setGeoLevel('state');
      } else if (initialGeo.pais) {
        setGeoLabel(T.yourCountry(initialGeo.pais));
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

      autoAppliedRef.current = { pais: newPais, estado: newEstado, cidade: newCidade };
      if (newPais) setPais(newPais);
      if (newEstado) setEstado(newEstado);
      if (newCidade) setCidade(newCidade);

      if (newCidade) {
        setGeoLabel(T.nearYou(newCidade));
        setGeoLevel('city');
      } else if (newEstado) {
        setGeoLabel(T.yourState(newEstado));
        setGeoLevel('state');
      } else {
        setGeoLabel(T.yourCountry(newPais));
        setGeoLevel('country');
      }

      applyFilters({ pais: newPais, estado: newEstado, cidade: newCidade });
      setGeoReady(true);
    };

    doGeoFill();

  }, [geo, geoLoading, hasSpecificManualLoc, initialGeo, setPais, setEstado, setCidade, applyFilters, disabled, T]);

  // BUG CORRIGIDO (reteste do site, 2026-08-25): o chip "Perto de você — X"
  // ficava preso no valor autodetectado mesmo depois do usuário trocar
  // manualmente país/estado/cidade nos selects do filtro de Localização —
  // a URL e os resultados ficavam certos, só o chip visível é que mentia.
  // Sempre que pais/estado/cidade atuais não baterem mais com o que o
  // auto-geo de fato aplicou, o rótulo deixa de ser válido — limpamos aqui
  // pra getActiveFilters() (ActiveFiltersList.tsx) cair no branch de
  // localização MANUAL (que já existe e mostra o valor certo).
  useEffect(() => {
    if (!geoLabel || !autoAppliedRef.current) return;
    const auto = autoAppliedRef.current;
    if (pais !== auto.pais || estado !== auto.estado || cidade !== auto.cidade) {
      setGeoLabel(null);
      setGeoLevel(null);
      autoAppliedRef.current = null;
    }
  }, [pais, estado, cidade, geoLabel]);

  const advanceGeoLevel = useCallback(() => {
    if (geoLevel === 'city') {
      setCidade(''); setGeoLevel('state');
      setGeoLabel(estado ? T.yourState(estado) : null);
      // Mantém a ref em sincronia com o novo nível — senão o efeito de
      // sincronização acima ia achar que isto também foi uma mudança
      // "manual" e apagar o rótulo "Seu estado — X" que acabamos de setar.
      autoAppliedRef.current = { pais, estado, cidade: '' };
      applyFilters({ cidade: '' });
    }
    else if (geoLevel === 'state') {
      setEstado(''); setCidade(''); setGeoLevel('country');
      setGeoLabel(pais ? T.yourCountry(pais) : null);
      autoAppliedRef.current = { pais, estado: '', cidade: '' };
      applyFilters({ estado: '', cidade: '' });
    }
    else if (geoLevel === 'country') {
      setPais(''); setEstado(''); setCidade('');
      setGeoLevel(null); setGeoLabel(null);
      autoAppliedRef.current = null;
      // Delete the geo cookies so the server won't re-inject geo from cookie on next request
      try {
        document.cookie = 'user_geo_v1=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        localStorage.removeItem('user_loc_v8');
      } catch { /* ignore */ }
      applyFilters({ pais: '', estado: '', cidade: '' });
    }
  }, [geoLevel, pais, estado, setPais, setEstado, setCidade, applyFilters, T]);

  return { geoLabel, advanceGeoLevel, geoReady };
}
