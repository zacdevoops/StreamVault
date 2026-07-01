export const DOWNLOADS_PER_REWARD_BLOCK = 4;
export const FREE_DOWNLOADS_PER_BLOCK = 3;

export interface RewardedPolicyState {
  completions: number;
  lastCompletedAt: number | null;
  sessionDownloadCount: number;
}

let rewardedState: RewardedPolicyState = {
  completions: 0,
  lastCompletedAt: null,
  sessionDownloadCount: 0,
};

export function getRewardedPolicyState(): RewardedPolicyState {
  return rewardedState;
}

export function getSessionDownloadCount(): number {
  return rewardedState.sessionDownloadCount;
}

/** True when the next download attempt should try a rewarded ad first (4th, 8th, 12th, ...). */
export function shouldShowRewardedAdBeforeDownload(): boolean {
  const nextDownloadNumber = rewardedState.sessionDownloadCount + 1;
  return nextDownloadNumber % DOWNLOADS_PER_REWARD_BLOCK === 0;
}

export function recordSessionDownloadAttempt(): RewardedPolicyState {
  rewardedState = {
    ...rewardedState,
    sessionDownloadCount: rewardedState.sessionDownloadCount + 1,
  };
  return rewardedState;
}

export function recordRewardedCompletion(now = Date.now()): RewardedPolicyState {
  rewardedState = {
    ...rewardedState,
    completions: rewardedState.completions + 1,
    lastCompletedAt: now,
  };
  return rewardedState;
}

export function resetRewardedPolicyState(): RewardedPolicyState {
  rewardedState = {
    completions: 0,
    lastCompletedAt: null,
    sessionDownloadCount: 0,
  };
  return rewardedState;
}
