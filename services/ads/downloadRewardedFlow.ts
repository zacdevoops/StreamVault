import { adsService } from '@/services/ads/AdsService';
import {
  getSessionDownloadCount,
  recordSessionDownloadAttempt,
  shouldShowRewardedAdBeforeDownload,
} from '@/services/ads/rewardedPolicy';

export async function runDownloadWithRewardedPrompt(
  startDownload: () => void | Promise<void>,
): Promise<void> {
  await adsService.initialize();

  const sessionDownloadCount = getSessionDownloadCount();
  const requiresRewardedAd = shouldShowRewardedAdBeforeDownload();

  console.log('[Ads] rewarded policy count', {
    sessionDownloadCount,
    requiresRewardedAd,
  });

  if (requiresRewardedAd && adsService.canOfferDownloadRewardedPrompt()) {
    await adsService.tryShowRewardedAd();
  }

  recordSessionDownloadAttempt();
  await startDownload();
}
