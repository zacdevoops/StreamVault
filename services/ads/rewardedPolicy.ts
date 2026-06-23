export interface RewardedPolicyState {
  completions: number;
  lastCompletedAt: number | null;
}

let rewardedState: RewardedPolicyState = {
  completions: 0,
  lastCompletedAt: null,
};

export function getRewardedPolicyState(): RewardedPolicyState {
  return rewardedState;
}

export function recordRewardedCompletion(now = Date.now()): RewardedPolicyState {
  rewardedState = {
    completions: rewardedState.completions + 1,
    lastCompletedAt: now,
  };
  return rewardedState;
}

export function resetRewardedPolicyState(): RewardedPolicyState {
  rewardedState = { completions: 0, lastCompletedAt: null };
  return rewardedState;
}
