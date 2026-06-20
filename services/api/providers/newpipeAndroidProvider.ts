import type { DownloadFormat, SearchParams, VideoDetail, VideoResult } from '@/types';
import type { ResolvedDownloadStream } from '@/services/api/apiTypes';
import {
  getFeed as getNativeFeed,
  getVideoDetail as getNativeVideoDetail,
  isStreamVaultNewPipeAvailable,
  resolveDownloadStream as resolveNativeDownloadStream,
  searchVideos as searchNativeVideos,
} from 'streamvault-newpipe';

const NEWPIPE_DOWNLOAD_FORMATS = new Set<DownloadFormat>(['mp4_360p', 'mp4_720p']);

export async function getVideoDetail(videoId: string): Promise<VideoDetail | null> {
  if (!isStreamVaultNewPipeAvailable()) {
    return null;
  }

  try {
    return await getNativeVideoDetail(videoId);
  } catch (error) {
    if (__DEV__) {
      console.warn('[newpipe] getVideoDetail failed', error);
    }
    return null;
  }
}

export async function searchVideos(params: SearchParams): Promise<VideoResult[]> {
  if (!isStreamVaultNewPipeAvailable()) {
    return [];
  }

  const searchType = params.type ?? 'video';
  if (searchType !== 'video' && searchType !== 'music') {
    return [];
  }

  try {
    return await searchNativeVideos({
      query: params.query,
      type: searchType,
      page: params.page ?? 1,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[newpipe] searchVideos failed', error);
    }
    return [];
  }
}

export async function getCategoryFeed(category: string, region: string, limit: number): Promise<VideoResult[]> {
  if (!isStreamVaultNewPipeAvailable()) {
    return [];
  }

  try {
    return await getNativeFeed({ category, region, limit });
  } catch (error) {
    if (__DEV__) {
      console.warn('[newpipe] getCategoryFeed failed', error);
    }
    return [];
  }
}

export async function resolveDownloadStream(
  videoId: string,
  format: DownloadFormat
): Promise<ResolvedDownloadStream | null> {
  if (!isStreamVaultNewPipeAvailable() || !NEWPIPE_DOWNLOAD_FORMATS.has(format)) {
    return null;
  }

  try {
    return await resolveNativeDownloadStream(videoId, format as 'mp4_360p' | 'mp4_720p');
  } catch (error) {
    if (__DEV__) {
      console.warn('[newpipe] resolveDownloadStream failed', error);
    }
    return null;
  }
}
