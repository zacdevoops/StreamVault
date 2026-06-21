let pipTransitionActive = false;
let pipExitIdleTimer: ReturnType<typeof setTimeout> | null = null;

const PIP_EXIT_LAYOUT_SETTLE_MS = 1000;

function clearPipExitIdleTimer() {
  if (!pipExitIdleTimer) return;
  clearTimeout(pipExitIdleTimer);
  pipExitIdleTimer = null;
}

export function markPictureInPictureStarted() {
  clearPipExitIdleTimer();
  pipTransitionActive = true;
}

export function markPictureInPictureStopped() {
  clearPipExitIdleTimer();
  pipTransitionActive = true;
  pipExitIdleTimer = setTimeout(() => {
    pipTransitionActive = false;
    pipExitIdleTimer = null;
  }, PIP_EXIT_LAYOUT_SETTLE_MS);
}

export function isPlaybackPiPTransitionActive(): boolean {
  return pipTransitionActive;
}

export function runWhenPlaybackPiPIdle(callback: () => void): void {
  if (!pipTransitionActive) {
    callback();
    return;
  }

  const waitForIdle = () => {
    if (!pipTransitionActive) {
      callback();
      return;
    }
    setTimeout(waitForIdle, 50);
  };

  setTimeout(waitForIdle, 50);
}
