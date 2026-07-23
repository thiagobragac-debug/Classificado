import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sb = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await sb.from('ads').select('id, title_pt, category_id, country, state, city')
    .eq('category_id', 'cat-bovinos')
    .in('state', ['Minas Gerais', 'MG']);
  
  console.log('Case-sensitive IN:', data, error);
  
  const { data: d2, error: e2 } = await sb.from('ads').select('id, title_pt, category_id, country, state, city')
    .eq('category_id', 'cat-bovinos')
    .ilike('state', '%Minas%');
  
  console.log('ILIKE:', d2, e2);
}
test();
