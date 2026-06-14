import React, { useEffect } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface SkeletonCardProps {
  horizontal?: boolean;
}

const ShimmerBox = ({
  width,
  height,
  borderRadius = Radius.sm,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
}) => {
  const progress = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 900,
          useNativeDriver: false,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.bgCard, Colors.bgElevated],
  });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius },
        { backgroundColor },
      ]}
    />
  );
};

export function SkeletonCard({ horizontal }: SkeletonCardProps) {
  if (horizontal) {
    return (
      <View style={styles.horizontal}>
        <ShimmerBox width={160} height={90} borderRadius={Radius.md} />
        <View style={styles.hMeta}>
          <ShimmerBox width={140} height={12} />
          <View style={{ height: 4 }} />
          <ShimmerBox width={100} height={10} />
          <View style={{ height: 4 }} />
          <ShimmerBox width={80} height={10} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.vertical}>
      <ShimmerBox width="100%" height={180} borderRadius={Radius.md} />
      <View style={styles.vMeta}>
        <ShimmerBox width={24} height={24} borderRadius={Radius.full} />
        <View style={styles.vText}>
          <ShimmerBox width="90%" height={13} />
          <View style={{ height: 6 }} />
          <ShimmerBox width="60%" height={11} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  horizontal: {
    flexDirection: 'row',
    width: 280,
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hMeta: {
    flex: 1,
    paddingTop: Spacing.xs,
  },
  vertical: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  vMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
    alignItems: 'flex-start',
  },
  vText: {
    flex: 1,
  },
});
