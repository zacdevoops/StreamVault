import { NativeModules, Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  ensureInitialized,
  fetchAndActivate,
  getBoolean,
  getRemoteConfig,
  lastFetchStatus,
  setConfigSettings,
  setDefaults,
  type FirebaseRemoteConfigTypes,
} from '@react-native-firebase/remote-config';

declare const __DEV__: boolean;
declare const process: { env?: Record<string, string | undefined> };

export interface FeatureFlags {
  enableNewPlayer: boolean;
  showDownloadButton: boolean;
  downloadsEnabled: boolean;
  showOfflineTab: boolean;
  backgroundPlaybackEnabled: boolean;
}

export interface RemoteConfigResult {
  flags: FeatureFlags;
  fetchError: string | null;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableNewPlayer: false,
  showDownloadButton: true,
  downloadsEnabled: true,
  showOfflineTab: true,
  backgroundPlaybackEnabled: true,
};

export const REMOTE_CONFIG_FETCH_INTERVAL_MS = {
  production: 12 * 60 * 60 * 1000,
  qa: 60 * 1000,
  debug: 0,
} as const;

const REMOTE_CONFIG_DEFAULTS = {
  enable_new_player: DEFAULT_FEATURE_FLAGS.enableNewPlayer,
  show_download_button: DEFAULT_FEATURE_FLAGS.showDownloadButton,
  downloads_enabled: DEFAULT_FEATURE_FLAGS.downloadsEnabled,
  show_offline_tab: DEFAULT_FEATURE_FLAGS.showOfflineTab,
  background_playback_enabled: DEFAULT_FEATURE_FLAGS.backgroundPlaybackEnabled,
} satisfies FirebaseRemoteConfigTypes.ConfigDefaults;

let initializationPromise: Promise<FirebaseRemoteConfigTypes.Module> | null = null;

export function isQaRemoteConfigMode(): boolean {
  return process.env?.EXPO_PUBLIC_RC_QA_MODE?.trim().toLowerCase() === 'true';
}

export function getMinimumFetchIntervalMillis(): number {
  if (__DEV__) return REMOTE_CONFIG_FETCH_INTERVAL_MS.debug;
  if (isQaRemoteConfigMode()) return REMOTE_CONFIG_FETCH_INTERVAL_MS.qa;
  return REMOTE_CONFIG_FETCH_INTERVAL_MS.production;
}

function hasRemoteConfigNativeModules(): boolean {
  return Boolean(NativeModules.RNFBAppModule && NativeModules.RNFBConfigModule);
}

function readFlags(remoteConfig: FirebaseRemoteConfigTypes.Module): FeatureFlags {
  return {
    enableNewPlayer: getBoolean(remoteConfig, 'enable_new_player'),
    showDownloadButton: getBoolean(remoteConfig, 'show_download_button'),
    downloadsEnabled: getBoolean(remoteConfig, 'downloads_enabled'),
    showOfflineTab: getBoolean(remoteConfig, 'show_offline_tab'),
    backgroundPlaybackEnabled: getBoolean(remoteConfig, 'background_playback_enabled'),
  };
}

function shouldLogRemoteConfigDiagnostics(): boolean {
  return __DEV__ || isQaRemoteConfigMode();
}

function logRemoteConfigDiagnostics(
  remoteConfig: FirebaseRemoteConfigTypes.Module,
  fetchAndActivateResult: boolean | null,
  flags: FeatureFlags,
  context: 'success' | 'failure'
): void {
  if (!shouldLogRemoteConfigDiagnostics()) return;

  console.log('[remote-config] fetch outcome', {
    context,
    fetchAndActivate: fetchAndActivateResult,
    lastFetchStatus: lastFetchStatus(remoteConfig),
    downloadFlags: {
      showDownloadButton: flags.showDownloadButton,
      downloadsEnabled: flags.downloadsEnabled,
    },
    minimumFetchIntervalMillis: getMinimumFetchIntervalMillis(),
    qaMode: isQaRemoteConfigMode(),
  });
}

function getConfiguredRemoteConfig(): Promise<FirebaseRemoteConfigTypes.Module> {
  if (!initializationPromise) {
    const remoteConfig = getRemoteConfig(getApp());
    initializationPromise = Promise.all([
      setDefaults(remoteConfig, REMOTE_CONFIG_DEFAULTS),
      setConfigSettings(remoteConfig, {
        fetchTimeMillis: 10_000,
        minimumFetchIntervalMillis: getMinimumFetchIntervalMillis(),
      }),
    ])
      .then(() => ensureInitialized(remoteConfig))
      .then(() => remoteConfig)
      .catch((error: unknown) => {
        initializationPromise = null;
        throw error;
      });
  }

  return initializationPromise;
}

export async function loadFeatureFlags(): Promise<RemoteConfigResult> {
  if (Platform.OS === 'web') {
    return { flags: DEFAULT_FEATURE_FLAGS, fetchError: null };
  }

  if (!hasRemoteConfigNativeModules()) {
    return {
      flags: DEFAULT_FEATURE_FLAGS,
      fetchError: 'Firebase Remote Config native module is unavailable.',
    };
  }

  const remoteConfig = await getConfiguredRemoteConfig();
  try {
    const fetchAndActivateResult = await fetchAndActivate(remoteConfig);
    const flags = readFlags(remoteConfig);
    logRemoteConfigDiagnostics(remoteConfig, fetchAndActivateResult, flags, 'success');
    return { flags, fetchError: null };
  } catch (error: unknown) {
    const flags = readFlags(remoteConfig);
    logRemoteConfigDiagnostics(remoteConfig, null, flags, 'failure');
    return {
      flags,
      fetchError: error instanceof Error ? error.message : 'Remote Config fetch failed.',
    };
  }
}
