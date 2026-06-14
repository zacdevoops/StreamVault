import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Users } from 'lucide-react-native';
import { getChannel, searchVideos, formatViewCount } from '@/services/api';
import { VideoCard } from '@/components/VideoCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Colors, Spacing, Typography, FontSizes, Radius } from '@/constants/theme';

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: channel, isLoading: channelLoading } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => getChannel(id!),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });

  const { data: videos, isLoading: videosLoading } = useQuery({
    queryKey: ['channelVideos', id],
    queryFn: () => searchVideos({ query: `channel:${id}`, type: 'video' }),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const ch = channel as Record<string, unknown> | null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Channel</Text>
      </View>

      <FlatList
        data={videos ?? []}
        keyExtractor={(item) => item.videoId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          channelLoading ? (
            <View style={styles.channelHeaderSkeleton}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : ch ? (
            <View style={styles.channelHeader}>
              <View style={styles.channelBanner} />
              <View style={styles.channelAvatarWrap}>
                <View style={styles.channelAvatar}>
                  <Text style={styles.channelInitial}>
                    {(String(ch.author || '?')[0]).toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.channelName}>{String(ch.author ?? '')}</Text>
              <View style={styles.channelMeta}>
                <Users size={14} color={Colors.textMuted} />
                <Text style={styles.channelSub}>
                  {formatViewCount(Number(ch.subCount) || 0)} subscribers
                </Text>
              </View>
              {ch.description ? (
                <Text style={styles.channelDesc} numberOfLines={3}>
                  {String(ch.description)}
                </Text>
              ) : null}
              <Text style={styles.sectionHeader}>Videos</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.videoItem}>
            <VideoCard item={item} />
          </View>
        )}
        ListEmptyComponent={
          videosLoading ? (
            <View style={styles.skeletonList}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.videoItem}>
                  <SkeletonCard />
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  channelHeaderSkeleton: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelHeader: {
    alignItems: 'center',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.md,
  },
  channelBanner: {
    width: '100%',
    height: 80,
    backgroundColor: Colors.bgCard,
  },
  channelAvatarWrap: {
    marginTop: -32,
    marginBottom: Spacing.sm,
  },
  channelAvatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    borderWidth: 3,
    borderColor: Colors.bgBase,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelInitial: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xxl,
    color: Colors.textSecondary,
  },
  channelName: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xl,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  channelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  channelSub: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  channelDesc: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  videoItem: {
    marginBottom: Spacing.sm,
  },
  skeletonList: {
    gap: Spacing.sm,
  },
});
