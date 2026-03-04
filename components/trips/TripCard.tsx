import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type TripCardProps = {
  title: string;
  destination: string;
  startDate: string;
  daysCount: number;
  coverUri: string;
  onPress?: () => void;
  height?: number;
  style?: ViewStyle;
};

const DEFAULT_HEIGHT = 192;
const BORDER_RADIUS = 16;
const ANIM_DURATION_MS = 300;
const HOVER_DURATION_MS = 500;
const EASE_OUT = Easing.out(Easing.cubic);

const GRADIENT_COLORS = [
  'rgba(0,0,0,0.78)',
  'rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.00)',
] as const;

const GRADIENT_LOCATIONS = [0, 0.55, 1] as const;

export function TripCard({
  title,
  destination,
  startDate,
  daysCount,
  coverUri,
  onPress,
  height = DEFAULT_HEIGHT,
  style,
}: TripCardProps) {
  const { isDark } = useTheme();

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = React.useCallback(() => {
    scale.value = withTiming(1.04, { duration: ANIM_DURATION_MS, easing: EASE_OUT });
  }, [scale]);

  const handlePressOut = React.useCallback(() => {
    scale.value = withTiming(1, { duration: ANIM_DURATION_MS, easing: EASE_OUT });
  }, [scale]);

  const handleHoverIn = React.useCallback(() => {
    scale.value = withTiming(1.04, { duration: HOVER_DURATION_MS, easing: EASE_OUT });
  }, [scale]);

  const handleHoverOut = React.useCallback(() => {
    scale.value = withTiming(1, { duration: HOVER_DURATION_MS, easing: EASE_OUT });
  }, [scale]);

  const badgeBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.16)';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={[styles.root, { height }, style]}
      accessibilityRole="button"
    >
      {/* Zoomed image layer */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <ImageBackground source={{ uri: coverUri }} style={styles.imageFill} resizeMode="cover" />
      </Animated.View>

      {/* Static overlay layer */}
      <View style={styles.overlay}>
        <LinearGradient
          colors={GRADIENT_COLORS}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          style={styles.gradient}
        />

        {/* Top row */}
        <View style={styles.topRow}>
          <View style={[styles.locationPill, { backgroundColor: badgeBg }]}>
            <Feather name="map-pin" size={14} color="#ffffff" />
            <Text style={styles.locationText} numberOfLines={1}>
              {destination}
            </Text>
          </View>

          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>

          <View style={styles.rightGhost} />
        </View>

        {/* Bottom row */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.metaLabel}>Ngày khởi hành</Text>
            <View style={styles.metaRow}>
              <Feather name="calendar" size={14} color="#ffffff" />
              <Text style={styles.metaValue}>{startDate}</Text>
            </View>
          </View>

          <View style={[styles.daysPill, { backgroundColor: badgeBg }]}>
            <Text style={styles.daysText}>{daysCount} ngày</Text>
          </View>
        </View>

        {/* Subtle accent */}
        <View
          style={[
            styles.accentDot,
            {
              backgroundColor: ExploreEaseColors.primary,
              opacity: 0.9,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: BORDER_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  imageFill: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '75%',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rightGhost: {
    width: 96,
  },

  locationPill: {
    maxWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  locationText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  titleText: {
    flex: 1,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    paddingHorizontal: 12,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  metaLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6,
  },
  metaValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },

  daysPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  daysText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },

  accentDot: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
