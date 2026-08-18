import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { cache } from 'react';

export async function getGeoParams(params: { pais?: string; estado?: string; cidade?: string }) {
  let geoCookie = null;
  try {
    const cookieStore = await cookies();
    const c = cookieStore.get('user_geo_v1');
    if (c) geoCookie = JSON.parse(decodeURIComponent(c.value));
  } catch (error) {
    console.warn('[getGeoParams] Error parsing user_geo_v1 cookie:', error instanceof Error ? error.message : error);
  }

  const hasManualGeo = !!(params.pais || params.estado || params.cidade);
  const pais = params.pais || (!hasManualGeo ? (geoCookie?.pais ?? null) : null);
  const estado = params.estado || (!hasManualGeo ? (geoCookie?.estado ?? null) : null);
  const cidade = params.cidade || (!hasManualGeo ? (geoCookie?.cidade ?? null) : null);

  return {
    pais,
    estado,
    cidade,
    hasManualGeo,
    geoCookie
  };
}

export const getCategoryName = cache(async (categoryId: string) => {
  try {
    const sb = await createClient();
    const { data, error } = await sb.from('categories').select('name_pt').eq('id', categoryId).single();
    if (error) {
      console.error('[getCategoryName] Supabase error fetching category:', error.message);
      return null;
    }
    return data?.name_pt || null;
  } catch (error) {
    console.error('[getCategoryName] Unexpected error:', error);
    return null;
  }
});

export const getAllCategories = cache(async () => {
  try {
    const sb = await createClient();
    const { data, error } = await sb.from('categories').select('*').eq('active', true).order('sort_order');
    if (error) {
      console.error('[getAllCategories] Supabase error fetching categories:', error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('[getAllCategories] Unexpected error:', error);
    return [];
  }
});
