import React, { useRef } from 'react';
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
import { Play, Pause, SkipForward, X } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { usePlayerStore } from '@/stores/playerStore';
import { useGlobalVideo } from '@/contexts/VideoContext';
import { resolveNextVideoId } from '@/services/playbackQueue';
import { isLocalPlaybackUri, isRemotePlaybackUri } from '@/services/playbackSession';
import { Colors, Radius, Spacing, Typography, FontSizes } from '@/constants/theme';

export function MiniPlayer() {
  const pathname = usePathname();
  const isLoadingNextRef = useRef(false);
  const { miniPlayerVisible, hideMiniPlayer } = usePlayerStore();
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

  const isFullPlayerRoute = pathname.startsWith('/player/');
  const isVisible = !isFullPlayerRoute && miniPlayerVisible && !!currentTrack;

  if (!isVisible || !currentTrack) return null;

  const isLocalFile = isLocalPlaybackUri(currentTrack.fileUri);
  const isAudioOnly = !!currentTrack.isAudioOnly;
  const fullPlayerVideoId = !isAudioOnly ? currentTrack.id : null;
  const canOpenFullPlayer = !!fullPlayerVideoId && (isRemotePlaybackUri(currentTrack.fileUri) || isLocalFile);

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
      return;
    }

    play(currentTrack.fileUri, currentTrack).catch((err) => {
      if (__DEV__) console.warn('[MiniPlayer] toggle play failed', err);
    });
  };

  const handleClose = () => {
    void stop();
    hideMiniPlayer();
  };

  const progress = duration > 0
    ? Math.min(Math.max(position / duration, 0), 1)
    : 0;
  const isPreparing = isPlaying && status === 'loading';

  const openVideo = (videoId?: string | null) => {
    if (!videoId) return;
    router.navigate({ pathname: '/player/[id]', params: { id: videoId } });
  };

  const handleOpenPress = () => {
    openVideo(fullPlayerVideoId);
  };

  const handleNext = async () => {
    if (!fullPlayerVideoId || !isRemotePlaybackUri(currentTrack.fileUri) || isLoadingNextRef.current) return;
    isLoadingNextRef.current = true;
    try {
      const query = [currentTrack.author, currentTrack.title].filter(Boolean).join(' ');
      const nextVideoId = await resolveNextVideoId(fullPlayerVideoId, { query });
      if (!nextVideoId) {
        Alert.alert('No next video', 'No recommended video is available for this track.');
        return;
      }
      openVideo(nextVideoId);
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
          disabled={!canOpenFullPlayer}
          onPress={handleOpenPress}
          style={styles.openArea}
          activeOpacity={canOpenFullPlayer ? 0.8 : 1}
        >
          {currentTrack.thumbnail ? (
            <Image source={{ uri: currentTrack.thumbnail }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]} />
          )}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.author} numberOfLines={1}>{currentTrack.author}</Text>
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
          <TouchableOpacity
            disabled={!fullPlayerVideoId || isLocalFile}
            onPress={handleNext}
            style={styles.iconBtn}
            accessibilityLabel="Next video"
          >
            <SkipForward size={18} color={fullPlayerVideoId && !isLocalFile ? Colors.textSecondary : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={styles.iconBtn} accessibilityLabel="Close mini player">
            <X size={18} color={Colors.textMuted} />
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
