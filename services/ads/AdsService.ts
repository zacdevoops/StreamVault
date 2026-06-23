import mobileAds, {
  AdEventType,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import { adsConfig, isAdsSupportedPlatform } from '@/services/ads/adsConfig';
import { canShowInterstitial, resolveBannerPlacement } from '@/services/ads/adRouteGuard';
import { prepareAdsConsent, type ConsentSnapshot } from '@/services/ads/consentManager';
import {
  canShowInterstitialNow,
  createInterstitialPolicyState,
  markInterstitialShown,
  type InterstitialPolicyState,
  type InterstitialTrigger,
} from '@/services/ads/interstitialPolicy';
import { getRewardedPolicyState, recordRewardedCompletion } from '@/services/ads/rewardedPolicy';

declare const __DEV__: boolean;

type AdapterStatusList = Awaited<ReturnType<ReturnType<typeof mobileAds>['initialize']>>;

export type RewardedShowOutcome = 'earned' | 'closed' | 'failed' | 'unavailable';

class AdsService {
  private initialized = false;
  private initListeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;
  private consent: ConsentSnapshot | null = null;
  private adapterStatuses: AdapterStatusList | null = null;
  private interstitialPolicy: InterstitialPolicyState = createInterstitialPolicyState();
  private interstitial: InterstitialAd | null = null;
  private interstitialLoaded = false;
  private interstitialLoading = false;
  private rewarded: RewardedAd | null = null;
  private rewardedLoaded = false;
  private rewardedLoading = false;

  async initialize(): Promise<void> {
    if (!isAdsSupportedPlatform()) return;
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.bootstrap().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  getConsentSnapshot(): ConsentSnapshot | null {
    return this.consent;
  }

  getAdapterStatuses(): AdapterStatusList | null {
    return this.adapterStatuses;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  subscribeInitialization(listener: () => void): () => void {
    this.initListeners.add(listener);
    return () => {
      this.initListeners.delete(listener);
    };
  }

  getBannerUnitId(placement: 'home' | 'search'): string | null {
    if (!this.initialized || !isAdsSupportedPlatform()) return null;
    const unitId = placement === 'home'
      ? adsConfig.units.bannerHomeAndroid
      : adsConfig.units.bannerSearchAndroid;
    return unitId || null;
  }

  getBannerUnitIdForPath(pathname: string): string | null {
    return this.getBannerUnitId(resolveBannerPlacement(pathname));
  }

  canOfferDownloadRewardedPrompt(): boolean {
    if (!this.initialized || !isAdsSupportedPlatform() || !adsConfig.rewardedEnabled) {
      return false;
    }
    return !!adsConfig.units.rewardedAndroid;
  }

  getRewardedCompletionStats() {
    return getRewardedPolicyState();
  }

  async tryShowRewardedAd(): Promise<RewardedShowOutcome> {
    if (!this.canOfferDownloadRewardedPrompt()) {
      this.logRewarded('failed', { phase: 'show', reason: 'unavailable' });
      return 'unavailable';
    }

    if (!this.rewardedLoaded || !this.rewarded) {
      this.preloadRewardedAd();
      this.logRewarded('failed', { phase: 'show', reason: 'not_loaded' });
      return 'unavailable';
    }

    return new Promise((resolve) => {
      const ad = this.rewarded;
      if (!ad) {
        this.logRewarded('failed', { phase: 'show', reason: 'missing_instance' });
        resolve('unavailable');
        return;
      }

      let earned = false;

      const unsubscribeEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
        earned = true;
        recordRewardedCompletion();
        this.logRewarded('earned', {
          type: reward.type,
          amount: reward.amount,
          completions: getRewardedPolicyState().completions,
        });
      });

      const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        unsubscribeEarned();
        unsubscribeClosed();
        unsubscribeError();
        this.rewardedLoaded = false;
        this.rewarded = null;
        this.preloadRewardedAd();
        resolve(earned ? 'earned' : 'closed');
      });

      const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
        unsubscribeEarned();
        unsubscribeClosed();
        unsubscribeError();
        this.logRewarded('failed', {
          phase: 'show',
          message: error.message,
          code: (error as Error & { code?: string | number }).code ?? null,
        });
        this.rewardedLoaded = false;
        this.rewarded = null;
        this.preloadRewardedAd();
        resolve('failed');
      });

      try {
        this.logRewarded('shown', {});
        ad.show();
      } catch (error) {
        unsubscribeEarned();
        unsubscribeClosed();
        unsubscribeError();
        this.logRewarded('failed', {
          phase: 'show',
          message: error instanceof Error ? error.message : String(error),
        });
        this.rewardedLoaded = false;
        this.rewarded = null;
        this.preloadRewardedAd();
        resolve('failed');
      }
    });
  }

  async tryShowInterstitial(trigger: InterstitialTrigger, pathname: string): Promise<boolean> {
    if (!this.initialized || !isAdsSupportedPlatform()) return false;
    if (!canShowInterstitial(pathname)) return false;
    if (!canShowInterstitialNow(this.interstitialPolicy, trigger)) return false;
    if (!this.interstitialLoaded || !this.interstitial) {
      this.preloadInterstitial();
      return false;
    }

    return new Promise((resolve) => {
      const ad = this.interstitial;
      if (!ad) {
        resolve(false);
        return;
      }

      const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        unsubscribeClosed();
        unsubscribeError();
        this.interstitialPolicy = markInterstitialShown(this.interstitialPolicy, trigger);
        this.interstitialLoaded = false;
        this.interstitial = null;
        this.preloadInterstitial();
        resolve(true);
      });

      const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, () => {
        unsubscribeClosed();
        unsubscribeError();
        this.interstitialLoaded = false;
        this.preloadInterstitial();
        resolve(false);
      });

      try {
        ad.show();
      } catch {
        unsubscribeClosed();
        unsubscribeError();
        resolve(false);
      }
    });
  }

  /** Preloads rewarded ads for optional download prompts. */
  prepareRewardedAds(): void {
    this.preloadRewardedAd();
  }

  private logRewarded(
    event: 'loaded' | 'shown' | 'earned' | 'failed',
    details?: Record<string, unknown>,
  ): void {
    if (details && Object.keys(details).length > 0) {
      console.log(`[Ads] rewarded ${event}`, details);
      return;
    }
    console.log(`[Ads] rewarded ${event}`);
  }

  private preloadRewardedAd(): void {
    if (!adsConfig.rewardedEnabled || !isAdsSupportedPlatform()) return;
    if (this.rewardedLoading || this.rewardedLoaded) return;

    const unitId = adsConfig.units.rewardedAndroid;
    if (!unitId) return;

    this.rewardedLoading = true;
    const ad = RewardedAd.createForAdRequest(unitId);
    this.rewarded = ad;

    const unsubscribeLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      unsubscribeLoaded();
      unsubscribeError();
      this.rewardedLoaded = true;
      this.rewardedLoading = false;
      this.logRewarded('loaded');
    });

    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      unsubscribeLoaded();
      unsubscribeError();
      this.rewardedLoading = false;
      this.rewardedLoaded = false;
      this.rewarded = null;
      this.logRewarded('failed', {
        phase: 'load',
        message: error.message,
        code: (error as Error & { code?: string | number }).code ?? null,
      });
    });

    ad.load();
  }

  private async bootstrap(): Promise<void> {
    this.consent = await prepareAdsConsent();
    if (!this.consent.canRequestAds) {
      if (__DEV__) console.warn('[AdsService] Ads blocked until consent is obtained');
      return;
    }

    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });

    this.adapterStatuses = await mobileAds().initialize();
    if (__DEV__) {
      console.log('[AdsService] mobileAds initialized');
      this.logAdapterStatuses(this.adapterStatuses);
    }
    this.setInitialized(true);
    this.preloadInterstitial();
    this.prepareRewardedAds();
  }

  private setInitialized(value: boolean): void {
    if (this.initialized === value) return;
    this.initialized = value;
    this.initListeners.forEach((listener) => listener());
  }

  private logAdapterStatuses(statuses: AdapterStatusList): void {
    if (!__DEV__) return;
    console.log('[AdsService] mediation adapter status', statuses.map((status) => ({
      name: status.name,
      state: status.state,
      description: status.description,
    })));
  }

  private preloadInterstitial(): void {
    if (!isAdsSupportedPlatform() || this.interstitialLoading || this.interstitialLoaded) return;
    const unitId = adsConfig.units.interstitialAndroid;
    if (!unitId) return;

    this.interstitialLoading = true;
    const ad = InterstitialAd.createForAdRequest(unitId);
    const unsubscribeLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      unsubscribeLoaded();
      unsubscribeError();
      this.interstitial = ad;
      this.interstitialLoaded = true;
      this.interstitialLoading = false;
    });
    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, () => {
      unsubscribeLoaded();
      unsubscribeError();
      this.interstitialLoading = false;
    });
    ad.load();
  }
}

export const adsService = new AdsService();
