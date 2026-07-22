require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Meilisearch } = require('meilisearch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const meiliClient = new Meilisearch({
  host: process.env.MEILI_HOST,
  apiKey: process.env.MEILI_MASTER_KEY
});

async function syncAds() {
  console.log('🔄 Sincronizando anúncios com o MeiliSearch...');
  
  try {
    // 1. Fetch ads from Supabase
    const { data: ads, error } = await supabase
      .from('ads')
      .select('*, profiles(name, avatar_url), categories(name_pt)')
      .eq('status', 'active');
      
    if (error) throw error;
    
    console.log(`Encontrados ${ads.length} anúncios ativos.`);

    // 2. Prepare documents for Meilisearch
    const documents = ads.map(ad => ({
      id: ad.id,
      title_pt: ad.title_pt,
      description_pt: ad.description_pt,
      price: ad.price,
      category_id: ad.category_id,
      category_name: ad.categories?.name_pt,
      seller_name: ad.profiles?.name,
      country: ad.country,
      state: ad.state,
      city: ad.city,
      featured: ad.featured,
      images: ad.images,
      created_at: ad.created_at
    }));

    // 3. Add to Meilisearch index 'ads'
    const index = meiliClient.index('ads');
    
    // Configura os atributos filtráveis e pesquisáveis
    await index.updateFilterableAttributes(['category_id', 'country', 'state', 'city', 'featured', 'price']);
    await index.updateSearchableAttributes(['title_pt', 'description_pt', 'category_name', 'seller_name', 'city']);
    
    const task = await index.addDocuments(documents, { primaryKey: 'id' });
    console.log(`✅ Documentos enviados para indexação (Task UID: ${task.taskUid})`);

  } catch (err) {
    console.error('❌ Erro na sincronização:', err);
  }
}

syncAds();
