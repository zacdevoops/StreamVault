export const YOUTUBE_PLAYBACK_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  Referer: 'https://www.youtube.com/',
  Origin: 'https://www.youtube.com',
};

export function isYoutubePlaybackUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('googlevideo.com') ||
    lower.includes('youtube.com') ||
    lower.includes('ytimg.com') ||
    lower.includes('manifest.googlevideo.com')
  );
}

export function mergeYoutubePlaybackHeaders(
  url: string,
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!isYoutubePlaybackUrl(url)) return headers;
  return { ...YOUTUBE_PLAYBACK_HEADERS, ...headers };
}
