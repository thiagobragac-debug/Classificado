const fs = require('fs');
let sb = fs.readFileSync('c:/classificado/js/supabase.js', 'utf8');

const injection = `
/* ── PUBLIC SELLER PROFILE ────────────────────────────────────────── */
async function getSellerProfile(userId) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, name, display_name, avatar_url, verified, phone_whatsapp, country, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getSellerAds(userId) {
  const { data, error } = await getSupabase()
    .from('ads')
    .select('id, title_pt, title_es, price, currency, category_id, location, status, images, is_featured, created_at, categories(name_pt, name_es, icon)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

window.getSellerProfile = getSellerProfile;
window.getSellerAds = getSellerAds;
`;

if (!sb.includes('getSellerProfile')) {
  sb = sb.replace('window.getAdById = getAdById;', 'window.getAdById = getAdById;\n' + injection);
  fs.writeFileSync('c:/classificado/js/supabase.js', sb, 'utf8');
}
