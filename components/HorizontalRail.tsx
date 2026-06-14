import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, FontSizes } from '@/constants/theme';
import { VideoCard } from './VideoCard';
import { SkeletonCard } from './SkeletonCard';
import { VideoResult } from '@/types';

interface HorizontalRailProps {
  title: string;
  data: VideoResult[];
  isLoading?: boolean;
  onSeeAll?: () => void;
}

export function HorizontalRail({ title, data, isLoading, onSeeAll }: HorizontalRailProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            style={styles.seeAllButton}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        )}
      </View>
      {isLoading ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[1, 2, 3, 4]}
          keyExtractor={(i) => String(i)}
          contentContainerStyle={styles.list}
          renderItem={() => <SkeletonCard horizontal />}
          ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        />
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={data}
          keyExtractor={(item) => item.videoId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <VideoCard item={item} horizontal />}
          ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  seeAll: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  seeAllButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingLeft: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.md,
  },
});
