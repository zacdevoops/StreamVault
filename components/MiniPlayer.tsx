import React, { useEffect, useRef } from 'react';
import {
  Alert,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Play, Pause, SkipForward, ChevronDown } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { usePlayerStore } from '@/stores/playerStore';
import { useGlobalVideo } from '@/contexts/VideoContext';
import { getRecommendedVideos } from '@/services/api';
import { Colors, Radius, Spacing, Typography, FontSizes } from '@/constants/theme';

export function MiniPlayer() {
  const pathname = usePathname();
  const isLoadingNextRef = useRef(false);
  const { player, miniPlayerVisible, updatePlayer, hideMiniPlayer } = usePlayerStore();
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    status,
    play,
    pause,
    stop,
  } = useGlobalVideo();

  useEffect(() => {
    if (!player?.audioUrl) return;

    if (player.isPlaying) {
      // Legacy store updates are translated into manager commands so MiniPlayer never owns audio.
      play(player.audioUrl, {
        id: player.videoId ?? player.audioUrl,
        title: player.title,
        author: player.author,
        thumbnail: player.thumbnail,
        isAudioOnly: true,
      }).catch((err) => {
        if (__DEV__) console.warn('[MiniPlayer] play failed', err);
      });
    } else if (isPlaying && currentTrack?.fileUri === player.audioUrl) {
      pause();
    }
  }, [
    currentTrack?.fileUri,
    isPlaying,
    pause,
    play,
    player?.audioUrl,
    player?.author,
    player?.isPlaying,
    player?.thumbnail,
    player?.title,
    player?.videoId,
  ]);

  useEffect(() => {
    if (!player?.audioUrl || currentTrack?.fileUri !== player.audioUrl) return;
    // Keep the existing store as display metadata for older callers while playback state is global.
    updatePlayer({
      position,
      duration: duration || player.duration,
      isPlaying,
    });
  }, [
    currentTrack?.fileUri,
    duration,
    isPlaying,
    player?.audioUrl,
    player?.duration,
    position,
    updatePlayer,
  ]);

  const displayTrack = currentTrack ?? (
    player
      ? {
          fileUri: player.audioUrl ?? '',
          title: player.title,
          author: player.author,
          thumbnail: player.thumbnail,
        }
      : null
  );
  const isFullPlayerRoute = pathname.startsWith('/player/');
  // The MiniPlayer is a collapsed control surface, not a second player surface.
  // While the full player route is visible, hiding MiniPlayer prevents duplicate controls/audio intent.
  const isVisible = !isFullPlayerRoute && (miniPlayerVisible || !!currentTrack);

  if (!isVisible || !displayTrack) return null;

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
      if (player?.audioUrl === displayTrack.fileUri) updatePlayer({ isPlaying: false });
      return;
    }

    // Replaying the same URI resumes the existing native player instead of constructing a new one.
    play(displayTrack.fileUri, displayTrack).catch((err) => {
      if (__DEV__) console.warn('[MiniPlayer] toggle play failed', err);
    });
    if (player?.audioUrl === displayTrack.fileUri) updatePlayer({ isPlaying: true });
  };

  const handleDismiss = () => {
    // Dismissal stops the shared player so hidden MiniPlayer audio cannot keep running.
    stop().catch((err) => {
      if (__DEV__) console.warn('[MiniPlayer] stop failed', err);
    });
    hideMiniPlayer();
  };
  const activeDuration = duration || player?.duration || 0;
  const activePosition = position || player?.position || 0;
  const progress = activeDuration > 0
    ? Math.min(Math.max(activePosition / activeDuration, 0), 1)
    : 0;
  const isPreparing = isPlaying && status === 'loading';
  const activeVideoId = currentTrack?.fileUri.startsWith('http')
    ? currentTrack.id
    : player?.videoId;
  const openVideo = (videoId?: string | null) => {
    if (!videoId) return;
    router.push({ pathname: '/player/[id]', params: { id: videoId } });
  };
  const handleNext = async () => {
    if (!activeVideoId || isLoadingNextRef.current) return;
    isLoadingNextRef.current = true;
    try {
      const query = [displayTrack.author, displayTrack.title].filter(Boolean).join(' ');
      const recommendations = await getRecommendedVideos(activeVideoId, query);
      const nextVideo = recommendations.find((item) => item.videoId && item.videoId !== activeVideoId);
      if (!nextVideo) {
        Alert.alert('No next video', 'No recommended video is available for this track.');
        return;
      }
      openVideo(nextVideo.videoId);
    } catch (err) {
      if (__DEV__) console.warn('[MiniPlayer] handleNext failed', err);
      Alert.alert('No next video', 'Unable to load a recommended video right now.');
    } finally {
      isLoadingNextRef.current = false;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressLine}>
        <View
          style={[
            styles.progressFill,
            { flex: progress },
          ]}
        />
        <View style={{ flex: 1 - progress }} />
      </View>
      <View style={styles.content}>
        <TouchableOpacity
          disabled={!activeVideoId}
          onPress={() => openVideo(activeVideoId)}
          style={styles.openArea}
          activeOpacity={0.8}
        >
          {displayTrack.thumbnail ? (
            <Image source={{ uri: displayTrack.thumbnail }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]} />
          )}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{displayTrack.title}</Text>
            <Text style={styles.author} numberOfLines={1}>{displayTrack.author}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.controls}>
          <TouchableOpacity onPress={handlePlayPause} style={styles.playBtn}>
            {isPreparing ? (
              <ActivityIndicator size="small" color={Colors.textPrimary} />
            ) : isPlaying ? (
              <Pause size={20} color={Colors.textPrimary} />
            ) : (
              <Play size={20} color={Colors.textPrimary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity disabled={!activeVideoId} onPress={handleNext} style={styles.iconBtn}>
            <SkipForward size={18} color={activeVideoId ? Colors.textSecondary : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDismiss} style={styles.iconBtn}>
            <ChevronDown size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 82 : 60,
    left: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
    // Android can render an absolute view above content while still letting lower rows win touches.
    // A high zIndex keeps MiniPlayer controls as the top interactive surface across tabs/routes.
    zIndex: 1000,
  },
  progressLine: {
    height: 2,
    backgroundColor: Colors.bgCard,
    flexDirection: 'row',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
    height: 60,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    resizeMode: 'cover',
  },
  thumbFallback: {
    backgroundColor: Colors.bgCard,
  },
  info: {
    flex: 1,
  },
  openArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  author: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
