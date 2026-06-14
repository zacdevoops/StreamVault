import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Play, Pause, Trash2, CircleCheck as CheckCircle, CircleAlert as AlertCircle } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography, FontSizes } from '@/constants/theme';
import { DownloadFormat, DownloadItem as DownloadItemType } from '@/types';

interface DownloadItemProps {
  item: DownloadItemType;
  onPlay?: (item: DownloadItemType) => void;
  onDelete?: (item: DownloadItemType) => void;
}

const FORMAT_LABELS: Record<string, string> = {
  mp4_360p: 'MP4 360p',
  mp4_720p: 'MP4 720p',
  mp4_1080p: 'MP4 1080p',
  mp4_4k: 'MP4 4K',
  mp3_128: 'MP3 128k',
  mp3_320: 'MP3 320k',
  flac: 'FLAC',
  audio_best: 'Audio',
  mp4_best: 'MP4',
};

const AUDIO_FORMATS: DownloadFormat[] = ['mp3_128', 'mp3_320', 'flac'];

function isAudioFormat(format: DownloadFormat | string): boolean {
  return AUDIO_FORMATS.includes(format as DownloadFormat) || format === 'audio_best';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadItemRowBase({ item, onPlay, onDelete }: DownloadItemProps) {
  const isAudio = isAudioFormat(item.format);
  const handlePlay = useCallback(() => onPlay?.(item), [item, onPlay]);
  const handleDelete = useCallback(() => onDelete?.(item), [item, onDelete]);

  return (
    <View style={styles.container}>
      {item.thumbnail ? (
        <Image
          source={{ uri: item.thumbnail }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="normal"
          style={styles.thumb}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.author} numberOfLines={1}>{item.author}</Text>
        <View style={styles.meta}>
          <View style={[styles.formatBadge, isAudio && styles.audioBadge]}>
            <Text style={[styles.formatText, isAudio && styles.audioText]}>
              {FORMAT_LABELS[item.format] ?? item.format}
            </Text>
          </View>
          {item.status === 'completed' ? (
            <Text style={styles.size}>{formatBytes(item.fileSize)}</Text>
          ) : (
            <Text style={styles.progress}>
              {Math.round(item.progress * 100)}%
            </Text>
          )}
        </View>
        {item.status === 'downloading' && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${item.progress * 100}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.actions}>
        {item.status === 'completed' && (
          <TouchableOpacity onPress={handlePlay} style={styles.actionBtn}>
            <Play size={18} color={Colors.accent} />
          </TouchableOpacity>
        )}
        {item.status === 'downloading' && (
          <View style={styles.actionBtn}>
            <Pause size={18} color={Colors.textSecondary} />
          </View>
        )}
        {item.status === 'failed' && (
          <View style={styles.actionBtn}>
            <AlertCircle size={18} color={Colors.error} />
          </View>
        )}
        {item.status === 'completed' && (
          <View style={styles.checkIcon}>
            <CheckCircle size={14} color={Colors.success} />
          </View>
        )}
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Trash2 size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const DownloadItemRow = React.memo(DownloadItemRowBase, (prev, next) => {
  const a = prev.item;
  const b = next.item;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.author === b.author &&
    a.thumbnail === b.thumbnail &&
    a.format === b.format &&
    a.fileSize === b.fileSize &&
    a.status === b.status &&
    a.progress === b.progress &&
    prev.onPlay === next.onPlay &&
    prev.onDelete === next.onDelete
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  thumb: {
    width: 72,
    height: 48,
    borderRadius: Radius.sm,
  },
  thumbFallback: {
    backgroundColor: Colors.bgElevated,
  },
  info: {
    flex: 1,
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
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  audioBadge: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldSoft,
  },
  formatText: {
    fontFamily: Typography.mono,
    fontSize: 10,
    color: Colors.textSecondary,
  },
  audioText: {
    color: Colors.gold,
  },
  size: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  progress: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.xs,
    color: Colors.accent,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
  },
  actions: {
    position: 'relative',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    padding: 4,
  },
  checkIcon: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
});
