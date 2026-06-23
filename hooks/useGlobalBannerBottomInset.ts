import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BANNER_SLOT_HEIGHT } from '@/constants/adsLayout';
import { canShowGlobalBanner, isTabShellRoute } from '@/services/ads/adRouteGuard';
import { isAdsSupportedPlatform } from '@/services/ads/adsConfig';
import { useAdsInitialized } from '@/hooks/useAdsInitialized';
import { adsService } from '@/services/ads/AdsService';

/** Bottom padding for scroll content on stack screens that show a floating banner. */
export function useGlobalBannerBottomInset(): number {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const adsInitialized = useAdsInitialized();

  if (!isAdsSupportedPlatform() || !adsInitialized || !canShowGlobalBanner(pathname)) {
    return 0;
  }
  if (isTabShellRoute(pathname)) {
    return 0;
  }

  const unitId = adsService.getBannerUnitIdForPath(pathname);
  if (!unitId) return 0;

  return BANNER_SLOT_HEIGHT + insets.bottom;
}
