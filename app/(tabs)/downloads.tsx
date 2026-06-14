import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { Download, Folder, Music2, Inbox as InboxIcon, ChevronDown, Play, Pause } from 'lucide-react-native';
import { useDownloadStore } from '@/stores/downloadStore';
import { deleteDownload, getAllDownloads, saveDownload } from '@/services/database';
import { DownloadItemRow } from '@/components/DownloadItem';
import { useGlobalVideo } from '@/contexts/VideoContext';
import { usePlayerStore } from '@/stores/playerStore';
import { Colors, Spacing, Typography, FontSizes, Radius } from '@/constants/theme';
import { DownloadItem } from '@/types';

const TABS = [
  { id: 'active', label: 'Downloading', icon: Download },
  { id: 'completed', label: 'Completed', icon: Folder },
  { id: 'audio', label: 'Audio Only', icon: Music2 },
];

const LIST_DRAW_DISTANCE = 900;
type VideoViewComponent = React.ComponentType<{
  player: unknown;
  style: unknown;
  fullscreenOptions?: { enable: boolean };
  allowsPictureInPicture?: boolean;
  startsPictureInPictureAutomatically?: boolean;
}>;

export default function DownloadsScreen() {
  const [activeTab, setActiveTab] = useState('completed');
  const [playingItem, setPlayingItem] = useState<DownloadItem | null>(null);
  const { downloads, removeDownload } = useDownloadStore();

  const loadDbDownloads = useCallback(async () => {
    const items = await getAllDownloads();
    // Hydrate the store in parallel — sequential filesystem stats blocked the JS thread
    // for users with many downloads. Each item is independent, so order does not matter.
    await Promise.all(items.map(async (item) => {
      const completedFile = item.status === 'completed'
        ? await FileSystem.getInfoAsync(item.filePath)
        : null;
      const hasInvalidCompletedFile =
        item.status === 'completed' && (!completedFile?.exists || completedFile.size < 1024);
      const wasInterrupted =
        item.status === 'downloading' || item.status === 'pending' || item.status === 'paused' ||
        hasInvalidCompletedFile;
      if (hasInvalidCompletedFile && completedFile?.exists) {
        await FileSystem.deleteAsync(item.filePath, { idempotent: true });
      }
      const normalizedItem = wasInterrupted
        ? {
            ...item,
            status: 'failed' as const,
            progress: 0,
            downloadedBytes: 0,
            errorMessage: hasInvalidCompletedFile
              ? 'Downloaded file was invalid. Download it again.'
              : 'Download interrupted. Restart download to continue.',
          }
        : item;

      // Do not touch items that are actively downloading in this session.
      // loadDbDownloads is designed to recover state from a *previous* app session;
      // overwriting a live entry here would flip its status to 'failed' and hide it
      // from every tab while the download is still running.
      const existingInStore = useDownloadStore.getState().downloads[normalizedItem.id];
      const isLive = existingInStore?.status === 'downloading';
      if (!isLive) {
        if (wasInterrupted) {
          await saveDownload(normalizedItem);
        }
        if (!existingInStore) {
          useDownloadStore.getState().addDownload(normalizedItem);
        } else {
          useDownloadStore.getState().updateDownload(normalizedItem.id, normalizedItem);
        }
      }
    }));
  }, []);

  useEffect(() => {
    let isMounted = true;
    void loadDbDownloads()
      .then(() => {
        if (!isMounted) return;
        // If a download is already running when the screen opens, show it immediately.
        const hasActive = Object.values(useDownloadStore.getState().downloads).some(
          (d) => d.status === 'downloading' || d.status === 'pending' || d.status === 'paused'
        );
        if (hasActive) setActiveTab('active');
      })
      .catch(() => {
        if (isMounted) {
          Alert.alert('Downloads unavailable', 'Your saved downloads could not be loaded.');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [loadDbDownloads]);

  const tabData = useMemo(() => {
    const items = Object.values(downloads);
    switch (activeTab) {
      case 'active': return items.filter((d) =>
        d.status === 'downloading' || d.status === 'pending' || d.status === 'paused' || d.status === 'failed'
      );
      case 'completed': return items.filter((d) => d.status === 'completed');
      case 'audio': return items.filter((d) => isAudioDownload(d) && d.status === 'completed');
      default: return [];
    }
  }, [activeTab, downloads]);

  useEffect(() => {
    // Warm the disk/memory cache for the current tab so recycled rows do not decode over scroll.
    // Prefetch failure is non-critical (rows will decode on demand) but must not be silently
    // swallowed — log in dev so regressions are visible during QA.
    Image.prefetch(
      tabData
        .slice(0, 60)
        .filter((item) => !!item.thumbnail)
        .map((item) => item.thumbnail),
      { cachePolicy: 'memory-disk' }
    ).catch((err) => {
      if (__DEV__) console.warn('[downloads] Image.prefetch failed', err);
    });
  }, [tabData]);

  const handleDelete = useCallback((item: DownloadItem) => {
    Alert.alert(
      'Delete Download',
      `Remove "${item.title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(item.filePath, { idempotent: true });
              await deleteDownload(item.id);
              removeDownload(item.id);
            } catch (err) {
              if (__DEV__) console.warn('[downloads] deleteDownload failed', err);
              Alert.alert(
                'Delete failed',
                'This download could not be removed. Try again.'
              );
            }
          },
        },
      ]
    );
  }, [removeDownload]);

  const handlePlayDownload = useCallback(async (item: DownloadItem) => {
    const filePath = await resolveExistingDownloadPath(item);
    if (!filePath) {
      Alert.alert(
        'File not found',
        'This download entry points to a file that is no longer on this device. Download it again to play it offline.',
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDownload(item.id);
                removeDownload(item.id);
              } catch (err) {
                if (__DEV__) console.warn('[downloads] deleteDownload failed', err);
                Alert.alert(
                  'Remove failed',
                  'This download could not be removed. Try again.'
                );
              }
            },
          },
        ]
      );
      return;
    }

    const playableItem = filePath === item.filePath ? item : { ...item, filePath };
    if (playableItem.filePath !== item.filePath) {
      useDownloadStore.getState().updateDownload(item.id, { filePath });
      try {
        await saveRecoveredDownloadPath(playableItem);
      } catch (err) {
        // The in-memory store already reflects the recovered path, so playback can continue.
        // Persistence failure means the path will be re-resolved on the next launch.
        if (__DEV__) console.warn('[downloads] saveRecoveredDownloadPath failed', err);
      }
    }
    // Local downloads become the active global track, so stale MiniPlayer metadata must stand down.
    usePlayerStore.getState().clearPlayer();
    setPlayingItem(playableItem);
  }, [removeDownload]);

  const allDownloads = useMemo(() => Object.values(downloads), [downloads]);
  const totalBytes = useMemo(
    () => allDownloads
      .filter((d) => d.status === 'completed')
      .reduce((sum, d) => sum + d.fileSize, 0),
    [allDownloads]
  );
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
  const keyExtractor = useCallback((item: DownloadItem) => item.id, []);
  const getItemType = useCallback((item: DownloadItem) => item.status, []);
  const renderItem = useCallback<ListRenderItem<DownloadItem>>(
    ({ item }) => (
      <DownloadItemRow
        item={item}
        onPlay={handlePlayDownload}
        onDelete={handleDelete}
      />
    ),
    [handleDelete, handlePlayDownload]
  );
  const listEmptyComponent = useMemo(
    () => (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <InboxIcon size={48} color={Colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>
          {activeTab === 'active' ? 'No active downloads' : 'No downloads yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {activeTab === 'active'
            ? 'Downloads will appear here while in progress'
            : 'Tap the download button on any video to save it offline'}
        </Text>
      </View>
    ),
    [activeTab]
  );
  const closePlayer = useCallback(() => setPlayingItem(null), []);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Downloads</Text>
        <View style={styles.storageBar}>
          <View style={styles.storageLabel}>
            <Text style={styles.storageText}>Storage used</Text>
            <Text style={styles.storageValue}>{totalMB} MB</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min((parseFloat(totalMB) / 4096) * 100, 100)}%` }]} />
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tab, isActive && styles.tabActive]}
              activeOpacity={0.8}
            >
              <Icon size={14} color={isActive ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlashList
        data={tabData}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        drawDistance={LIST_DRAW_DISTANCE}
        getItemType={getItemType}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ListEmptyComponent={listEmptyComponent}
      />
      <LocalDownloadPlayer item={playingItem} onClose={closePlayer} />
    </SafeAreaView>
  );
}

function isAudioDownload(item: DownloadItem): boolean {
  const format = String(item.format);
  return format === 'mp3_128' || format === 'mp3_320' || format === 'flac' || format === 'audio_best';
}

async function resolveExistingDownloadPath(item: DownloadItem): Promise<string | null> {
  try {
    const storedFile = await FileSystem.getInfoAsync(item.filePath);
    if (storedFile.exists) return item.filePath;
  } catch {}

  const fileName = decodeURIComponent(item.filePath.split('/').pop() ?? '');
  if (!fileName || !FileSystem.documentDirectory) return null;

  try {
    const currentUri = `${FileSystem.documentDirectory}StreamVault/${fileName}`;
    const currentFile = await FileSystem.getInfoAsync(currentUri);
    return currentFile.exists ? currentUri : null;
  } catch {
    return null;
  }
}

async function saveRecoveredDownloadPath(item: DownloadItem): Promise<void> {
  const { saveDownload } = await import('@/services/database');
  await saveDownload(item);
}

function LocalDownloadPlayer({
  item,
  onClose,
}: {
  item: DownloadItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.playerOverlay}>
        <View style={styles.playerSheet}>
          <PlayerHeader item={item} onClose={onClose} />
          {isAudioDownload(item) ? (
            <AudioDownloadPlayer item={item} />
          ) : (
            <VideoDownloadPlayer item={item} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function PlayerHeader({ item, onClose }: { item: DownloadItem; onClose: () => void }) {
  return (
    <View style={styles.playerHeader}>
      <View style={styles.playerTitleWrap}>
        <Text style={styles.playerTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.playerSubtitle} numberOfLines={1}>{item.author}</Text>
      </View>
      <TouchableOpacity onPress={onClose} style={styles.playerIconBtn}>
        <ChevronDown size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

function AudioDownloadPlayer({ item }: { item: DownloadItem }) {
  const { currentTrack, isPlaying, position, duration, status, error, play, pause, timedOut } = useGlobalVideo();
  const { author, filePath, format, id, thumbnail, title } = item;
  const track = useMemo(
    () => ({
      id,
      fileUri: filePath,
      title,
      author,
      thumbnail,
      isAudioOnly: ['mp3_128', 'mp3_320', 'flac', 'audio_best'].includes(String(format)),
    }),
    [author, filePath, format, id, thumbnail, title]
  );
  const isActiveTrack = currentTrack?.fileUri === item.filePath;
  const activeError = isActiveTrack ? error : null;
  const showRetry = isActiveTrack && (!!activeError || timedOut);

  useEffect(() => {
    // Mounting the sheet claims the singleton player, which automatically pauses any prior track.
    play(item.filePath, track).catch((err) => {
      if (__DEV__) console.warn('[downloads] audio play failed', err);
    });
    return () => {
      pause();
    };
  }, [item.filePath, play, track, pause]);

  const togglePlayback = () => {
    if (isActiveTrack && isPlaying) {
      pause();
    } else {
      play(item.filePath, track).catch((err) => {
        if (__DEV__) console.warn('[downloads] audio toggle play failed', err);
      });
    }
  };
  const retryPlayback = useCallback(() => {
    play(item.filePath, track).catch((err) => {
      if (__DEV__) console.warn('[downloads] audio retry play failed', err);
    });
  }, [item.filePath, play, track]);

  const isLoading = isActiveTrack && status === 'loading' && !activeError;

  return (
    <>
      <View style={styles.audioStage}>
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.gold} />
        ) : (
          <Music2 size={48} color={activeError ? Colors.error : Colors.gold} />
        )}
        {activeError ? <Text style={styles.localErrorText}>{activeError}</Text> : null}
        {showRetry ? <RetryButton onPress={retryPlayback} /> : null}
        {!activeError && isActiveTrack && duration > 0 ? (
          <Text style={styles.audioTime}>
            {formatSeconds(position)} / {formatSeconds(duration)}
          </Text>
        ) : null}
      </View>
      <PlayerButton
        isPlaying={isActiveTrack && isPlaying}
        disabled={!!activeError}
        onPress={togglePlayback}
      />
    </>
  );
}

function VideoDownloadPlayer({ item }: { item: DownloadItem }) {
  const { player, currentTrack, isPlaying, status, error, play, pause, timedOut } = useGlobalVideo();
  const [VideoViewComponent, setVideoViewComponent] = useState<VideoViewComponent | null>(null);
  const { author, filePath, format, id, thumbnail, title } = item;
  const track = useMemo(
    () => ({
      id,
      fileUri: filePath,
      title,
      author,
      thumbnail,
      isAudioOnly: ['mp3_128', 'mp3_320', 'flac', 'audio_best'].includes(String(format)),
    }),
    [author, filePath, format, id, thumbnail, title]
  );
  const isActiveTrack = currentTrack?.fileUri === item.filePath;
  const activeError = isActiveTrack ? error : null;
  const showRetry = isActiveTrack && (!!activeError || timedOut);

  useEffect(() => {
    let isMounted = true;
    void import('expo-video').then((module) => {
      if (isMounted) setVideoViewComponent(() => module.VideoView as VideoViewComponent);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // VideoView receives the existing player; only the source changes inside the manager.
    play(item.filePath, track).catch((err) => {
      if (__DEV__) console.warn('[downloads] video play failed', err);
    });
    return () => {
      pause();
    };
  }, [item.filePath, play, track, pause]);

  const togglePlayback = () => {
    if (isActiveTrack && isPlaying) {
      pause();
    } else {
      play(item.filePath, track).catch((err) => {
        if (__DEV__) console.warn('[downloads] video toggle play failed', err);
      });
    }
  };
  const retryPlayback = useCallback(() => {
    play(item.filePath, track).catch((err) => {
      if (__DEV__) console.warn('[downloads] video retry play failed', err);
    });
  }, [item.filePath, play, track]);

  return (
    <>
      <View style={styles.localVideoWrap}>
        {VideoViewComponent ? (
          <VideoViewComponent
            player={player}
            style={styles.localVideo}
            fullscreenOptions={{ enable: true }}
            allowsPictureInPicture
            startsPictureInPictureAutomatically
          />
        ) : null}
        {((isActiveTrack && status === 'loading') || activeError) ? (
          <View style={styles.localVideoError}>
            {isActiveTrack && status === 'loading' && !activeError ? (
              <ActivityIndicator size="large" color={Colors.accent} />
            ) : (
              <>
                <Text style={styles.localErrorText}>{activeError}</Text>
                {showRetry ? <RetryButton onPress={retryPlayback} /> : null}
              </>
            )}
          </View>
        ) : null}
      </View>
      <PlayerButton
        isPlaying={isActiveTrack && isPlaying}
        disabled={!!activeError}
        onPress={togglePlayback}
      />
    </>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.retryBtn}>
      <Text style={styles.retryText}>Retry</Text>
    </TouchableOpacity>
  );
}

function PlayerButton({
  isPlaying,
  disabled,
  onPress,
}: {
  isPlaying: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.playerPlayBtn, disabled && styles.playerPlayBtnMuted]}
      disabled={disabled}
    >
      {isPlaying ? (
        <Pause size={22} color={Colors.textPrimary} />
      ) : (
        <Play size={22} color={Colors.textPrimary} />
      )}
      <Text style={styles.playerPlayText}>{isPlaying ? 'Pause' : 'Play'}</Text>
    </TouchableOpacity>
  );
}

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  header: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xxl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  storageBar: {
    gap: 6,
  },
  storageLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  storageValue: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.sm,
    color: Colors.gold,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
  },
  tabs: {
    flexDirection: 'row',
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.accentSoft,
    borderColor: Colors.accent,
  },
  tabText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  tabTextActive: {
    fontFamily: Typography.display,
    color: Colors.accent,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: Radius.xl,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Typography.body,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  playerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  playerSheet: {
    backgroundColor: Colors.bgSurface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  playerTitleWrap: {
    flex: 1,
  },
  playerTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  playerSubtitle: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  playerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
  },
  localVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    backgroundColor: '#000',
  },
  localVideoWrap: {
    position: 'relative',
  },
  localVideoError: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  audioStage: {
    height: 180,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  localErrorText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 34,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.accent,
  },
  retryText: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  audioTime: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  playerPlayBtn: {
    height: 48,
    borderRadius: Radius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
  },
  playerPlayBtnMuted: {
    opacity: 0.5,
  },
  playerPlayText: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
});
