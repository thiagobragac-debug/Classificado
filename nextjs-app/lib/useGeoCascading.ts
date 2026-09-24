import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

// Mapa bidirecional UF <-> nome completo do estado — mesmo conteúdo de
// BR_STATES em lib/services/ads.service.ts (server-only, não pode ser
// importado por este hook client-safe) e das cópias locais em lib/supabase.ts
// e app/(public)/anunciar/_components/StepLocation.tsx. Duplicado aqui de
// propósito, seguindo o mesmo padrão já usado nesses arquivos.
const BR_STATES: Record<string, string> = {
  'Acre': 'AC', 'AC': 'Acre',
  'Alagoas': 'AL', 'AL': 'Alagoas',
  'Amapá': 'AP', 'AP': 'Amapá',
  'Amazonas': 'AM', 'AM': 'Amazonas',
  'Bahia': 'BA', 'BA': 'Bahia',
  'Ceará': 'CE', 'CE': 'Ceará',
  'Distrito Federal': 'DF', 'DF': 'Distrito Federal',
  'Espírito Santo': 'ES', 'ES': 'Espírito Santo',
  'Goiás': 'GO', 'GO': 'Goiás',
  'Maranhão': 'MA', 'MA': 'Maranhão',
  'Mato Grosso': 'MT', 'MT': 'Mato Grosso',
  'Mato Grosso do Sul': 'MS', 'MS': 'Mato Grosso do Sul',
  'Minas Gerais': 'MG', 'MG': 'Minas Gerais',
  'Pará': 'PA', 'PA': 'Pará',
  'Paraíba': 'PB', 'PB': 'Paraíba',
  'Paraná': 'PR', 'PR': 'Paraná',
  'Pernambuco': 'PE', 'PE': 'Pernambuco',
  'Piauí': 'PI', 'PI': 'Piauí',
  'Rio de Janeiro': 'RJ', 'RJ': 'Rio de Janeiro',
  'Rio Grande do Norte': 'RN', 'RN': 'Rio Grande do Norte',
  'Rio Grande do Sul': 'RS', 'RS': 'Rio Grande do Sul',
  'Rondônia': 'RO', 'RO': 'Rondônia',
  'Roraima': 'RR', 'RR': 'Roraima',
  'Santa Catarina': 'SC', 'SC': 'Santa Catarina',
  'São Paulo': 'SP', 'SP': 'São Paulo',
  'Sergipe': 'SE', 'SE': 'Sergipe',
  'Tocantins': 'TO', 'TO': 'Tocantins',
};

/** Expande uma UF de 2 letras (ex. "MG") para o nome completo ("Minas Gerais"); mantém o valor como está caso já seja nome completo ou não seja UF conhecida. */
function expandUf(value: string): string {
  return value.length === 2 ? (BR_STATES[value.toUpperCase()] || value) : value;
}

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
    // BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS,
    // 2026-09-24): select('country') sem limit trazia uma linha por anúncio
    // ativo só pra deduplicar no cliente — trocado por RPC que faz o
    // DISTINCT no Postgres (get_distinct_ad_countries, mesma RLS de sempre).
    sb.rpc('get_distinct_ad_countries', { p_category_id: categoria || null })
      .then(({ data }: { data: { country: string }[] | null }) => {
        if (!isActive) return;
        if (data) {
          setCountries(dedupeCaseInsensitive(data.map(d => d.country)));
        }
      });
    return () => { isActive = false; };
  }, [sb, categoria]);

  useEffect(() => {
    if (!pais) {
      setStates([]);
      return;
    }
    let isActive = true;
    // BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS,
    // 2026-09-24): mesma troca de select('state') sem limit por RPC de
    // DISTINCT no Postgres — ver get_distinct_ad_countries acima.
    sb.rpc('get_distinct_ad_states', { p_country: pais, p_category_id: categoria || null })
      .then(({ data }: { data: { state: string }[] | null }) => {
        if (!isActive) return;
        if (data) {
          // BUG CORRIGIDO (achado ao vivo testando o filtro de localização):
          // um anúncio cadastrado com a UF ("MG") em vez do nome completo
          // ("Minas Gerais") fazia essa opção nunca aparecer no dropdown com
          // o valor que a geolocalização (e o resto do app) usa — o <select>
          // ficava sem nenhuma <option> batendo com o estado já aplicado no
          // filtro (visível na URL e no chip "Perto de você"), mostrando o
          // placeholder "Todos os Estados" mesmo com o filtro ativo de
          // verdade. getAdsListagem (ads.service.ts) já tratava essa mesma
          // ambiguidade UF/nome completo pro RESULTADO da busca — faltava só
          // aqui, na lista de opções do dropdown.
          const expanded = data.map(d => d.state).filter(Boolean).map(expandUf);
          const unique = dedupeCaseInsensitive(expanded);
          setStates(unique.map(s => ({ id: s, name: s })));
        }
      });
    return () => { isActive = false; };
  }, [pais, sb, categoria]);

  useEffect(() => {
    if (!estado) {
      setCities([]);
      return;
    }
    let isActive = true;
    // BUG CORRIGIDO (mesmo achado do dropdown de estados acima): `estado`
    // aqui é sempre o nome completo (é o que geolocalização e URL usam), mas
    // `state` na tabela `ads` pode estar salvo como UF (ex. "MG") — um
    // `.eq('state', estado)` exato nunca batia, deixando o dropdown de
    // cidade sempre vazio pra qualquer estado cujos anúncios usem a sigla.
    // Mesma dupla checagem (nome completo OU sigla) já usada em
    // getAdsListagem (ads.service.ts) pro resultado da busca em si.
    const altState = BR_STATES[estado];
    // BUG CORRIGIDO (achado ao vivo, varredura de segurança/performance/RLS,
    // 2026-09-24): mesma troca de select('city') sem limit por RPC de
    // DISTINCT no Postgres — ver get_distinct_ad_countries acima.
    sb.rpc('get_distinct_ad_cities', {
      p_country: pais,
      p_states: altState ? [estado, altState] : [estado],
      p_category_id: categoria || null,
    }).then(({ data }: { data: { city: string }[] | null }) => {
        if (!isActive) return;
        if (data) {
          setCities(dedupeCaseInsensitive(data.map(d => d.city).filter(Boolean)));
        }
      });
    return () => { isActive = false; };
  }, [estado, pais, sb, categoria]);

  return { countries, states, cities };
}
