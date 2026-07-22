const fs = require('fs');
const USER_ID = 'a1000000-0000-0000-0000-000000000001';

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

function escapeString(str) {
  return str.replace(/'/g, "''");
}

let sql = "INSERT INTO ads (user_id, category_id, title_pt, title_es, description, price, currency, price_unit_pt, negotiable, country, state, city, location_text, images, tags_pt, status, featured, views_count, expires_at) VALUES \n";

const values = [];

for (let i = 0; i < 40; i++) {
  const template = MOCK_DATA[i % MOCK_DATA.length];
  const geo = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const isFeatured = Math.random() < 0.3;
  
  const titlePt = template.pt + (i > MOCK_DATA.length ? ` - Lote ${i}` : '');
  const titleEs = template.es + (i > MOCK_DATA.length ? ` - Lote ${i}` : '');
  const price = template.price * (0.8 + (Math.random() * 0.4));
  const currency = geo.c === 'Brasil' ? 'BRL' : geo.c === 'Argentina' ? 'ARS' : 'USD';
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const views = Math.floor(Math.random() * 500);

  values.push(`('${USER_ID}', '${template.cat}', '${escapeString(titlePt)}', '${escapeString(titleEs)}', 'Anúncio premium verificado.', ${price.toFixed(2)}, '${currency}', 'unidade', ${isFeatured ? 'true' : 'false'}, '${escapeString(geo.c)}', '${escapeString(geo.st)}', '${escapeString(geo.ci)}', '${escapeString(geo.ci)}, ${escapeString(geo.st)} - ${escapeString(geo.c)}', ARRAY['${template.img}'], ARRAY[]::text[], 'active', ${isFeatured}, ${views}, '${expiresAt}')`);
}

sql += values.join(',\n') + ';';
fs.writeFileSync('seed.sql', sql);
console.log("SQL file generated.");
