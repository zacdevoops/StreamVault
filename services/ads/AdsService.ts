import mobileAds, {
  AdEventType,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
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

declare const __DEV__: boolean;

type AdapterStatusList = Awaited<ReturnType<ReturnType<typeof mobileAds>['initialize']>>;

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
  private rewardedPrepared = false;

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

  /** Rewarded ads are intentionally disabled until product enables them. */
  prepareRewardedAds(): void {
    if (!adsConfig.rewardedEnabled || this.rewardedPrepared || !isAdsSupportedPlatform()) return;
    const unitId = adsConfig.units.rewardedAndroid;
    if (!unitId) return;
    RewardedAd.createForAdRequest(unitId);
    this.rewardedPrepared = true;
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
