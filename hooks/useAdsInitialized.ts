import { useSyncExternalStore } from 'react';
import { adsService } from '@/services/ads/AdsService';

export function useAdsInitialized(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => adsService.subscribeInitialization(onStoreChange),
    () => adsService.isInitialized(),
    () => false,
  );
}
