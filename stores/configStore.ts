import { create } from 'zustand';
import {
  DEFAULT_FEATURE_FLAGS,
  loadFeatureFlags,
  type FeatureFlags,
} from '@/services/remoteConfig';

declare const __DEV__: boolean;

interface ConfigStore extends FeatureFlags {
  isInitialized: boolean;
  isRefreshing: boolean;
  errorMessage: string | null;
  initializeFlags: () => Promise<void>;
  refreshFlags: () => Promise<void>;
}

async function updateFlags(
  set: (partial: Partial<ConfigStore>) => void
): Promise<void> {
  set({ isRefreshing: true });
  try {
    const { flags, fetchError } = await loadFeatureFlags();
    if (__DEV__ && fetchError) {
      console.warn('[remote-config] Fetch failed; using cached or default flags:', fetchError);
    }
    set({
      ...flags,
      isInitialized: true,
      isRefreshing: false,
      errorMessage: fetchError,
    });
  } catch (error: unknown) {
    if (__DEV__) {
      console.warn('[remote-config] Initialization failed; using default flags:', error);
    }
    set({
      isInitialized: true,
      isRefreshing: false,
      errorMessage: error instanceof Error ? error.message : 'Remote Config initialization failed.',
    });
  }
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  ...DEFAULT_FEATURE_FLAGS,
  isInitialized: false,
  isRefreshing: false,
  errorMessage: null,
  initializeFlags: async () => {
    if (get().isInitialized || get().isRefreshing) return;
    await updateFlags(set);
  },
  refreshFlags: async () => {
    if (get().isRefreshing) return;
    await updateFlags(set);
  },
}));
