import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adsService } from '@/services/ads/AdsService';
import { canShowGlobalBanner } from '@/services/ads/adRouteGuard';
import { isAdsSupportedPlatform } from '@/services/ads/adsConfig';
import { useAdsInitialized } from '@/hooks/useAdsInitialized';
import { Colors } from '@/constants/theme';
import { BANNER_SLOT_HEIGHT } from '@/constants/adsLayout';

type GlobalAdBannerProps = {
  variant: 'tab-bar' | 'floating';
};

export function GlobalAdBanner({ variant }: GlobalAdBannerProps) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const adsInitialized = useAdsInitialized();
  const unitId = adsInitialized ? adsService.getBannerUnitIdForPath(pathname) : null;

  const shouldRender = isAdsSupportedPlatform()
    && adsInitialized
    && !!unitId
    && canShowGlobalBanner(pathname);

  useEffect(() => {
    void adsService.initialize();
  }, []);

  if (!shouldRender || !unitId) return null;

  if (variant === 'tab-bar') {
    return (
      <View style={styles.tabBarSlot}>
        <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatingContainer, { bottom: insets.bottom }]}
    >
      <View style={styles.floatingSlot}>
        <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarSlot: {
    width: '100%',
    minHeight: BANNER_SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgBase,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    overflow: 'hidden',
  },
  floatingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 900,
    elevation: Platform.OS === 'android' ? 12 : 0,
    alignItems: 'center',
  },
  floatingSlot: {
    width: '100%',
    minHeight: BANNER_SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgBase,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    overflow: 'hidden',
  },
});
