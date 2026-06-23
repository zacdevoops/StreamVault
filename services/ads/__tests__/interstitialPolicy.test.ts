jest.mock('@/services/ads/adsConfig', () => ({
  adsConfig: {
    interstitial: {
      cooldownMs: 3 * 60 * 1000,
      sessionCap: 3,
    },
  },
}));

import {
  canShowInterstitialNow,
  createInterstitialPolicyState,
  markInterstitialShown,
} from '@/services/ads/interstitialPolicy';

describe('interstitialPolicy', () => {
  it('allows the first interstitial immediately', () => {
    const state = createInterstitialPolicyState();
    expect(canShowInterstitialNow(state, 'search_results', 1_000)).toBe(true);
  });

  it('enforces cooldown between interstitials', () => {
    let state = createInterstitialPolicyState();
    state = markInterstitialShown(state, 'search_results', 1_000);
    expect(canShowInterstitialNow(state, 'feed_page', 60_000)).toBe(false);
    expect(canShowInterstitialNow(state, 'feed_page', 181_000)).toBe(true);
  });

  it('caps interstitials per session', () => {
    let state = createInterstitialPolicyState();
    state = markInterstitialShown(state, 'search_results', 1_000);
    state = markInterstitialShown(state, 'feed_page', 181_000);
    state = markInterstitialShown(state, 'search_results', 361_000);
    expect(canShowInterstitialNow(state, 'feed_page', 541_000)).toBe(false);
  });
});
