import { Platform } from 'react-native';
import { AdsConsent, AdsConsentStatus } from 'react-native-google-mobile-ads';
import { isAdsSupportedPlatform } from '@/services/ads/adsConfig';

declare const __DEV__: boolean;

export type ConsentSnapshot = {
  status: AdsConsentStatus | 'unsupported';
  canRequestAds: boolean;
  isConsentFormAvailable: boolean;
};

export async function prepareAdsConsent(): Promise<ConsentSnapshot> {
  if (!isAdsSupportedPlatform() || Platform.OS !== 'android') {
    return {
      status: 'unsupported',
      canRequestAds: false,
      isConsentFormAvailable: false,
    };
  }

  try {
    const info = await AdsConsent.gatherConsent();

    return {
      status: info.status,
      canRequestAds: info.canRequestAds,
      isConsentFormAvailable: info.isConsentFormAvailable,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[consentManager] UMP consent flow failed; continuing without personalized ads', error);
    }
    return {
      status: AdsConsentStatus.UNKNOWN,
      canRequestAds: true,
      isConsentFormAvailable: false,
    };
  }
}
