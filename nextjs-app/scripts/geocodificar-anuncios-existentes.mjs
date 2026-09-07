// Preenche lat/lng dos anúncios que já existem (todos nasceram sem
// coordenada, antes da migration 20260907211503_add_lat_lng_ads.sql).
// Geocodifica cada combinação ÚNICA de (city, state, country) uma vez só
// via Nominatim (não um anúncio de cada vez) e atualiza todos os anúncios
// daquela combinação de uma vez.
//
// Respeita o limite de 1 pedido/segundo do Nominatim — rode isto você
// mesmo quando quiser, fora de uma sessão comigo (pode levar alguns
// minutos dependendo de quantas cidades distintas existirem).
//
// Uso:
//   node scripts/geocodificar-anuncios-existentes.mjs            (dry-run, so mostra o que faria)
//   node scripts/geocodificar-anuncios-existentes.mjs --aplicar  (aplica de verdade)

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const APLICAR = process.argv.includes('--aplicar');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const USER_AGENT = 'TauzeClassGeocodeBot/1.0 (contato: thiago.costa@atletico.com.br; uso: preencher coordenadas de anuncios ja existentes)';

async function geocode(city, state, country) {
  const query = [city, state, country].filter(Boolean).join(', ');
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.[0]) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function main() {
  console.log(APLICAR ? 'MODO: aplicando de verdade' : 'MODO: dry-run (nada será salvo — use --aplicar pra gravar)');

  // BUG CORRIGIDO (achado ao rodar): sem paginação, o PostgREST corta em
  // 1000 linhas por padrão — com poucas centenas de combinações distintas
  // de cidade/estado/país, é bem provável que todas já apareçam dentro das
  // primeiras 1000 mesmo assim (o UPDATE final não tem LIMIT, então
  // atualizaria as linhas de fora da amostra do mesmo jeito), mas pagina
  // de verdade aqui pra não depender disso.
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await admin
      .from('ads')
      .select('city, state, country')
      .is('lat', null)
      .not('city', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('Erro ao buscar anúncios:', error.message); process.exit(1); }
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const combos = new Map();
  for (const r of rows) {
    const key = `${r.city}|||${r.state}|||${r.country}`;
    if (!combos.has(key)) combos.set(key, { city: r.city, state: r.state, country: r.country });
  }

  console.log(`Anúncios sem coordenada: ${rows.length} | Combinações distintas de cidade/estado/país: ${combos.size}`);
  console.log(`Tempo estimado: ~${Math.ceil(combos.size * 1.1 / 60)} minuto(s) (1 pedido/segundo pro Nominatim)\n`);

  let geocoded = 0, failed = 0, updated = 0;

  for (const { city, state, country } of combos.values()) {
    let coords = null;
    try {
      coords = await geocode(city, state, country);
    } catch (e) {
      console.log(`  ERRO de rede: ${city}, ${state}, ${country} — ${e.message}`);
    }

    if (!coords) {
      failed++;
      console.log(`  não encontrado: ${city}, ${state}, ${country}`);
    } else {
      geocoded++;
      console.log(`  ${city}, ${state}, ${country} -> ${coords.lat}, ${coords.lng}`);
      if (APLICAR) {
        const { error: updErr, count } = await admin
          .from('ads')
          .update({ lat: coords.lat, lng: coords.lng }, { count: 'exact' })
          .eq('city', city).eq('state', state).eq('country', country)
          .is('lat', null);
        if (updErr) console.log(`    erro ao atualizar: ${updErr.message}`);
        else updated += count || 0;
      }
    }

    // Respeita o 1 pedido/segundo do Nominatim.
    await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`\nDONE. Geocodificadas: ${geocoded} | Não encontradas: ${failed}${APLICAR ? ` | Anúncios atualizados: ${updated}` : ' | (dry-run, nada foi salvo)'}`);
}

main();
