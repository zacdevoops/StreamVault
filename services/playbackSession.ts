import type { GlobalVideoTrack } from '@/services/GlobalVideoManager';

export function normalizeVideoId(id?: string | null): string | null {
  const trimmed = id?.trim();
  return trimmed || null;
}

export function isSameVideoId(a?: string | null, b?: string | null): boolean {
  const left = normalizeVideoId(a);
  const right = normalizeVideoId(b);
  return !!left && !!right && left === right;
}

export function playerRouteVideoId(pathname: string): string | null {
  const match = pathname.match(/^\/player\/([^/?]+)/);
  const segment = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (!segment || segment === 'local') return null;
  return segment;
}

export function isRemotePlaybackUri(uri?: string | null): boolean {
  return !!uri && (uri.startsWith('http://') || uri.startsWith('https://'));
}

export function isLocalPlaybackUri(uri?: string | null): boolean {
  return !!uri && !isRemotePlaybackUri(uri);
}

export function isSameVideoSession(
  current: GlobalVideoTrack | null | undefined,
  next: GlobalVideoTrack | null | undefined,
): boolean {
  if (!current || !next) return false;
  if (!!current.fileUri && current.fileUri === next.fileUri) return true;
  if (isRemotePlaybackUri(current.fileUri) !== isRemotePlaybackUri(next.fileUri)) return false;
  if (isSameVideoId(current.id, next.id)) return true;
  if (normalizeVideoId(current.id) || normalizeVideoId(next.id)) return false;
  return false;
}
