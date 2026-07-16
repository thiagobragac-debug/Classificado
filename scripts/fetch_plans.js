require('dotenv').config({ path: require('path').join(__dirname, '../api/.env') });
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('❌  SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidos em api/.env');
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
sb.from('plans').select('*').then(x => console.log(JSON.stringify(x.data, null, 2)));
