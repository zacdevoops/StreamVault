import { adsConfig } from '@/services/ads/adsConfig';

export type InterstitialTrigger = 'search_results' | 'feed_page';

export interface InterstitialPolicyState {
  shownThisSession: number;
  lastShownAt: number | null;
  lastTrigger: InterstitialTrigger | null;
}

export function createInterstitialPolicyState(): InterstitialPolicyState {
  return {
    shownThisSession: 0,
    lastShownAt: null,
    lastTrigger: null,
  };
}

export function canShowInterstitialNow(
  state: InterstitialPolicyState,
  trigger: InterstitialTrigger,
  now = Date.now(),
): boolean {
  if (state.shownThisSession >= adsConfig.interstitial.sessionCap) return false;
  if (state.lastShownAt == null) return true;
  if (now - state.lastShownAt < adsConfig.interstitial.cooldownMs) return false;
  if (state.lastTrigger === trigger && now - state.lastShownAt < adsConfig.interstitial.cooldownMs) {
    return false;
  }
  return true;
}

export function markInterstitialShown(
  state: InterstitialPolicyState,
  trigger: InterstitialTrigger,
  now = Date.now(),
): InterstitialPolicyState {
  return {
    shownThisSession: state.shownThisSession + 1,
    lastShownAt: now,
    lastTrigger: trigger,
  };
}
