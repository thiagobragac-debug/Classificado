const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

async function test() {
  const sellerId = 'a1000000-0000-0000-0000-000000000002';
  const { data, error } = await sb.from('ads').select('*').eq('user_id', sellerId);
  console.log('Ads for seller:', data);
  if (error) console.error('Error:', error);
}

test();
