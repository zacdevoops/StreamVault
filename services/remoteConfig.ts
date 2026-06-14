import { NativeModules, Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  ensureInitialized,
  fetchAndActivate,
  getBoolean,
  getRemoteConfig,
  setConfigSettings,
  setDefaults,
  type FirebaseRemoteConfigTypes,
} from '@react-native-firebase/remote-config';

declare const __DEV__: boolean;

export interface FeatureFlags {
  enableNewPlayer: boolean;
  showDownloadButton: boolean;
  downloadsEnabled: boolean;
  showOfflineTab: boolean;
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
};

const REMOTE_CONFIG_DEFAULTS = {
  enable_new_player: DEFAULT_FEATURE_FLAGS.enableNewPlayer,
  show_download_button: DEFAULT_FEATURE_FLAGS.showDownloadButton,
  downloads_enabled: DEFAULT_FEATURE_FLAGS.downloadsEnabled,
  show_offline_tab: DEFAULT_FEATURE_FLAGS.showOfflineTab,
} satisfies FirebaseRemoteConfigTypes.ConfigDefaults;

let initializationPromise: Promise<FirebaseRemoteConfigTypes.Module> | null = null;

function hasRemoteConfigNativeModules(): boolean {
  return Boolean(NativeModules.RNFBAppModule && NativeModules.RNFBConfigModule);
}

function readFlags(remoteConfig: FirebaseRemoteConfigTypes.Module): FeatureFlags {
  return {
    enableNewPlayer: getBoolean(remoteConfig, 'enable_new_player'),
    showDownloadButton: getBoolean(remoteConfig, 'show_download_button'),
    downloadsEnabled: getBoolean(remoteConfig, 'downloads_enabled'),
    showOfflineTab: getBoolean(remoteConfig, 'show_offline_tab'),
  };
}

function getConfiguredRemoteConfig(): Promise<FirebaseRemoteConfigTypes.Module> {
  if (!initializationPromise) {
    const remoteConfig = getRemoteConfig(getApp());
    initializationPromise = Promise.all([
      setDefaults(remoteConfig, REMOTE_CONFIG_DEFAULTS),
      setConfigSettings(remoteConfig, {
        fetchTimeMillis: 10_000,
        minimumFetchIntervalMillis: __DEV__ ? 0 : 12 * 60 * 60 * 1000,
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
    await fetchAndActivate(remoteConfig);
    return { flags: readFlags(remoteConfig), fetchError: null };
  } catch (error: unknown) {
    return {
      flags: readFlags(remoteConfig),
      fetchError: error instanceof Error ? error.message : 'Remote Config fetch failed.',
    };
  }
}
