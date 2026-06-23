import { useEffect } from 'react';
import { adsService } from '@/services/ads/AdsService';

export function AdsBootstrap() {
  useEffect(() => {
    void adsService.initialize();
  }, []);

  return null;
}
