import React, { Suspense, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Import each weight from its own subpath. The package's umbrella index.js
// eagerly requires every .ttf, which would balloon asset map by ~440 KB
// even when only two weights are used.
import { useFonts } from 'expo-font';
import { Outfit_400Regular } from '@expo-google-fonts/outfit/400Regular';
import { Outfit_700Bold } from '@expo-google-fonts/outfit/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { AdsBootstrap } from '@/components/ads/AdsBootstrap';
import { StackBannerOverlay } from '@/components/ads/StackBannerOverlay';
import { MiniPlayer } from '@/components/MiniPlayer';
import { PlaybackRouteRestoration } from '@/components/PlaybackRouteRestoration';
import { AutoNextPlayback } from '@/components/AutoNextPlayback';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VideoProvider } from '@/contexts/VideoContext';
import { ActivityIndicator, Alert, AppState, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { getHistory, getLiked } from '@/services/database';
import { useLibraryStore } from '@/stores/libraryStore';
import { useConfigStore } from '@/stores/configStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

function RouteFallback() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_700Bold,
    JetBrainsMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    let isMounted = true;
    void Promise.all([getHistory(), getLiked()])
      .then(([history, liked]) => {
        if (isMounted) useLibraryStore.setState({ history, liked });
      })
      .catch(() => {
        if (isMounted) {
          Alert.alert('Library unavailable', 'Your saved library could not be loaded.');
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void useConfigStore.getState().initializeFlags();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void useConfigStore.getState().refreshFlags();
      }
    });
    return () => subscription.remove();
  }, []);

  // Audio session policy is centralized in AppDelegate.swift and GlobalVideoManager.
  // Keeping setAudioModeAsync out of the root layout prevents a second JS-side
  // AVAudioSession writer from racing expo-video during startup/backgrounding.

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <VideoProvider>
          <AdsBootstrap />
          <PlaybackRouteRestoration />
          <AutoNextPlayback />
          <View style={{ flex: 1, backgroundColor: Colors.bgBase }}>
            <Suspense fallback={<RouteFallback />}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                  name="player/[id]"
                  options={{ animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="channel/[id]"
                  options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                  name="privacy-policy"
                  options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen name="+not-found" />
              </Stack>
            </Suspense>
            <StackBannerOverlay />
            <MiniPlayer />
            <StatusBar style="light" />
          </View>
        </VideoProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
