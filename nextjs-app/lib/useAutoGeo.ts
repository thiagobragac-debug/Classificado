import { useState, useEffect, useRef, useCallback } from 'react';
import { useGeoLocation, normalizeStr, clearGeoCache } from './useGeoLocation';
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
  // BUG CORRIGIDO (propagação de idioma na geolocalização): lang não era repassado pro hook.
  const { geo, loading: geoLoading } = useGeoLocation(lang);
  const geoAppliedRef = useRef(false);
  // Guarda exatamente o que o auto-geo aplicou, pra distinguir de uma
  // mudança manual do usuário (ver efeito de sincronização abaixo).
  const autoAppliedRef = useRef<{ pais: string; estado: string; cidade: string } | null>(null);
  // BUG CORRIGIDO (revalidação do zero da auditoria de i18n): doGeoFill e
  // advanceGeoLevel setam autoAppliedRef.current com os valores NOVOS de
  // forma síncrona, mas a atualização real de pais/estado/cidade (props,
  // vindos de useSearchParams() via applyFilters -> router.push) é
  // assíncrona. Na janela entre as duas coisas, o efeito de sincronização
  // abaixo via pais/estado/cidade (ainda com os valores ANTIGOS) diferindo
  // de autoAppliedRef.current (já com os valores NOVOS) e concluía —
  // errado — que o usuário tinha mudado algo manualmente, apagando
  // geoLabel/autoAppliedRef ANTES da URL sequer terminar de atualizar. Como
  // geoAppliedRef.current já ficava true, o efeito principal nunca rodava
  // de novo pra re-setar o rótulo — o texto traduzido "Perto de você — X"/
  // "Cerca de ti — X" nunca chegava a aparecer de verdade, mesmo com o
  // filtro aplicado corretamente. Esta ref marca "acabei de aplicar, ainda
  // esperando a URL confirmar" — enquanto pendente, o efeito de
  // sincronização só CONFIRMA (limpa a pendência) quando os props baterem
  // com o que foi aplicado, sem nunca tratar o descompasso transitório como
  // mudança manual.
  const autoApplyPendingRef = useRef(false);
  // BUG CORRIGIDO (revisão do processo de filtro cascata, 2026-08-27): ao
  // limpar todo o filtro de localização (seja pelo último passo da cascata
  // "Remover filtro de <país>", seja por "Limpar Todos"), a URL fica sem
  // pais/estado/cidade — mas `geo` (detectado via IP/GPS em useGeoLocation,
  // guardado em memória desde o mount) continua preenchido, e o efeito
  // abaixo interpretava a ausência de filtro manual como "usuário ainda não
  // escolheu localização" e reaplicava a mesma geo automaticamente. Este
  // ref marca que o usuário limpou intencionalmente, suprimindo a
  // reaplicação pro resto do ciclo de vida deste componente.
  const suppressedRef = useRef(false);

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
    if (suppressedRef.current) {
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
      autoApplyPendingRef.current = true;
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
    const matches = pais === auto.pais && estado === auto.estado && cidade === auto.cidade;
    if (autoApplyPendingRef.current) {
      // Ainda esperando a navegação assíncrona (applyFilters/router.push)
      // atualizar pais/estado/cidade pra bater com o que acabamos de
      // aplicar — não é uma mudança manual do usuário, só a URL ainda não
      // alcançou o estado. Só confirma (encerra a pendência) quando bater;
      // enquanto não bate, não trata como mudança manual nem limpa nada.
      if (matches) autoApplyPendingRef.current = false;
      return;
    }
    if (!matches) {
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
      autoApplyPendingRef.current = true;
      applyFilters({ cidade: '' });
    }
    else if (geoLevel === 'state') {
      setEstado(''); setCidade(''); setGeoLevel('country');
      setGeoLabel(pais ? T.yourCountry(pais) : null);
      autoAppliedRef.current = { pais, estado: '', cidade: '' };
      autoApplyPendingRef.current = true;
      applyFilters({ estado: '', cidade: '' });
    }
    else if (geoLevel === 'country') {
      setPais(''); setEstado(''); setCidade('');
      setGeoLevel(null); setGeoLabel(null);
      autoAppliedRef.current = null;
      suppressedRef.current = true;
      // Delete the geo cookies so the server won't re-inject geo from cookie on next request
      try {
        document.cookie = 'user_geo_v1=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        clearGeoCache();
      } catch { /* ignore */ }
      applyFilters({ pais: '', estado: '', cidade: '' });
    }
  }, [geoLevel, pais, estado, setPais, setEstado, setCidade, applyFilters, T]);

  const suppressAutoGeo = useCallback(() => { suppressedRef.current = true; }, []);

  return { geoLabel, advanceGeoLevel, geoReady, suppressAutoGeo };
}
