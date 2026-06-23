import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BANNER_SLOT_HEIGHT } from '@/constants/adsLayout';
import { canShowGlobalBanner, isTabShellRoute } from '@/services/ads/adRouteGuard';
import { isAdsSupportedPlatform } from '@/services/ads/adsConfig';
import { useAdsInitialized } from '@/hooks/useAdsInitialized';
import { adsService } from '@/services/ads/AdsService';

/** Bottom offset so the mini-player sits above the tab bar and global banner. */
export function useMiniPlayerBottomOffset(): number {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const adsInitialized = useAdsInitialized();

  const bannerActive = isAdsSupportedPlatform()
    && adsInitialized
    && canShowGlobalBanner(pathname)
    && !!adsService.getBannerUnitIdForPath(pathname);

  const bannerLift = bannerActive ? BANNER_SLOT_HEIGHT : 0;

  if (isTabShellRoute(pathname)) {
    const tabBarHeight = Platform.OS === 'ios' ? 82 : 60;
    return tabBarHeight + bannerLift;
  }

  return insets.bottom + bannerLift;
}
