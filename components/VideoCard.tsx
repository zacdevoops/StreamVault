import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, Radius, Spacing, Typography, FontSizes } from '@/constants/theme';
import { VideoResult } from '@/types';
import { formatDuration, formatViewCount, getBestThumbnail } from '@/services/api';

interface VideoCardProps {
  item: VideoResult;
  horizontal?: boolean;
  onPress?: () => void;
}

const EMOJI_SPLIT_PATTERN = /([\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?)/gu;

function getDisplayTitle(title?: string) {
  const safeTitle = title ?? 'Untitled video';
  // iOS renders some emoji as missing-glyph boxes when the title uses the custom Outfit font.
  // Android renders these correctly, so only iOS strips emoji from feed titles.
  if (Platform.OS !== 'ios') return safeTitle;
  return safeTitle.replace(EMOJI_SPLIT_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

export function VideoCard({ item, horizontal, onPress }: VideoCardProps) {
  const thumbnail = getBestThumbnail(item.videoThumbnails ?? []);
  const duration = formatDuration(item.lengthSeconds);
  const views = formatViewCount(item.viewCount);

  const handlePress = () => {
    if (!item.videoId) return;
    if (onPress) {
      onPress();
      return;
    }
    router.push({ pathname: '/player/[id]', params: { id: item.videoId } });
  };

  if (horizontal) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        style={styles.hCard}
        activeOpacity={0.8}
      >
        <View style={styles.hThumbContainer}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.hThumb} contentFit="cover" />
          ) : (
            <View style={[styles.hThumb, styles.thumbFallback]} />
          )}
          {!item.liveNow && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{duration}</Text>
            </View>
          )}
          {item.liveNow && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <View style={styles.hMeta}>
          <Text style={styles.hTitle} numberOfLines={2}>{getDisplayTitle(item.title)}</Text>
          <Text style={styles.hAuthor} numberOfLines={1}>{item.author}</Text>
          <Text style={styles.hViews}>{views} views • {item.publishedText}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.vCard}
      activeOpacity={0.8}
    >
      <View style={styles.vThumbContainer}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.vThumb} contentFit="cover" />
        ) : (
          <View style={[styles.vThumb, styles.thumbFallback]} />
        )}
        {!item.liveNow && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        )}
        {item.liveNow && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={styles.vMeta}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {(item.author?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.vText}>
          <Text style={styles.vTitle} numberOfLines={2}>{getDisplayTitle(item.title)}</Text>
          <Text style={styles.vAuthor} numberOfLines={1}>
            {item.author} • {views} views • {item.publishedText}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hCard: {
    width: 280,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginRight: Spacing.sm,
  },
  hThumbContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  hThumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    backgroundColor: Colors.bgElevated,
  },
  hMeta: {
    padding: Spacing.sm,
  },
  hTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  hAuthor: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  hViews: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  vCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  vThumbContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  vThumb: {
    width: '100%',
    height: '100%',
  },
  vMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
    alignItems: 'flex-start',
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  vText: {
    flex: 1,
  },
  vTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  vAuthor: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  liveBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveText: {
    fontFamily: Typography.display,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
