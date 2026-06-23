import {
  getRewardedPolicyState,
  recordRewardedCompletion,
  resetRewardedPolicyState,
} from '@/services/ads/rewardedPolicy';

describe('rewardedPolicy', () => {
  beforeEach(() => {
    resetRewardedPolicyState();
  });

  it('starts with zero completions', () => {
    expect(getRewardedPolicyState()).toEqual({
      completions: 0,
      lastCompletedAt: null,
    });
  });

  it('records rewarded completions', () => {
    const first = recordRewardedCompletion(1000);
    const second = recordRewardedCompletion(2000);

    expect(first).toEqual({ completions: 1, lastCompletedAt: 1000 });
    expect(second).toEqual({ completions: 2, lastCompletedAt: 2000 });
    expect(getRewardedPolicyState()).toEqual({ completions: 2, lastCompletedAt: 2000 });
  });
});
