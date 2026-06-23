import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Bell, User, Music, WifiOff, RefreshCw } from 'lucide-react-native';
import {
  FeedCategory,
  formatViewCount,
  getBestThumbnail,
  getCategoryFeed,
  getFallbackFeed,
} from '@/services/api';
import { SearchBar } from '@/components/SearchBar';
import { CategoryChips } from '@/components/CategoryChips';
import { VideoCard } from '@/components/VideoCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { adsService } from '@/services/ads/AdsService';
import { Colors, Spacing, Typography, FontSizes, Radius } from '@/constants/theme';
import { VideoResult } from '@/types';

const CATEGORIES: { id: FeedCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'music', label: 'Music' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'news', label: 'News' },
  { id: 'sports', label: 'Sports' },
  { id: 'podcasts', label: 'Podcasts' },
];
const FEED_PAGE_SIZE = 30;
const MUSIC_CHART_LIMIT = 10;
const MUSIC_INSERT_INDEX = 8;

type HomeListItem =
  | { type: 'video'; item: VideoResult }
  | { type: 'musicHeader' }
  | { type: 'music'; item: VideoResult; rank: number };

export default function HomeScreen() {
  const pathname = usePathname();
  const [selectedCategory, setSelectedCategory] = useState<FeedCategory>('all');
  const [feedPage, setFeedPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const netInfo = useNetInfo();
  const selectedCategoryLabel = CATEGORIES.find((category) => category.id === selectedCategory)?.label ?? 'Videos';
  const feedLimit = feedPage * FEED_PAGE_SIZE;

  const {
    data: categoryFeed,
    isLoading: feedLoading,
    isFetching: feedFetching,
    isError: feedError,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ['categoryFeed', selectedCategory, feedLimit],
    queryFn: () => getCategoryFeed(selectedCategory, feedLimit),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
    // Do not poll the backend while the app is backgrounded — wastes battery + cellular data
    // and the screen is not visible anyway.
    refetchIntervalInBackground: false,
  });

  const {
    data: musicTrending,
    refetch: refetchMusic,
  } = useQuery({
    queryKey: ['musicTrending'],
    queryFn: () => getCategoryFeed('music', MUSIC_CHART_LIMIT),
    enabled: selectedCategory === 'all',
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setFeedPage(1);
    await Promise.all([
      refetchFeed(),
      selectedCategory === 'all' ? refetchMusic() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [refetchFeed, refetchMusic, selectedCategory]);

  useEffect(() => {
    setFeedPage(1);
  }, [selectedCategory]);

  const feedData = categoryFeed ?? [];
  const musicChartData = selectedCategory === 'all'
    ? (musicTrending ?? []).slice(0, MUSIC_CHART_LIMIT)
    : [];
  const topFeedItems = selectedCategory === 'all'
    ? feedData.slice(0, MUSIC_INSERT_INDEX)
    : feedData;
  const remainingFeedItems = selectedCategory === 'all'
    ? feedData.slice(MUSIC_INSERT_INDEX)
    : [];
  const listData: HomeListItem[] = [
    ...topFeedItems.map((item) => ({ type: 'video' as const, item })),
    ...(musicChartData.length > 0
      ? [
          { type: 'musicHeader' as const },
          ...musicChartData.map((item, index) => ({
            type: 'music' as const,
            item,
            rank: index + 1,
          })),
        ]
      : []),
    ...remainingFeedItems.map((item) => ({ type: 'video' as const, item })),
  ];
  const hasData = listData.length > 0;
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const fallbackFeedIds = getFallbackFeed(selectedCategory).map((item) => item.videoId);
  const isFallbackFeedShowing = !feedLoading
    && feedData.length > 0
    && feedData.every((item) => fallbackFeedIds.includes(item.videoId));
  const canLoadMoreFeed = !feedLoading && !feedFetching && !feedError && !isOffline
    && feedData.length >= feedLimit;
  const isFetchingMoreFeed = feedFetching && feedPage > 1 && feedData.length > 0;
  const loadMoreFeed = useCallback(() => {
    if (!canLoadMoreFeed) return;
    setFeedPage((prev) => prev + 1);
  }, [canLoadMoreFeed]);

  const openBlankSearch = useCallback(() => {
    router.push({
      pathname: '/search',
      params: {
        clear: String(Date.now()),
      },
    });
  }, []);

  const selectCategory = useCallback((id: string) => {
    setSelectedCategory(id as FeedCategory);
  }, []);

  const renderFeedItem = useCallback<ListRenderItem<HomeListItem>>(
    ({ item }) => {
      if (item.type === 'musicHeader') {
        return (
          <View style={styles.inlineSectionHeader}>
            <Text style={styles.inlineSectionTitle}>Top Charts — Music</Text>
            <Text style={styles.inlineSectionMeta}>Top {musicChartData.length}</Text>
          </View>
        );
      }

      if (item.type === 'music') {
        return <MusicChartRow item={item.item} rank={item.rank} />;
      }

      return (
        <View style={styles.videoRow}>
          <VideoCard item={item.item} />
        </View>
      );
    },
    [musicChartData.length]
  );

  useEffect(() => {
    if (feedPage <= 1 || feedLoading || !hasData) return;
    void adsService.tryShowInterstitial('feed_page', pathname);
  }, [feedPage, feedLoading, hasData, pathname]);

  const showHomeShortcutPending = useCallback((feature: string) => {
    // These header shortcuts are visible Home controls; give the user feedback instead of a dead tap.
    Alert.alert(feature, 'This shortcut is not ready yet.');
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlashList
        data={listData}
        keyExtractor={(item, index) => {
          if (item.type === 'video') return `video-${item.item.videoId}-${index}`;
          if (item.type === 'music') return `music-${item.item.videoId}-${item.rank}`;
          return 'music-header';
        }}
        renderItem={renderFeedItem}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMoreFeed}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logo}>
                <View style={styles.logoIcon}>
                  <Text style={styles.logoText}>SV</Text>
                </View>
                <Text style={styles.logoLabel}>StreamVault</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => showHomeShortcutPending('Notifications')}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                >
                  <Bell size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.avatarBtn}
                  onPress={() => showHomeShortcutPending('Profile')}
                  accessibilityRole="button"
                  accessibilityLabel="Profile"
                >
                  <User size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Search bar */}
            <View style={styles.searchWrapper}>
              <SearchBar
                value=""
                onChangeText={() => {}}
                readOnly
                onPress={openBlankSearch}
                onMicPress={openBlankSearch}
              />
            </View>

            {/* Category chips */}
            <CategoryChips categories={CATEGORIES} selected={selectedCategory} onSelect={selectCategory} />
            {isOffline ? (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>No internet connection</Text>
              </View>
            ) : (
              isFallbackFeedShowing && (
                <View style={styles.serviceBanner}>
                  <Text style={styles.serviceBannerText}>Service unavailable — showing cached content</Text>
                </View>
              )
            )}
            <View style={{ height: Spacing.md }} />

            {/* Error state when API fails and no data */}
            {!feedLoading && feedError && !hasData && (
              <View style={styles.errorState}>
                <View style={styles.errorIcon}>
                  <WifiOff size={40} color={Colors.textMuted} />
                </View>
                <Text style={styles.errorTitle}>
                  {isOffline ? 'No internet connection' : 'Unable to load content'}
                </Text>
                <Text style={styles.errorSubtitle}>
                  {isOffline
                    ? 'Reconnect to the internet and pull down to refresh.'
                    : 'Could not reach video servers. Pull down to retry.'}
                </Text>
                <TouchableOpacity onPress={() => refetchFeed()} style={styles.retryBtn}>
                  <RefreshCw size={16} color={Colors.textPrimary} />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {hasData || feedLoading ? (
              <View style={styles.feedHeading}>
                <Text style={styles.sectionTitle}>
                  {selectedCategory === 'all' ? 'Trending Videos' : `${selectedCategoryLabel} Videos`}
                </Text>
                <View style={styles.sectionPill}>
                  <Text style={styles.sectionPillText}>
                    {selectedCategory === 'all' ? 'Local' : selectedCategoryLabel}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          feedLoading ? (
            <View style={styles.feed}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}>
                  <SkeletonCard />
                </View>
              ))}
            </View>
          ) : null
        }
        ListFooterComponent={
          <View>
            {isFetchingMoreFeed ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator color={Colors.accent} />
              </View>
            ) : null}
            <View style={{ height: 100 }} />
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      />
    </SafeAreaView>
  );
}

function MusicChartRow({ item, rank }: { item: VideoResult; rank: number }) {
  const thumb = getBestThumbnail(item.videoThumbnails ?? [])
    || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
  const handlePress = () => {
    if (!item.videoId) return;
    router.push({ pathname: '/player/[id]', params: { id: item.videoId } });
  };

  return (
    <TouchableOpacity
      style={styles.musicRow}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.musicThumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.musicThumb} contentFit="cover" />
        ) : (
          <View style={[styles.musicThumb, styles.musicThumbFallback]} />
        )}
        <View style={styles.musicRankBadge}>
          <Text style={styles.musicRank}>#{rank}</Text>
        </View>
      </View>
      <View style={styles.musicRowText}>
        <Text style={styles.musicTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.musicArtist} numberOfLines={1}>{item.author}</Text>
        <View style={styles.musicMetaRow}>
          <Music size={14} color={Colors.gold} />
          <Text style={styles.musicMetaText}>{formatViewCount(item.viewCount)} views</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: Typography.display,
    fontSize: 13,
    color: '#FFFFFF',
  },
  logoLabel: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchWrapper: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  feedHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: Typography.display,
    fontSize: FontSizes.xl,
    color: Colors.textPrimary,
  },
  sectionPill: {
    minHeight: 28,
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSoft,
    paddingHorizontal: Spacing.sm,
  },
  sectionPillText: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xs,
    color: Colors.accent,
  },
  serviceBanner: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    backgroundColor: Colors.goldSoft,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  serviceBannerText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.gold,
  },
  offlineBanner: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  offlineBannerText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
  },
  errorState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: Radius.xl,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontFamily: Typography.body,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
  retryText: {
    fontFamily: Typography.display,
    fontSize: FontSizes.md,
    color: '#FFFFFF',
  },
  videoRow: {
    marginHorizontal: Spacing.md,
  },
  inlineSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  inlineSectionTitle: {
    flex: 1,
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  inlineSectionMeta: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.gold,
  },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    overflow: 'hidden',
  },
  musicThumbWrap: {
    width: 96,
    height: 72,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    overflow: 'hidden',
  },
  musicRankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  musicRank: {
    fontFamily: Typography.mono,
    fontSize: 10,
    color: Colors.gold,
  },
  musicThumb: {
    width: '100%',
    height: '100%',
  },
  musicThumbFallback: {
    backgroundColor: Colors.bgElevated,
  },
  musicRowText: {
    flex: 1,
    minWidth: 0,
    marginLeft: Spacing.sm,
  },
  musicTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 3,
  },
  musicArtist: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  musicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  musicMetaText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  loadMoreFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  feed: {},
});
