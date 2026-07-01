import {
  DOWNLOADS_PER_REWARD_BLOCK,
  getRewardedPolicyState,
  getSessionDownloadCount,
  recordRewardedCompletion,
  recordSessionDownloadAttempt,
  resetRewardedPolicyState,
  shouldShowRewardedAdBeforeDownload,
} from '@/services/ads/rewardedPolicy';

describe('rewardedPolicy', () => {
  beforeEach(() => {
    resetRewardedPolicyState();
  });

  it('starts with zero completions and zero session downloads', () => {
    expect(getRewardedPolicyState()).toEqual({
      completions: 0,
      lastCompletedAt: null,
      sessionDownloadCount: 0,
    });
  });

  it('records rewarded completions', () => {
    const first = recordRewardedCompletion(1000);
    const second = recordRewardedCompletion(2000);

    expect(first).toEqual({
      completions: 1,
      lastCompletedAt: 1000,
      sessionDownloadCount: 0,
    });
    expect(second).toEqual({
      completions: 2,
      lastCompletedAt: 2000,
      sessionDownloadCount: 0,
    });
  });

  it('allows the first three downloads in a block without rewarded ads', () => {
    expect(shouldShowRewardedAdBeforeDownload()).toBe(false);

    recordSessionDownloadAttempt();
    expect(getSessionDownloadCount()).toBe(1);
    expect(shouldShowRewardedAdBeforeDownload()).toBe(false);

    recordSessionDownloadAttempt();
    expect(getSessionDownloadCount()).toBe(2);
    expect(shouldShowRewardedAdBeforeDownload()).toBe(false);

    recordSessionDownloadAttempt();
    expect(getSessionDownloadCount()).toBe(3);
    expect(shouldShowRewardedAdBeforeDownload()).toBe(true);
  });

  it('requires rewarded ads only on every fourth download', () => {
    const rewardedAt: number[] = [];

    for (let next = 1; next <= 12; next += 1) {
      const requiresAd = shouldShowRewardedAdBeforeDownload();
      if (requiresAd) rewardedAt.push(next);
      recordSessionDownloadAttempt();
    }

    expect(rewardedAt).toEqual([4, 8, 12]);
    expect(getSessionDownloadCount()).toBe(12);
  });

  it('resets the block after each rewarded download boundary', () => {
    for (let i = 0; i < DOWNLOADS_PER_REWARD_BLOCK; i += 1) {
      recordSessionDownloadAttempt();
    }

    expect(getSessionDownloadCount()).toBe(DOWNLOADS_PER_REWARD_BLOCK);
    expect(shouldShowRewardedAdBeforeDownload()).toBe(false);
  });
});
