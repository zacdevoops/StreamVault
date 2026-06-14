import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useEventListener } from 'expo';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { globalVideoManager, type GlobalVideoSnapshot, type GlobalVideoTrack } from '@/services/GlobalVideoManager';

type VideoContextValue = GlobalVideoSnapshot & {
  player: VideoPlayer;
  play: (fileUri: string, track?: Partial<GlobalVideoTrack>) => Promise<void>;
  pause: () => void;
  stop: () => Promise<void>;
};

const VideoContext = createContext<VideoContextValue | null>(null);
const play = globalVideoManager.play.bind(globalVideoManager);
const pause = globalVideoManager.pause.bind(globalVideoManager);
const stop = globalVideoManager.stop.bind(globalVideoManager);

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(globalVideoManager.getSnapshot());
  const player = useVideoPlayer(null, (p: VideoPlayer) => {
    // Keep this hook source null forever so React creates exactly one native player.
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.audioMixingMode = 'doNotMix';
  });

  useEffect(() => {
    return () => {
      try {
        player.release();
      } catch {}
    };
  }, [player]);

  useEffect(() => {
    globalVideoManager.bindPlayer(player);
    return () => {
      globalVideoManager.unbindPlayer(player);
    };
  }, [player]);

  useEffect(() => {
    return () => {
      globalVideoManager.destroy();
    };
  }, []);

  useEffect(() => {
    // Context state is a subscription to the singleton, so non-React callers stay in sync too.
    return globalVideoManager.subscribe(setSnapshot);
  }, []);

  useEventListener(player, 'statusChange', ({ status, error }) => {
    globalVideoManager.handleStatusChange(status, error?.message);
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    globalVideoManager.handlePlayingChange(isPlaying);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    globalVideoManager.handleTimeUpdate(currentTime);
  });

  useEventListener(player, 'sourceLoad', ({ duration }) => {
    globalVideoManager.handleSourceLoad(duration);
  });

  useEventListener(player, 'playToEnd', () => {
    globalVideoManager.handlePlayToEnd();
  });

  const value = useMemo<VideoContextValue>(
    () => ({
      ...snapshot,
      player,
      play,
      pause,
      stop,
    }),
    [player, snapshot]
  );

  return <VideoContext.Provider value={value}>{children}</VideoContext.Provider>;
}

export function useGlobalVideo() {
  const value = useContext(VideoContext);
  if (!value) {
    throw new Error('useGlobalVideo must be used inside VideoProvider');
  }
  return value;
}
