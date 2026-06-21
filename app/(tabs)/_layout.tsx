import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Search, Download, Library } from 'lucide-react-native';
import { Colors, Typography, FontSizes } from '@/constants/theme';
import { Platform } from 'react-native';
import { useConfigStore } from '@/stores/configStore';

export default function TabLayout() {
  const configInitialized = useConfigStore((state) => state.isInitialized);
  const downloadsEnabled = useConfigStore((state) => state.downloadsEnabled);
  const showDownloadsTab = configInitialized && downloadsEnabled;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bgSurface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: Typography.body,
          fontSize: FontSizes.xs,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ size, color }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Downloads',
          tabBarIcon: ({ size, color }) => <Download size={size} color={color} />,
          href: showDownloadsTab ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ size, color }) => <Library size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
