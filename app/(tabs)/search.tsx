import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Clock, TrendingUp } from 'lucide-react-native';
import { searchVideos } from '@/services/api';
import { addSearchHistory, getSearchHistory, clearSearchHistory } from '@/services/database';
import { SearchBar } from '@/components/SearchBar';
import { VideoCard } from '@/components/VideoCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { adsService } from '@/services/ads/AdsService';
import { Colors, Spacing, Typography, FontSizes, Radius } from '@/constants/theme';
import { SearchType, SortOrder, VideoResult } from '@/types';

const FILTER_TYPES: { id: SearchType | 'all'; label: string }[] = [
  { id: 'all', label: 'Videos' },
  { id: 'music', label: 'Music' },
  { id: 'channel', label: 'Channels' },
  { id: 'playlist', label: 'Playlists' },
];

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'upload_date', label: 'Upload date' },
  { id: 'view_count', label: 'View count' },
];

const TRENDING_SEARCHES = [
  'lo-fi music', 'live coding', 'nature documentary',
  '4K gaming', 'acoustic guitar', 'tech news', 'react native',
];
const SEARCH_PAGE_SIZE = 20;

export default function SearchScreen() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    q?: string;
    type?: SearchType | 'all';
    sort?: SortOrder;
    clear?: string;
    nonce?: string;
  }>();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterType, setFilterType] = useState<SearchType | 'all'>('all');
  const [sort, setSort] = useState<SortOrder>('relevance');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [searchResults, setSearchResults] = useState<VideoResult[]>([]);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    const initialQuery = typeof params.q === 'string' ? params.q : '';
    if (initialQuery.length < 2) return;

    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);

    if (params.type && FILTER_TYPES.some((type) => type.id === params.type)) {
      setFilterType(params.type);
    }
    if (params.sort && SORT_OPTIONS.some((option) => option.id === params.sort)) {
      setSort(params.sort);
    }
  }, [params.nonce, params.q, params.sort, params.type]);

  useEffect(() => {
    if (!params.clear) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setDebouncedQuery('');
    setFilterType('all');
    setSort('relevance');
  }, [params.clear]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setSearchResults([]);
    setHasMoreResults(true);
  }, [debouncedQuery, filterType, sort]);

  const loadHistory = async () => {
    try {
      const h = await getSearchHistory();
      setSearchHistory(h);
    } catch {
      Alert.alert('Search history unavailable', 'Recent searches could not be loaded.');
    }
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length >= 2) {
      debounceRef.current = setTimeout(() => setDebouncedQuery(trimmed), 350);
    } else {
      setDebouncedQuery('');
    }
  };

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      setQuery(trimmed);
      setDebouncedQuery(trimmed);
      try {
        await addSearchHistory(trimmed);
        await loadHistory();
      } catch {
        Alert.alert('Search history unavailable', 'This search could not be saved.');
      }
    }
  };

  const handleHistoryPress = (q: string) => {
    setQuery(q);
    setDebouncedQuery(q);
  };

  const handleClearHistory = async () => {
    try {
      await clearSearchHistory();
      setSearchHistory([]);
    } catch {
      Alert.alert('Search history unavailable', 'Recent searches could not be cleared.');
    }
  };

  const { data: results, isLoading, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery, filterType, sort, page],
    queryFn: () =>
      searchVideos({
        query: debouncedQuery,
        type: filterType === 'all' ? 'video' : filterType,
        sort,
        page,
      }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([]);
      setHasMoreResults(false);
      return;
    }

    const nextPage = results ?? [];
    setHasMoreResults(nextPage.length >= SEARCH_PAGE_SIZE);
    setSearchResults((prev) => {
      if (page === 1) return nextPage;
      const seen = new Set(prev.map((item) => item.videoId));
      const uniqueNext = nextPage.filter((item) => !seen.has(item.videoId));
      return [...prev, ...uniqueNext];
    });
  }, [debouncedQuery, page, results]);

  const showEmpty = debouncedQuery.length < 2;
  const showLoading = debouncedQuery.length >= 2 && page === 1 && searchResults.length === 0 && (isLoading || isFetching);
  const isFetchingMore = page > 1 && isFetching;

  const loadMoreResults = () => {
    if (showEmpty || showLoading || isFetchingMore || !hasMoreResults) return;
    setPage((prev) => prev + 1);
  };

  useEffect(() => {
    if (debouncedQuery.length < 2 || page !== 1 || isLoading || searchResults.length === 0) return;
    void adsService.tryShowInterstitial('search_results', pathname);
  }, [debouncedQuery, isLoading, page, pathname, searchResults.length]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Search input */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={query}
          onChangeText={handleQueryChange}
          onSubmit={handleSubmit}
          autoFocus
        />
      </View>

      {/* Filter row */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_TYPES}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setFilterType(item.id)}
              style={[styles.filterChip, filterType === item.id && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filterType === item.id && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ width: Spacing.xs }} />}
        />
      </View>

      {/* Sort row */}
      {!showEmpty && (
        <View style={styles.sortRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={SORT_OPTIONS}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.filterList}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setSort(item.id)}
                style={[styles.sortChip, sort === item.id && styles.sortChipActive]}
              >
                <Text style={[styles.sortText, sort === item.id && styles.sortTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ width: Spacing.xs }} />}
          />
        </View>
      )}

      {/* Content */}
      {showEmpty ? (
        <FlatList
          data={[]}
          keyExtractor={() => ''}
          renderItem={null}
          ListHeaderComponent={
            <View>
              {/* Trending searches */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <TrendingUp size={16} color={Colors.accent} />
                  <Text style={styles.sectionTitle}>Trending Searches</Text>
                </View>
                <View style={styles.chipsWrap}>
                  {TRENDING_SEARCHES.map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => handleHistoryPress(s)}
                      style={styles.trendChip}
                    >
                      <Text style={styles.trendChipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Search history */}
              {searchHistory.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Clock size={16} color={Colors.textMuted} />
                    <Text style={styles.sectionTitle}>Recent Searches</Text>
                    <TouchableOpacity onPress={handleClearHistory} style={{ marginLeft: 'auto' }}>
                      <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  {searchHistory.map((h) => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => handleHistoryPress(h)}
                      style={styles.historyRow}
                    >
                      <Clock size={14} color={Colors.textMuted} />
                      <Text style={styles.historyText}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          }
        />
      ) : showLoading ? (
        <FlatList
          data={[1, 2, 3, 4, 5]}
          keyExtractor={(i) => String(i)}
          contentContainerStyle={styles.resultsList}
          renderItem={() => (
            <View style={styles.skeletonWrap}>
              <SkeletonCard />
            </View>
          )}
        />
      ) : (
        <FlashList
          data={searchResults}
          keyExtractor={(item) => item.videoId}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => <VideoCard item={item} />}
          onEndReached={loadMoreResults}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingMore ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator color={Colors.accent} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptySubtitle}>Try different keywords or filters</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  searchContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  filterRow: {
    marginBottom: Spacing.xs,
  },
  filterList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    fontFamily: Typography.display,
    color: '#FFFFFF',
  },
  sortRow: {
    marginBottom: Spacing.sm,
  },
  sortChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.transparent,
  },
  sortChipActive: {
    backgroundColor: Colors.bgCard,
  },
  sortText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  sortTextActive: {
    color: Colors.textPrimary,
  },
  resultsList: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  loadMoreFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  skeletonWrap: {
    marginBottom: Spacing.sm,
  },
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  clearText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  trendChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trendChipText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontFamily: Typography.body,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
});
