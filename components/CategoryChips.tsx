import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography, FontSizes } from '@/constants/theme';

interface Category {
  id: string;
  label: string;
}

interface CategoryChipsProps {
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}

export function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={categories}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isSelected = item.id === selected;
        return (
          <TouchableOpacity
            onPress={() => onSelect(item.id)}
            style={[styles.chip, isSelected && styles.chipSelected]}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ width: Spacing.xs }} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontFamily: Typography.body,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: Typography.display,
    color: '#FFFFFF',
  },
});
