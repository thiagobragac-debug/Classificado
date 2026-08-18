'use client';

import { useEffect } from 'react';
import { useRecentViews } from '@/lib/useRecentViews';

export function RecentViewTracker({ ad }: { ad: any }) {
  const { recordView } = useRecentViews();

  useEffect(() => {
    if (ad && ad.id) {
      recordView(ad);
    }
  }, [ad, recordView]);

  return null;
}
