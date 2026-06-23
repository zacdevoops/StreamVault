import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

declare const __DEV__: boolean;

export type AdsMode = 'test' | 'production';

const GOOGLE_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

/** Expo inlines only static process.env.EXPO_PUBLIC_* access at bundle time. */
function readPublicEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function resolveAdsMode(): AdsMode {
  const configured = readPublicEnv(process.env.EXPO_PUBLIC_ADS_MODE)?.toLowerCase();
  if (configured === 'production') return 'production';
  if (configured === 'test') return 'test';
  return __DEV__ ? 'test' : 'production';
}

function resolveAndroidEnabled(): boolean {
  const flag = readPublicEnv(process.env.EXPO_PUBLIC_ADS_ANDROID_ENABLED)?.toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') return true;
  return Platform.OS === 'android';
}

const adsMode = resolveAdsMode();

export const adsConfig = {
  mode: adsMode,
  androidEnabled: resolveAndroidEnabled(),
  /** iOS wiring is prepared only — keep disabled until native setup is complete. */
  iosEnabled: false,
  appIds: {
    android: readPublicEnv(process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID) ?? GOOGLE_TEST_APP_ID,
    ios: readPublicEnv(process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID) ?? GOOGLE_TEST_APP_ID,
  },
  units: {
    bannerHomeAndroid:
      readPublicEnv(process.env.EXPO_PUBLIC_ADMOB_BANNER_HOME_ANDROID)
      ?? (__DEV__ || adsMode === 'test' ? TestIds.ADAPTIVE_BANNER : ''),
    bannerSearchAndroid:
      readPublicEnv(process.env.EXPO_PUBLIC_ADMOB_BANNER_SEARCH_ANDROID)
      ?? (__DEV__ || adsMode === 'test' ? TestIds.ADAPTIVE_BANNER : ''),
    interstitialAndroid:
      readPublicEnv(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID)
      ?? (__DEV__ || adsMode === 'test' ? TestIds.INTERSTITIAL : ''),
    rewardedAndroid:
      readPublicEnv(process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID)
      ?? (__DEV__ || adsMode === 'test' ? TestIds.REWARDED : ''),
  },
  interstitial: {
    cooldownMs: 3 * 60 * 1000,
    sessionCap: 3,
  },
  rewardedEnabled: (() => {
    const flag = readPublicEnv(process.env.EXPO_PUBLIC_ADS_REWARDED_ENABLED)?.toLowerCase();
    if (flag === 'false' || flag === '0') return false;
    if (flag === 'true' || flag === '1') return true;
    return resolveAndroidEnabled();
  })(),
} as const;

export function isAdsSupportedPlatform(): boolean {
  if (Platform.OS === 'android') return adsConfig.androidEnabled;
  if (Platform.OS === 'ios') return adsConfig.iosEnabled;
  return false;
}

export function isProductionAdsMode(): boolean {
  return adsConfig.mode === 'production';
}
