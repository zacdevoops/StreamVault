import type { QueryClient } from '@tanstack/react-query';
import { getRecommendedVideos } from '@/services/api';
import type { VideoDetail, VideoResult } from '@/types';
import type { GlobalVideoTrack } from '@/services/GlobalVideoManager';

export function resolveActiveVideoId(track: GlobalVideoTrack | null | undefined): string | null {
  const videoId = track?.id?.trim();
  return videoId || null;
}

export function isStreamVaultAutoNextEligible(track: GlobalVideoTrack | null | undefined): boolean {
  if (!track || track.isAudioOnly) return false;
  if (!track.fileUri.startsWith('http://') && !track.fileUri.startsWith('https://')) return false;
  return Boolean(resolveActiveVideoId(track));
}

export function pickNextVideoId(currentVideoId: string, candidates: VideoResult[]): string | null {
  const next = candidates.find((item) => item.videoId && item.videoId !== currentVideoId);
  return next?.videoId ?? null;
}

export function getCachedRecommendations(queryClient: QueryClient, videoId: string): VideoResult[] {
  const detail = queryClient.getQueryData<VideoDetail>(['video', videoId]);
  if (detail?.recommendedVideos?.length) return detail.recommendedVideos;

  const relatedQueries = queryClient.getQueriesData<VideoResult[]>({
    queryKey: ['relatedVideos', videoId],
  });
  for (const [, data] of relatedQueries) {
    if (data?.length) return data;
  }

  return [];
}

export async function resolveNextVideoId(
  currentVideoId: string,
  options: {
    candidates?: VideoResult[];
    query?: string;
  } = {}
): Promise<string | null> {
  const cachedNext = options.candidates?.length
    ? pickNextVideoId(currentVideoId, options.candidates)
    : null;
  if (cachedNext) return cachedNext;

  const recommendations = await getRecommendedVideos(currentVideoId, options.query ?? '');
  return pickNextVideoId(currentVideoId, recommendations);
}
