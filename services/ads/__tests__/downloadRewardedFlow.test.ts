const mockInitialize = jest.fn();
const mockCanOfferDownloadRewardedPrompt = jest.fn();
const mockTryShowRewardedAd = jest.fn();

jest.mock('@/services/ads/AdsService', () => ({
  adsService: {
    initialize: mockInitialize,
    canOfferDownloadRewardedPrompt: mockCanOfferDownloadRewardedPrompt,
    tryShowRewardedAd: mockTryShowRewardedAd,
  },
}));

import { runDownloadWithRewardedPrompt } from '@/services/ads/downloadRewardedFlow';
import { resetRewardedPolicyState } from '@/services/ads/rewardedPolicy';

describe('downloadRewardedFlow', () => {
  beforeEach(() => {
    resetRewardedPolicyState();
    mockInitialize.mockReset().mockResolvedValue(undefined);
    mockCanOfferDownloadRewardedPrompt.mockReset().mockReturnValue(true);
    mockTryShowRewardedAd.mockReset().mockResolvedValue('closed');
  });

  it('skips rewarded ads for the first three downloads in a block', async () => {
    const startDownload = jest.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 3; i += 1) {
      await runDownloadWithRewardedPrompt(startDownload);
    }

    expect(mockTryShowRewardedAd).not.toHaveBeenCalled();
    expect(startDownload).toHaveBeenCalledTimes(3);
  });

  it('attempts rewarded ads only on the fourth download of each block', async () => {
    const startDownload = jest.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 8; i += 1) {
      await runDownloadWithRewardedPrompt(startDownload);
    }

    expect(mockTryShowRewardedAd).toHaveBeenCalledTimes(2);
    expect(startDownload).toHaveBeenCalledTimes(8);
  });

  it('starts download even when rewarded ad fails on the fourth download', async () => {
    const startDownload = jest.fn().mockResolvedValue(undefined);
    mockTryShowRewardedAd.mockResolvedValue('failed');

    for (let i = 0; i < 4; i += 1) {
      await runDownloadWithRewardedPrompt(startDownload);
    }

    expect(mockTryShowRewardedAd).toHaveBeenCalledTimes(1);
    expect(startDownload).toHaveBeenCalledTimes(4);
  });

  it('starts download when rewarded ad is unavailable on the fourth download', async () => {
    const startDownload = jest.fn().mockResolvedValue(undefined);
    mockCanOfferDownloadRewardedPrompt.mockReturnValue(false);

    for (let i = 0; i < 4; i += 1) {
      await runDownloadWithRewardedPrompt(startDownload);
    }

    expect(mockTryShowRewardedAd).not.toHaveBeenCalled();
    expect(startDownload).toHaveBeenCalledTimes(4);
  });

  it('shows rewarded ads on downloads 4, 8, and 12 across three blocks', async () => {
    const startDownload = jest.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 12; i += 1) {
      await runDownloadWithRewardedPrompt(startDownload);
    }

    expect(mockTryShowRewardedAd).toHaveBeenCalledTimes(3);
    expect(startDownload).toHaveBeenCalledTimes(12);
  });
});
