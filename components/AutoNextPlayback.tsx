import { useCallback, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { globalVideoManager } from '@/services/GlobalVideoManager';
import {
  getCachedRecommendations,
  isStreamVaultAutoNextEligible,
  resolveActiveVideoId,
  resolveNextVideoId,
} from '@/services/playbackQueue';

export function AutoNextPlayback() {
  const queryClient = useQueryClient();
  const isAdvancingRef = useRef(false);

  const advanceToNextVideo = useCallback(async () => {
    if (isAdvancingRef.current) return;

    const track = globalVideoManager.getSnapshot().currentTrack;
    if (!isStreamVaultAutoNextEligible(track)) return;

    const currentVideoId = resolveActiveVideoId(track);
    if (!currentVideoId) return;

    isAdvancingRef.current = true;
    try {
      const candidates = getCachedRecommendations(queryClient, currentVideoId);
      const searchQuery = [track?.author, track?.title].filter(Boolean).join(' ');
      const nextVideoId = await resolveNextVideoId(currentVideoId, {
        candidates,
        query: searchQuery,
      });
      if (!nextVideoId || nextVideoId === currentVideoId) return;

      router.replace({ pathname: '/player/[id]', params: { id: nextVideoId } });
    } finally {
      isAdvancingRef.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    globalVideoManager.setPlayToEndHandler(() => {
      void advanceToNextVideo();
    });
    return () => globalVideoManager.setPlayToEndHandler(null);
  }, [advanceToNextVideo]);

  return null;
}
