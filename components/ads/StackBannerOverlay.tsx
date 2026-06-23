import React from 'react';
import { usePathname } from 'expo-router';
import { GlobalAdBanner } from '@/components/ads/GlobalAdBanner';
import { canShowGlobalBanner, isTabShellRoute } from '@/services/ads/adRouteGuard';

export function StackBannerOverlay() {
  const pathname = usePathname();

  if (isTabShellRoute(pathname) || !canShowGlobalBanner(pathname)) {
    return null;
  }

  return <GlobalAdBanner variant="floating" />;
}
