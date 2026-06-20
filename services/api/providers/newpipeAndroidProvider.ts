import type { VideoDetail } from '@/types';
import { getVideoDetail as getNativeVideoDetail, isStreamVaultNewPipeAvailable } from 'streamvault-newpipe';

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
