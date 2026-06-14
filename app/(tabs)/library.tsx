import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { History, Heart, BookmarkCheck, Trash2, Clock, Shield } from 'lucide-react-native';
import { useLibraryStore } from '@/stores/libraryStore';
import { getHistory, getLiked, getSaved, clearHistory as clearHistoryDB } from '@/services/database';
import { Colors, Spacing, Typography, FontSizes, Radius } from '@/constants/theme';
import { LibraryItem } from '@/types';
import { formatDuration } from '@/services/api';

const TABS = [
  { id: 'history', label: 'History', icon: History },
  { id: 'liked', label: 'Liked', icon: Heart },
  { id: 'saved', label: 'Saved', icon: BookmarkCheck },
];

type LibrarySection = {
  title: string;
  data: LibraryItem[];
};

function groupByDate(items: LibraryItem[]): LibrarySection[] {
  const now = Date.now();
  const today = new Date(now).setHours(0, 0, 0, 0);
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;

  const groups: Record<string, LibraryItem[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  };

  for (const item of items) {
    if (item.watchedAt >= today) groups['Today'].push(item);
    else if (item.watchedAt >= yesterday) groups['Yesterday'].push(item);
    else if (item.watchedAt >= weekAgo) groups['This week'].push(item);
    else groups['Earlier'].push(item);
  }

  return Object.entries(groups)
    .filter(([, v]) => v.length > 0)
    .map(([title, data]) => ({ title, data }));
}

export default function LibraryScreen() {
  const [activeTab, setActiveTab] = useState('history');
  const { history, liked, saved, clearHistory } = useLibraryStore();
  const [dbHistory, setDbHistory] = useState<LibraryItem[]>([]);
  const [dbLiked, setDbLiked] = useState<LibraryItem[]>([]);
  const [dbSaved, setDbSaved] = useState<LibraryItem[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [h, l, s] = await Promise.all([getHistory(), getLiked(), getSaved()]);
      setDbHistory(h);
      setDbLiked(l);
      setDbSaved(s);
    } catch {
      Alert.alert('Library unavailable', 'Your saved library could not be loaded.');
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'This will remove all videos from your watch history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearHistoryDB();
              clearHistory();
              setDbHistory([]);
            } catch {
              Alert.alert('Library unavailable', 'Your watch history could not be cleared.');
            }
          },
        },
      ]
    );
  };

  const displayHistory = dbHistory.length > 0 ? dbHistory : history;
  const displayLiked = dbLiked.length > 0 ? dbLiked : liked;
  const displaySaved = dbSaved.length > 0 ? dbSaved : saved;
  const historySections = groupByDate(displayHistory);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Library</Text>
        {activeTab === 'history' && displayHistory.length > 0 && (
          <TouchableOpacity onPress={handleClearHistory} style={styles.clearBtn}>
            <Trash2 size={16} color={Colors.textMuted} />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
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
              <Icon size={15} color={isActive ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.legalWrap}>
        <Text style={styles.legalTitle}>About & Legal</Text>
        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => router.push('/privacy-policy')}
          activeOpacity={0.85}
        >
          <View style={styles.legalIcon}>
            <Shield size={14} color={Colors.accent} />
          </View>
          <Text style={styles.legalText}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'history' ? (
        historySections.length > 0 ? (
          <SectionList
            sections={historySections}
            renderItem={({ item }: { item: LibraryItem }) => <LibraryRow item={item} />}
            renderSectionHeader={({ section }: { section: LibrarySection }) => (
              <View style={styles.sectionHeader}>
                <Clock size={13} color={Colors.textMuted} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <EmptyState
            icon={<History size={48} color={Colors.textMuted} />}
            title="No watch history"
            subtitle="Videos you watch will appear here"
          />
        )
      ) : activeTab === 'liked' ? (
        displayLiked.length > 0 ? (
          <FlatList
            data={displayLiked}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <LibraryRow item={item} />}
          />
        ) : (
          <EmptyState
            icon={<Heart size={48} color={Colors.textMuted} />}
            title="No liked videos"
            subtitle="Videos you like will appear here"
          />
        )
      ) : (
        displaySaved.length > 0 ? (
          <FlatList
            data={displaySaved}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <LibraryRow item={item} />}
          />
        ) : (
          <EmptyState
            icon={<BookmarkCheck size={48} color={Colors.textMuted} />}
            title="No saved videos"
            subtitle="Save videos to watch later"
          />
        )
      )}
    </SafeAreaView>
  );
}

function LibraryRow({ item }: { item: LibraryItem }) {
  const handlePress = () => {
    if (!item.videoId) return;
    router.push({ pathname: '/player/[id]', params: { id: item.videoId } });
  };

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.thumbContainer}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]} />
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.lengthSeconds)}</Text>
        </View>
        {(item.watchProgress ?? 0) > 0.05 && (
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${(item.watchProgress ?? 0) * 100}%` }]}
            />
          </View>
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.rowAuthor} numberOfLines={1}>{item.author}</Text>
        <Text style={styles.rowDate}>
          {new Date(item.watchedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.xxl,
    color: Colors.textPrimary,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
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
  },
  tabActive: {
    backgroundColor: Colors.accentSoft,
  },
  tabText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  tabTextActive: {
    fontFamily: Typography.display,
    color: Colors.accent,
  },
  legalWrap: {
    margin: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legalTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  legalIcon: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  thumbContainer: {
    width: 100,
    position: 'relative',
  },
  thumb: {
    width: 100,
    height: 70,
    resizeMode: 'cover',
  },
  thumbFallback: {
    backgroundColor: Colors.bgElevated,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: Radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    fontFamily: Typography.mono,
    fontSize: 10,
    color: Colors.textPrimary,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  rowInfo: {
    flex: 1,
    padding: Spacing.sm,
    justifyContent: 'center',
  },
  rowTitle: {
    fontFamily: Typography.display,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  rowAuthor: {
    fontFamily: Typography.body,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  rowDate: {
    fontFamily: Typography.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
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
});
