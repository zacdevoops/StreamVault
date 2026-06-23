import React from 'react';
import { View } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { GlobalAdBanner } from '@/components/ads/GlobalAdBanner';

export function TabBarWithBanner(props: BottomTabBarProps) {
  return (
    <View>
      <GlobalAdBanner variant="tab-bar" />
      <BottomTabBar {...props} />
    </View>
  );
}
