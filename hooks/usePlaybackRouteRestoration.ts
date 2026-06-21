import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { globalVideoManager } from '@/services/GlobalVideoManager';
import { isSameVideoId, normalizeVideoId, playerRouteVideoId } from '@/services/playbackSession';
import { isPlaybackPiPTransitionActive, runWhenPlaybackPiPIdle } from '@/services/playbackPiPGuard';

function hasRestorablePlaybackSession(): boolean {
  globalVideoManager.syncFromNativePlayer();
  const snapshot = globalVideoManager.getSnapshot();
  const videoId = normalizeVideoId(snapshot.currentTrack?.id);
  if (!videoId || snapshot.currentTrack?.isAudioOnly) return false;
  if (!snapshot.currentTrack?.fileUri) return false;

  const player = globalVideoManager.getSnapshot();
  const hasProgress =
    player.isPlaying ||
    player.status === 'readyToPlay' ||
    player.status === 'loading' ||
    player.position > 0 ||
    player.duration > 0;

  return hasProgress;
}

function restorePlayerRoute(pathname: string): void {
  if (isPlaybackPiPTransitionActive()) return;
  if (!hasRestorablePlaybackSession()) return;

  const videoId = normalizeVideoId(globalVideoManager.getSnapshot().currentTrack?.id);
  if (!videoId) return;

  const routeVideoId = playerRouteVideoId(pathname);
  if (isSameVideoId(routeVideoId, videoId)) return;

  router.replace({ pathname: '/player/[id]', params: { id: videoId } });
}

function scheduleRestore(pathname: string): void {
  runWhenPlaybackPiPIdle(() => {
    requestAnimationFrame(() => {
      restorePlayerRoute(pathname);
    });
    setTimeout(() => restorePlayerRoute(pathname), 100);
    setTimeout(() => restorePlayerRoute(pathname), 300);
  });
}

/**
 * When Android media notification or task switch brings the app back while a video
 * is playing, reopen the full player route instead of leaving the user on tabs/home.
 */
export function usePlaybackRouteRestoration() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const appStateRef = useRef(AppState.currentState);

  pathnameRef.current = pathname;

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const tryRestore = () => {
      globalVideoManager.syncFromNativePlayer();
      scheduleRestore(pathnameRef.current);
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState !== 'active' || previousState === 'active') return;
      tryRestore();
    });

    tryRestore();

    return () => subscription.remove();
  }, []);
}
