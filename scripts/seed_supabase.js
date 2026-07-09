const fs = require('fs');

const SUPABASE_URL = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

const MOCK_DATA = [
  // Bovinos
  { cat: 'cat-bovinos', pt: 'Lote 100 Bezerros Nelore', es: 'Lote 100 Terneros Nelore', price: 150000, img: 'https://images.unsplash.com/photo-1545468800-85cc9bc6ecf7' },
  { cat: 'cat-bovinos', pt: 'Touro Angus Reprodutor PO', es: 'Toro Angus Reproductor PO', price: 35000, img: 'https://images.unsplash.com/photo-1596733430284-f743727546a6' },
  { cat: 'cat-bovinos', pt: 'Matrizes Brahman Prenhes', es: 'Matrices Brahman Preñadas', price: 120000, img: 'https://images.unsplash.com/photo-1516244760086-5381d643ee1e' },
  // Equinos
  { cat: 'cat-equinos', pt: 'Cavalo Quarto de Milha Puro', es: 'Caballo Cuarto de Milla', price: 80000, img: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a' },
  { cat: 'cat-equinos', pt: 'Égua Crioula Domada', es: 'Yegua Criolla Domada', price: 45000, img: 'https://images.unsplash.com/photo-1534067258384-5a3d463b2046' },
  // Máquinas
  { cat: 'cat-maquinas', pt: 'Trator John Deere 7J 2021', es: 'Tractor John Deere 7J 2021', price: 850000, img: 'https://images.unsplash.com/photo-1605634676648-52b22079f53e' },
  { cat: 'cat-maquinas', pt: 'Colheitadeira Case Axial', es: 'Cosechadora Case Axial', price: 1250000, img: 'https://images.unsplash.com/photo-1589714850777-6ef70d24c08e' },
  // Imóveis
  { cat: 'cat-imoveis', pt: 'Fazenda 500 Hectares Pronta', es: 'Estancia 500 Hectáreas', price: 5000000, img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef' },
];

const COUNTRIES = [
  { c: 'Brasil', st: 'MT', ci: 'Cuiabá' },
  { c: 'Brasil', st: 'MG', ci: 'Uberaba' },
  { c: 'Argentina', st: 'Buenos Aires', ci: 'Pergamino' },
  { c: 'Paraguai', st: 'Boquerón', ci: 'Filadelfia' },
  { c: 'Uruguai', st: 'Soriano', ci: 'Mercedes' }
];

async function seed() {
  console.log("🚀 Iniciando geração de anúncios reais (Seed com RLS Auth)...");
  
  // 1. Criar um usuário de teste para inserir os dados e passar no RLS
  const email = `test.seed.${Date.now()}@tauze.com`;
  const password = 'Password123!';
  
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  
  const authData = await authRes.json();
  if (authData.error || !authData.user) {
    console.error("Falha ao criar usuário de teste:", authData.error || authData);
    return;
  }
  
  const USER_ID = authData.user.id;
  const ACCESS_TOKEN = authData.session.access_token;
  
  console.log(`✅ Usuário criado: ${USER_ID}`);
  
  const headers = {
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  const adsToInsert = [];
  
  for (let i = 0; i < 40; i++) {
    const template = MOCK_DATA[i % MOCK_DATA.length];
    const geo = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    const isFeatured = Math.random() < 0.3;
    
    adsToInsert.push({
      user_id: USER_ID,
      category_id: template.cat,
      title_pt: template.pt + (i > MOCK_DATA.length ? ` - Lote ${i}` : ''),
      title_es: template.es + (i > MOCK_DATA.length ? ` - Lote ${i}` : ''),
      description: 'Anúncio premium verificado e inspecionado pela equipe técnica.',
      price: template.price * (0.8 + (Math.random() * 0.4)),
      currency: geo.c === 'Brasil' ? 'BRL' : geo.c === 'Argentina' ? 'ARS' : 'USD',
      price_unit_pt: 'unidade',
      negotiable: Math.random() > 0.5,
      country: geo.c,
      state: geo.st,
      city: geo.ci,
      location_text: `${geo.ci}, ${geo.st} - ${geo.c}`,
      images: [template.img],
      tags_pt: [],
      status: 'active',
      featured: isFeatured,
      views_count: Math.floor(Math.random() * 500),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ads`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(adsToInsert)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Erro ao inserir anúncios:", err);
    } else {
      console.log(`✅ Sucesso! Inseridos ${adsToInsert.length} anúncios no banco.`);
      console.log(`Desses, cerca de ${adsToInsert.filter(a => a.featured).length} são Monetizados (Destaques).`);
    }
  } catch (e) {
    console.error("Erro fatal na requisição:", e);
  }
}

seed();
