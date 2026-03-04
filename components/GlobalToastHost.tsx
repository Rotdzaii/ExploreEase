import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import React, { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Platform,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function GlobalToastHost() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();

  const activeToastId = useNotificationStore((s) => s.activeToastId);
  const notifications = useNotificationStore((s) => s.notifications);
  const markToastShown = useNotificationStore((s) => s.markToastShown);
  const dismissToast = useNotificationStore((s) => s.dismissToast);

  const toast = useMemo(() => {
    if (!activeToastId) return null;
    return notifications.find((n) => n.id === activeToastId) ?? null;
  }, [activeToastId, notifications]);

  const toastWidth = useMemo(() => {
    // Keep it reasonably sized across web/mobile
    const target = Math.round(width * 0.86);
    return Math.max(260, Math.min(360, target));
  }, [width]);

  const translateX = useRef(new Animated.Value(-400)).current;
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!toast) return;

    markToastShown(toast.id);

    translateX.stopAnimation();
    progress.stopAnimation();

    const offscreen = -(toastWidth + 18);
    translateX.setValue(offscreen);
    progress.setValue(1);

    const slideIn = Animated.timing(translateX, {
      toValue: 0,
      duration: 240,
      useNativeDriver: Platform.OS !== 'web',
    });

    const runProgress = Animated.timing(progress, {
      toValue: 0,
      duration: toast.durationMs,
      useNativeDriver: false,
    });

    let cancelled = false;

    Animated.parallel([slideIn, runProgress]).start(({ finished }) => {
      if (!finished || cancelled) return;

      Animated.timing(translateX, {
        toValue: offscreen,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }).start(({ finished: finishedOut }) => {
        if (!finishedOut || cancelled) return;
        dismissToast(toast.id);
      });
    });

    return () => {
      cancelled = true;
      translateX.stopAnimation();
      progress.stopAnimation();
    };
  }, [dismissToast, markToastShown, progress, toast, toastWidth, translateX]);

  if (!toast) return null;

  const surface = isDark ? 'rgba(2,6,23,0.78)' : 'rgba(255,255,255,0.94)';
  const textColor = isDark ? 'rgba(226,232,240,0.96)' : '#0f172a';
  const subTextColor = isDark ? 'rgba(148,163,184,0.96)' : '#475569';
  const borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, toastWidth],
  });

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.toastWrap,
          {
            top: Math.max(8, insets.top + 10),
            width: toastWidth,
            transform: [{ translateX }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={[styles.toastCard, { backgroundColor: surface, borderColor }]}
        >
          <View style={[styles.accent, { backgroundColor: ExploreEaseColors.primary }]} />
          <View style={styles.content}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              Thông báo
            </Text>
            <Text style={[styles.message, { color: subTextColor }]} numberOfLines={2}>
              {toast.message}
            </Text>
          </View>
        </View>

        <View style={[styles.progressTrack, { width: toastWidth, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)' }]}>
          <Animated.View style={[styles.progressBar, { width: progressWidth, backgroundColor: ExploreEaseColors.primary }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    left: 0,
    zIndex: 9999,
  },
  toastCard: {
    overflow: 'hidden',
    borderWidth: 1,
    flexDirection: 'row',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    minHeight: 56,
  },
  accent: {
    width: 5,
  },
  content: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  title: {
    fontWeight: Platform.OS === 'web' ? '800' : '900',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  message: {
    marginTop: 2,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  progressTrack: {
    height: 3,
    overflow: 'hidden',
    borderBottomRightRadius: 14,
  },
  progressBar: {
    height: 3,
  },
});
