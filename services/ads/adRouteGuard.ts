import { useDownloadStore } from '@/stores/downloadStore';
import { usePlayerStore } from '@/stores/playerStore';
import { globalVideoManager } from '@/services/GlobalVideoManager';
import { isPlaybackPiPTransitionActive } from '@/services/playbackPiPGuard';

const PLAYBACK_ROUTE_PREFIX = '/player/';

export function isPlaybackRoute(pathname: string): boolean {
  return pathname.startsWith(PLAYBACK_ROUTE_PREFIX);
}

export function isDownloadsRoute(pathname: string): boolean {
  return pathname === '/downloads' || pathname.endsWith('/downloads');
}

export function hasActiveDownloadSession(): boolean {
  return Object.values(useDownloadStore.getState().downloads).some(
    (item) => item.status === 'downloading' || item.status === 'pending' || item.status === 'paused',
  );
}

export function isPlaybackActive(): boolean {
  const snapshot = globalVideoManager.getSnapshot();
  if (!snapshot.currentTrack) return false;
  return snapshot.isPlaying
    || snapshot.status === 'loading'
    || snapshot.status === 'readyToPlay'
    || snapshot.position > 0;
}

export function isMiniPlayerActive(): boolean {
  const { miniPlayerVisible } = usePlayerStore.getState();
  return miniPlayerVisible && !!globalVideoManager.getSnapshot().currentTrack;
}

export function canShowInterstitial(pathname: string): boolean {
  if (isPlaybackRoute(pathname)) return false;
  if (isDownloadsRoute(pathname) && hasActiveDownloadSession()) return false;
  if (isMiniPlayerActive() && isPlaybackActive()) return false;
  return true;
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

export function isTabShellRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === '/'
    || normalized === '/index'
    || normalized.endsWith('/index')
    || normalized === '/search'
    || normalized.endsWith('/search')
    || normalized === '/downloads'
    || normalized.endsWith('/downloads')
    || normalized === '/library'
    || normalized.endsWith('/library');
}

export function canShowGlobalBanner(pathname: string): boolean {
  if (isPlaybackRoute(pathname)) return false;
  if (isPlaybackPiPTransitionActive()) return false;
  return true;
}

export type BannerPlacement = 'home' | 'search';

export function resolveBannerPlacement(pathname: string): BannerPlacement {
  const normalized = normalizePathname(pathname);
  if (normalized === '/search' || normalized.endsWith('/search')) {
    return 'search';
  }
  return 'home';
}

/** @deprecated Use canShowGlobalBanner + resolveBannerPlacement */
export function canShowBanner(pathname: string, placement: BannerPlacement): boolean {
  if (!canShowGlobalBanner(pathname)) return false;
  return resolveBannerPlacement(pathname) === placement;
}
