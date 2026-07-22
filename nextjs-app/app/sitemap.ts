import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase-server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tauzeclass.com.br';
  
  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/listagem`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/institucional`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/planos`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];

  try {
    const supabase = await createClient();
    
    // Fetch all active ads
    const { data: ads } = await supabase
      .from('ads')
      .select('id, updated_at, created_at')
      .eq('status', 'active');

    const adEntries: MetadataRoute.Sitemap = (ads || []).map((ad: any) => ({
      url: `${baseUrl}/anuncio/${ad.id}`,
      lastModified: ad.updated_at || ad.created_at,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...adEntries];
  } catch (err) {
    console.error('Error generating dynamic sitemap:', err);
    // Graceful fallback if database fails
    return staticRoutes;
  }
}
