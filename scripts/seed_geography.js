const { createClient } = require('@supabase/supabase-js');
const { Country, State, City } = require('country-state-city');

const SUPABASE_URL = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ISO codes for South American countries
const saCountries = ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'];

async function seed() {
  console.log('Starting seed process for South America...');

  for (const isoCode of saCountries) {
    const c = Country.getCountryByCode(isoCode);
    if (!c) continue;

    console.log(`Processing ${c.name} (${isoCode})...`);

    // Insert country
    const { data: countryData, error: countryError } = await supabase
      .from('paises')
      .upsert([{ nome: c.name, sigla: isoCode }], { onConflict: 'sigla' })
      .select('id')
      .single();

    if (countryError) {
      console.error(`Error inserting country ${c.name}:`, countryError);
      continue;
    }
    const paisId = countryData.id;

    // Get states
    const states = State.getStatesOfCountry(isoCode);
    
    for (const s of states) {
      const { data: stateData, error: stateError } = await supabase
        .from('estados')
        .upsert([{ pais_id: paisId, nome: s.name, sigla: s.isoCode }], { onConflict: 'pais_id, sigla' })
        .select('id')
        .single();

      if (stateError) {
        console.error(`Error inserting state ${s.name}:`, stateError);
        continue;
      }
      
      const estadoId = stateData.id;

      // Get cities
      const cities = City.getCitiesOfState(isoCode, s.isoCode);
      if (cities.length === 0) continue;

      // Insert cities in batches of 500
      const batchSize = 500;
      for (let i = 0; i < cities.length; i += batchSize) {
        const batch = cities.slice(i, i + batchSize).map(city => ({
          estado_id: estadoId,
          nome: city.name
        }));
        
        const { error: cityError } = await supabase
          .from('cidades')
          .insert(batch);
          
        if (cityError) {
          console.error(`Error inserting cities for ${s.name}:`, cityError);
        }
      }
    }
  }

  console.log('Seed completed.');
}

seed().catch(console.error);
