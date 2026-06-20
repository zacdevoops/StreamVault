import type { SearchParams, VideoDetail, VideoResult } from '@/types';
import {
  getFeed as getNativeFeed,
  getVideoDetail as getNativeVideoDetail,
  isStreamVaultNewPipeAvailable,
  searchVideos as searchNativeVideos,
} from 'streamvault-newpipe';

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
