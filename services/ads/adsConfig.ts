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

/** Static reads required for Expo Metro inlining in release bundles. */
const ENV_ADMOB_BANNER_HOME_ANDROID = process.env.EXPO_PUBLIC_ADMOB_BANNER_HOME_ANDROID;
const ENV_ADMOB_BANNER_SEARCH_ANDROID = process.env.EXPO_PUBLIC_ADMOB_BANNER_SEARCH_ANDROID;
const ENV_ADMOB_INTERSTITIAL_ANDROID = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID;
const ENV_ADMOB_REWARDED_ANDROID = process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID;

const useTestAdUnitFallback = __DEV__ || adsMode === 'test';

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
      readPublicEnv(ENV_ADMOB_BANNER_HOME_ANDROID)
      ?? (useTestAdUnitFallback ? TestIds.ADAPTIVE_BANNER : ''),
    bannerSearchAndroid:
      readPublicEnv(ENV_ADMOB_BANNER_SEARCH_ANDROID)
      ?? (useTestAdUnitFallback ? TestIds.ADAPTIVE_BANNER : ''),
    interstitialAndroid:
      readPublicEnv(ENV_ADMOB_INTERSTITIAL_ANDROID)
      ?? (useTestAdUnitFallback ? TestIds.INTERSTITIAL : ''),
    rewardedAndroid:
      readPublicEnv(ENV_ADMOB_REWARDED_ANDROID)
      ?? (useTestAdUnitFallback ? TestIds.REWARDED : ''),
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
