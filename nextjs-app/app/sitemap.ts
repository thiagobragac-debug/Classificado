import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

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

    // Fetch upcoming/live events (auction_events) and feiras (eventos) —
    // /eventos/[id] resolve ambas as tabelas (ver app/(public)/eventos/[id]/page.tsx),
    // então o sitemap precisa cobrir as duas. Nenhuma das duas tem coluna
    // `updated_at`, só `created_at`.
    const { data: auctionEvents } = await supabase
      .from('auction_events')
      .select('id, created_at')
      .neq('status', 'draft');

    const { data: eventos } = await supabase
      .from('eventos')
      .select('id, created_at');

    const eventEntries: MetadataRoute.Sitemap = [
      ...(auctionEvents || []),
      ...(eventos || []),
    ].map((ev: any) => ({
      url: `${baseUrl}/eventos/${ev.id}`,
      lastModified: ev.created_at,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const eventosListRoute: MetadataRoute.Sitemap = [
      {
        url: `${baseUrl}/eventos`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.8,
      },
    ];

    return [...staticRoutes, ...eventosListRoute, ...adEntries, ...eventEntries];
  } catch (err) {
    console.error('Error generating dynamic sitemap:', err);
    // Graceful fallback if database fails
    return staticRoutes;
  }
}
