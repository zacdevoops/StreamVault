import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Platform,
  BackHandler,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft,
  Download,
  Share2,
  Heart,
  Bookmark,
  ChevronRight,
  ThumbsUp,
  Eye,
  Calendar,
  AlertTriangle,
} from 'lucide-react-native';
import {
  getVideoDetail,
  getBestThumbnail,
  formatViewCount,
  getRecommendedVideos,
  resolveDownloadStream,
} from '@/services/api';
import { FormatPicker } from '@/components/FormatPicker';
import { VideoCard } from '@/components/VideoCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { useLibraryStore } from '@/stores/libraryStore';
import { saveToHistory, saveLiked, deleteLiked, saveSaved, deleteSaved, saveDownload } from '@/services/database';
import { Colors, Spacing, Typography, FontSizes, Radius } from '@/constants/theme';
import { DownloadFormat, DownloadItem, VideoDetail, VideoStream } from '@/types';
import { useDownloadStore } from '@/stores/downloadStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useConfigStore } from '@/stores/configStore';
import { useGlobalVideo } from '@/contexts/VideoContext';
import { type GlobalVideoTrack } from '@/services/GlobalVideoManager';

type VideoViewComponent = React.ComponentType<{
  player: unknown;
  style: unknown;
  surfaceType?: 'textureView';
  fullscreenOptions?: { enable: boolean };
  allowsPictureInPicture?: boolean;
  startsPictureInPictureAutomatically?: boolean;
}>;

const FORMAT_HEIGHT: Partial<Record<DownloadFormat, number>> = {
  mp4_360p: 360,
  mp4_720p: 720,
  mp4_1080p: 1080,
  mp4_4k: 2160,
};

const PLAYER_TIMEOUT_MS = 75_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function isAudioFormat(format: DownloadFormat): boolean {
  return ['mp3_128', 'mp3_320', 'flac'].includes(format);
}

function streamHeight(stream: VideoStream): number {
  const match = stream.qualityLabel?.match(/(\d+)p/) ?? stream.quality?.match(/(\d+)p/);
  return match ? Number(match[1]) : 0;
}

function streamBitrate(stream: VideoStream): number {
  return stream.bitrate || Number(stream.size) || 0;
}

function isLikelyAudioStream(stream: VideoStream): boolean {
  if (!stream.url) return false;
  const descriptor = [
    stream.type,
    stream.container,
    stream.encoding,
    stream.quality,
    stream.qualityLabel,
  ]
    .join(' ')
    .toLowerCase();
  const hasVideoCodec = /(avc|h264|h265|hevc|vp8|vp9|av01)/i.test(stream.encoding);
  const hasAudioHint = /(audio|m4a|mp3|aac|opus|vorbis|weba)/i.test(descriptor);
  return hasAudioHint && !hasVideoCodec && streamHeight(stream) === 0;
}

function isProgressiveMuxedStream(stream: VideoStream): boolean {
  if (!stream.url || isLikelyAudioStream(stream)) return false;
  const url = stream.url.toLowerCase();
  if (url.includes('.m3u8') || url.includes('.mpd')) return false;
  const descriptor = [stream.type, stream.container, stream.encoding].join(' ').toLowerCase();
  if (descriptor.includes('mpegurl') || descriptor.includes('dash')) return false;
  return streamHeight(stream) > 0;
}

function selectFallbackStream(video: VideoDetail, format: DownloadFormat): VideoStream | null {
  if (isAudioFormat(format)) {
    const targetBitrate = format === 'mp3_128' ? 128_000 : 320_000;
    const audioStreams = video.adaptiveFormats
      .filter((stream) => stream.url)
      .sort((a, b) => {
        const aScore = Math.abs(streamBitrate(a) - targetBitrate);
        const bScore = Math.abs(streamBitrate(b) - targetBitrate);
        return aScore - bScore;
      });
    return audioStreams[0] ?? null;
  }

  const targetHeight = FORMAT_HEIGHT[format] ?? 720;
  const muxedStreams = video.formatStreams.filter((stream) => isProgressiveMuxedStream(stream));
  const candidates =
    format === 'mp4_720p'
      ? muxedStreams.filter((stream) => streamHeight(stream) === targetHeight)
      : muxedStreams.filter((stream) => {
          const height = streamHeight(stream);
          return height > 0 && height <= targetHeight;
        });

  return (
    candidates.sort((a, b) => {
      const aHeight = streamHeight(a);
      const bHeight = streamHeight(b);
      return bHeight - aHeight;
    })[0] ?? null
  );
}

function extensionForDownload(format: DownloadFormat, container?: string): string {
  if (container) return container.replace(/^\./, '').split(';')[0] || 'mp4';
  if (format === 'flac') return 'flac';
  if (format === 'mp3_128' || format === 'mp3_320') return 'm4a';
  return 'mp4';
}

function selectPlaybackStream(video: VideoDetail): VideoStream | null {
  return [...video.formatStreams, ...video.adaptiveFormats]
    .filter((stream) => !!stream.url && !isLikelyAudioStream(stream))
    .sort((a, b) => {
      const aHeight = streamHeight(a);
      const bHeight = streamHeight(b);
      if (aHeight !== bHeight) return bHeight - aHeight;
      return streamBitrate(b) - streamBitrate(a);
    })[0] ?? null;
}

function contentTypeFromStream(url: string, stream: VideoStream | null): GlobalVideoTrack['contentType'] {
  const descriptor = [stream?.type, stream?.container, stream?.encoding, stream?.quality]
    .join(' ')
    .toLowerCase();
  if (url.includes('.m3u8') || descriptor.includes('hls') || descriptor.includes('mpegurl')) return 'hls';
  if (url.includes('.mpd') || descriptor.includes('dash')) return 'dash';
  return 'progressive';
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [activeDownloadFormat, setActiveDownloadFormat] = useState<DownloadFormat | null>(null);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [VideoViewComponent, setVideoViewComponent] = useState<VideoViewComponent | null>(null);
  const isStartingDownloadRef = useRef(false);
  const isMountedRef = useRef(true);
  const activeDownloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  const { addToHistory, isLiked, isSaved, toggleLike, toggleSave } = useLibraryStore();
  const { addDownload, updateDownload } = useDownloadStore();
  const showDownloadButton = useConfigStore((state) => state.showDownloadButton);
  const downloadsEnabled = useConfigStore((state) => state.downloadsEnabled);
  const { clearPlayer } = usePlayerStore();
  const {
    player,
    currentTrack,
    status: globalPlayerStatus,
    error: globalPlayerError,
    timedOut: globalPlayerTimedOut,
    play,
  } = useGlobalVideo();

  const {
    data: video,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['video', id],
    queryFn: async () => {
      const detail = await withTimeout(
        getVideoDetail(id!),
        PLAYER_TIMEOUT_MS,
        'Server is not responding. Check your connection or restart the backend.'
      );
      if (!detail) {
        throw new Error('Unable to load this video. The source is unavailable.');
      }
      return detail;
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnMount: 'always',
  });

  const playbackStream = useMemo(() => (video ? selectPlaybackStream(video) : null), [video]);
  const streamUrl = video?.hlsUrl ?? playbackStream?.url ?? '';
  const playbackVideoId = video?.videoId ?? '';
  const playbackTitle = video?.title;
  const playbackAuthor = video?.author;
  const playbackThumbnails = video?.videoThumbnails;
  const playbackHeaders = useMemo(() => {
    if (!video || !streamUrl) return playbackStream?.headers;
    return [...video.formatStreams, ...video.adaptiveFormats]
      .find((stream) => stream.url === streamUrl)?.headers ?? playbackStream?.headers;
  }, [playbackStream, streamUrl, video]);
  const playbackThumbnail = useMemo(
    () => getBestThumbnail(playbackThumbnails ?? []),
    [playbackThumbnails]
  );
  const relatedVideoId = video?.videoId ?? '';
  const relatedQuery = video ? [video.author, video.title].filter(Boolean).join(' ') : '';
  const { data: fallbackRelatedVideos, isLoading: relatedLoading } = useQuery({
    queryKey: ['relatedVideos', relatedVideoId, relatedQuery],
    queryFn: () => getRecommendedVideos(relatedVideoId, relatedQuery),
    enabled: !!relatedVideoId && (video?.recommendedVideos.length ?? 0) === 0,
    staleTime: 10 * 60 * 1000,
  });
  const relatedVideos = (video?.recommendedVideos.length ?? 0) > 0
    ? video?.recommendedVideos ?? []
    : fallbackRelatedVideos ?? [];
  const playbackTrack = useMemo<GlobalVideoTrack | null>(() => {
    if (!playbackVideoId || !streamUrl) return null;
    return {
      id: playbackVideoId,
      fileUri: streamUrl,
      title: playbackTitle,
      author: playbackAuthor,
      thumbnail: playbackThumbnail,
      isAudioOnly: false,
      contentType: contentTypeFromStream(streamUrl, playbackStream),
      headers: playbackHeaders,
    };
  }, [playbackAuthor, playbackHeaders, playbackStream, playbackThumbnail, playbackTitle, playbackVideoId, streamUrl]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear the ref so no stale handle is held after unmount.
      // Downloads are native tasks and intentionally continue running after
      // navigation — do not call pauseAsync() here.
      activeDownloadRef.current = null;
    };
  }, []);

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
    clearPlayer();
  }, [clearPlayer, id]);

  useEffect(() => {
    const nextTrack = playbackTrack;
    if (!nextTrack) return;

    // The full player and MiniPlayer share the provider-owned singleton player.
    // Starting here replaces any previous source, but leaving this route must not stop playback:
    // route visibility decides which surface controls the same active player.
    clearPlayer();
    play(nextTrack.fileUri, nextTrack).catch((err) => {
      if (__DEV__) console.warn('[player] play() failed', err);
    });
  }, [clearPlayer, play, playbackTrack]);

  useEffect(() => {
    if (video && id) {
      const thumbnail = getBestThumbnail(video.videoThumbnails ?? []);
      addToHistory({
        videoId: video.videoId,
        title: video.title,
        author: video.author,
        thumbnail,
        lengthSeconds: video.lengthSeconds,
        watchProgress: 0,
      });
      void saveToHistory({
        id: video.videoId,
        videoId: video.videoId,
        title: video.title,
        author: video.author,
        thumbnail,
        lengthSeconds: video.lengthSeconds,
        watchedAt: Date.now(),
        watchProgress: 0,
        type: 'history',
      }).catch(() => {
        if (isMountedRef.current) {
          Alert.alert('History unavailable', 'This video could not be saved to your watch history.');
        }
      });
      setLiked(isLiked(video.videoId));
      setSaved(isSaved(video.videoId));
    }
  }, [video, id, addToHistory, isLiked, isSaved]);

  const handleDownload = async (format: DownloadFormat) => {
    if (!video || isStartingDownloadRef.current || !downloadsEnabled) return;
    isStartingDownloadRef.current = true;
    setActiveDownloadFormat(format);
    setShowFormatPicker(false);

    try {
      if (!FileSystem.documentDirectory) {
        throw new Error('Device storage is unavailable.');
      }

      const backendStream = await resolveDownloadStream(video.videoId, format);
      const fallbackStream = backendStream ? null : selectFallbackStream(video, format);
      const streamUrl = backendStream?.url ?? fallbackStream?.url;
      const downloadHeaders = backendStream?.headers ?? fallbackStream?.headers;
      const ext = extensionForDownload(format, backendStream?.ext ?? fallbackStream?.container);
      const fileName = `${video.videoId}_${format}.${ext}`;
      const dirUri = `${FileSystem.documentDirectory}StreamVault`;
      const filePath = `${dirUri}/${fileName}`;

      const thumbnail = getBestThumbnail(video.videoThumbnails ?? []);
      const downloadItem: DownloadItem = {
        id: `${video.videoId}_${format}`,
        videoId: video.videoId,
        title: video.title,
        author: video.author,
        thumbnail,
        format,
        filePath,
        fileSize: 0,
        downloadedBytes: 0,
        status: 'downloading' as const,
        progress: 0,
        timestamp: Date.now(),
      };

      addDownload(downloadItem);
      await saveDownload(downloadItem);

      if (!streamUrl) {
        const message = 'No downloadable stream is available for this format.';
        const failedItem: DownloadItem = {
          ...downloadItem,
          status: 'failed',
          errorMessage: message,
        };
        updateDownload(downloadItem.id, failedItem);
        await saveDownload(failedItem);
        if (isMountedRef.current) {
          Alert.alert('Download failed', message);
        }
        return;
      }

      try {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
        updateDownload(downloadItem.id, { progress: 0.05 });
        const resumable = FileSystem.createDownloadResumable(
          streamUrl,
          filePath,
          downloadHeaders ? { headers: downloadHeaders } : {},
          ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
            if (!isMountedRef.current) return;
            if (totalBytesExpectedToWrite <= 0) return;
            updateDownload(downloadItem.id, {
              downloadedBytes: totalBytesWritten,
              progress: Math.max(0.05, Math.min(totalBytesWritten / totalBytesExpectedToWrite, 0.98)),
            });
          }
        );
        activeDownloadRef.current = resumable;
        const downloadedFile = await resumable.downloadAsync();
        if (!downloadedFile?.uri || downloadedFile.status < 200 || downloadedFile.status >= 300) {
          throw new Error(`Download failed with status ${downloadedFile?.status ?? 'unknown'}.`);
        }
        const fileInfo = await FileSystem.getInfoAsync(downloadedFile.uri);
        const fileSize = fileInfo.exists ? fileInfo.size ?? 0 : 0;
        const completedItem: DownloadItem = {
          ...downloadItem,
          filePath: downloadedFile.uri,
          status: 'completed',
          progress: 1,
          fileSize,
          downloadedBytes: fileSize,
        };
        updateDownload(downloadItem.id, completedItem);
        await saveDownload(completedItem);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        const failedItem: DownloadItem = {
          ...downloadItem,
          status: 'failed',
          errorMessage: message,
        };
        updateDownload(downloadItem.id, failedItem);
        await saveDownload(failedItem);
        if (isMountedRef.current) {
          Alert.alert('Download failed', message);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        Alert.alert('Download failed', err instanceof Error ? err.message : 'Unable to start download.');
      }
    } finally {
      activeDownloadRef.current = null;
      isStartingDownloadRef.current = false;
      if (isMountedRef.current) setActiveDownloadFormat(null);
    }
  };

  const handleLike = async () => {
    if (!video) return;
    const thumbnail = getBestThumbnail(video.videoThumbnails ?? []);
    const item = {
      videoId: video.videoId, title: video.title, author: video.author,
      thumbnail, lengthSeconds: video.lengthSeconds, watchProgress: 0,
    };
    toggleLike(item);
    const nowLiked = !liked;
    setLiked(nowLiked);
    try {
      if (nowLiked) {
        await saveLiked({ ...item, id: video.videoId, type: 'liked', watchedAt: Date.now() });
      } else {
        await deleteLiked(video.videoId);
      }
    } catch {
      toggleLike(item);
      setLiked(!nowLiked);
      Alert.alert('Library unavailable', 'Your like could not be saved.');
    }
  };

  const handleSave = async () => {
    if (!video) return;
    const thumbnail = getBestThumbnail(video.videoThumbnails ?? []);
    const item = {
      videoId: video.videoId, title: video.title, author: video.author,
      thumbnail, lengthSeconds: video.lengthSeconds, watchProgress: 0,
    };
    toggleSave(item);
    const nowSaved = !saved;
    setSaved(nowSaved);
    try {
      if (nowSaved) {
        await saveSaved({ ...item, id: video.videoId, type: 'saved', watchedAt: Date.now() });
      } else {
        await deleteSaved(video.videoId);
      }
    } catch {
      toggleSave(item);
      setSaved(!nowSaved);
      Alert.alert('Library unavailable', 'Your bookmark could not be saved.');
    }
  };

  const handleBack = useCallback(() => {
    // Back only changes the visible route. The global player keeps the active source,
    // and MiniPlayer appears automatically once /player/[id] is no longer focused.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  const thumbnail = video ? getBestThumbnail(video.videoThumbnails ?? []) : '';
  const queryErrorMessage =
    error instanceof Error
      ? error.message
      : 'Unable to play this video right now.';
  const showQueryError = isError || (!isLoading && !video);
  const noPlayableSource = !isLoading && !!video && !streamUrl;
  const isActiveStream = !!streamUrl && currentTrack?.fileUri === streamUrl;
  const streamPlayerError = isActiveStream && (globalPlayerError || globalPlayerTimedOut)
    ? globalPlayerError ?? 'Unable to prepare this video.'
    : null;
  const streamIsLoading = isActiveStream && globalPlayerStatus === 'loading' && !streamPlayerError;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Back */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={16}>
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Video player */}
        <View style={styles.playerContainer}>
          {showQueryError ? (
            <View style={styles.playerPlaceholder}>
              <View style={styles.playerOverlay}>
                <AlertTriangle size={36} color={Colors.accent} />
                <Text style={styles.playerErrorTitle}>Unable to play video</Text>
                <Text style={styles.playerErrorText}>{queryErrorMessage}</Text>
                <TouchableOpacity
                  onPress={() => {
                    void refetch();
                  }}
                  style={styles.retryBtn}
                  disabled={isFetching}
                >
                  <Text style={styles.retryText}>{isFetching ? 'Retrying...' : 'Retry'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : noPlayableSource || isLoading || streamPlayerError || streamIsLoading ? (
            <View style={styles.playerPlaceholder}>
              {thumbnail ? (
                <Image source={{ uri: thumbnail }} style={styles.playerThumb} />
              ) : null}
              <View style={styles.playerOverlay}>
                {noPlayableSource ? (
                  <>
                    <AlertTriangle size={36} color={Colors.accent} />
                    <Text style={styles.playerErrorTitle}>Unable to play video</Text>
                    <Text style={styles.playerErrorText}>
                      No compatible iOS/Android source is available for this video.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        void refetch();
                      }}
                      style={styles.retryBtn}
                      disabled={isFetching}
                    >
                      <Text style={styles.retryText}>{isFetching ? 'Retrying...' : 'Retry'}</Text>
                    </TouchableOpacity>
                  </>
                ) : streamPlayerError ? (
                  <>
                    <Text style={styles.playerErrorText}>{streamPlayerError}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (playbackTrack) {
                          play(playbackTrack.fileUri, playbackTrack).catch((err) => {
                            if (__DEV__) console.warn('[player] retry play() failed', err);
                          });
                        }
                      }}
                      style={styles.retryBtn}
                    >
                      <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <ActivityIndicator size="large" color={Colors.accent} />
                    <Text style={styles.loadingText}>Loading...</Text>
                  </>
                )}
              </View>
            </View>
          ) : VideoViewComponent ? (
            <VideoViewComponent
              player={player}
              style={styles.videoView}
              // Android SurfaceView can escape ScrollView/z-order bounds and blank the screen;
              // TextureView keeps the one global player visually clipped to this player surface.
              surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
              fullscreenOptions={{ enable: true }}
              allowsPictureInPicture
              startsPictureInPictureAutomatically
            />
          ) : (
            <View style={styles.playerPlaceholder}>
              <View style={styles.playerOverlay}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.loadingText}>Preparing player...</Text>
              </View>
            </View>
          )}
        </View>

        {/* Title + meta */}
        {isLoading ? (
          <View style={styles.metaContainer}>
            <SkeletonCard />
          </View>
        ) : video ? (
          <View style={styles.metaContainer}>
            <Text style={styles.videoTitle}>{video.title}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Eye size={13} color={Colors.textMuted} />
                <Text style={styles.statText}>{formatViewCount(video.viewCount)} views</Text>
              </View>
              <View style={styles.statDot} />
              <View style={styles.stat}>
                <Calendar size={13} color={Colors.textMuted} />
                <Text style={styles.statText}>{video.publishedText}</Text>
              </View>
              {video.likeCount != null && (
                <>
                  <View style={styles.statDot} />
                  <View style={styles.stat}>
                    <ThumbsUp size={13} color={Colors.textMuted} />
                    <Text style={styles.statText}>{formatViewCount(video.likeCount)}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Channel row */}
            <View style={styles.channelRow}>
              <View style={styles.channelAvatar}>
                <Text style={styles.channelInitial}>
                  {(video.author?.[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.channelInfo}>
                <Text style={styles.channelName}>{video.author}</Text>
                <Text style={styles.channelSub}>{video.subCountText}</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/channel/[id]', params: { id: video.authorId } })}
                style={styles.visitBtn}
              >
                <ChevronRight size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Action row */}
            <View style={styles.actionRow}>
              <ActionBtn
                icon={<Heart size={18} color={liked ? Colors.accent : Colors.textSecondary} fill={liked ? Colors.accent : 'none'} />}
                label="Like"
                onPress={handleLike}
                active={liked}
              />
              <ActionBtn
                icon={<Bookmark size={18} color={saved ? Colors.gold : Colors.textSecondary} fill={saved ? Colors.gold : 'none'} />}
                label="Save"
                onPress={handleSave}
                active={saved}
              />
              {showDownloadButton && downloadsEnabled && (
                <ActionBtn
                  icon={
                    <Download
                      size={18}
                      color={activeDownloadFormat ? Colors.gold : Colors.textSecondary}
                    />
                  }
                  label="Download"
                  onPress={() => setShowFormatPicker(true)}
                  active={!!activeDownloadFormat}
                  gold={!!activeDownloadFormat}
                />
              )}
              <ActionBtn
                icon={<Share2 size={18} color={Colors.textSecondary} />}
                label="Share"
                onPress={() => {}}
              />
            </View>

            {/* Description */}
            {video.description && (
              <TouchableOpacity
                onPress={() => setShowFullDesc(!showFullDesc)}
                style={styles.descContainer}
              >
                <Text
                  style={styles.description}
                  numberOfLines={showFullDesc ? undefined : 3}
                >
                  {video.description}
                </Text>
                <Text style={styles.descToggle}>
                  {showFullDesc ? 'Show less' : 'Show more'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Related videos */}
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>Related Videos</Text>
          {isLoading || relatedLoading
            ? [1, 2, 3].map((i) => (
                <View key={i} style={styles.relatedItem}>
                  <SkeletonCard horizontal />
                </View>
              ))
            : relatedVideos.map((item) => (
                <View key={item.videoId} style={styles.relatedItem}>
                  <VideoCard item={item} />
                </View>
              ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Format picker */}
      <FormatPicker
        visible={showFormatPicker}
        onClose={() => setShowFormatPicker(false)}
        onSelect={handleDownload}
        title={video?.title ?? ''}
        downloading={activeDownloadFormat}
      />
    </SafeAreaView>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  active,
  gold,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  active?: boolean;
  gold?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionBtn} activeOpacity={0.8}>
      <View
        style={[
          styles.actionBtnInner,
          active && !gold && styles.actionBtnActiveRed,
          gold && styles.actionBtnActiveGold,
        ]}
      >
        {icon}
      </View>
      <Text style={styles.actionBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  topBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    zIndex: 100,
    elevation: 100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  playerPlaceholder: {
    flex: 1,
    position: 'relative',
  },
  playerThumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerErrorText: {
    maxWidth: '80%',
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  playerErrorTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  loadingText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
  retryText: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  videoView: {
    flex: 1,
  },
  metaContainer: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  videoTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.textMuted,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  channelAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelInitial: {
    fontFamily: Typography.display,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  channelSub: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  visitBtn: {
    padding: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  actionBtnInner: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnActiveRed: {
    backgroundColor: Colors.accentSoft,
    borderColor: Colors.accent,
  },
  actionBtnActiveGold: {
    backgroundColor: Colors.goldSoft,
    borderColor: Colors.gold,
  },
  actionBtnLabel: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  descContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  description: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  descToggle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.accent,
    marginTop: Spacing.xs,
  },
  relatedSection: {
    padding: Spacing.md,
  },
  relatedTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  relatedItem: {
    marginBottom: Spacing.sm,
  },
});
