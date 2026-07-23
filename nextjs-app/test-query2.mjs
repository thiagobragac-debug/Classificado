import { createClient } from '@supabase/supabase-js';

const sb = createClient('https://rfzuzuobwuanmbrcthqe.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY');

async function test() {
  const { data, error } = await sb.from('ads')
    .select('id, category_id, country, state, city')
    .eq('category_id', 'cat-bovinos')
    .in('state', ['Minas Gerais', 'MG']);
  
  console.log('Result for IN:', data?.length);
  
  const { data: d2 } = await sb.from('ads')
    .select('id, category_id, country, state, city')
    .eq('category_id', 'cat-bovinos');
    
  console.log('All Bovinos:', d2);
}
test();
