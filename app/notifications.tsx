import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    FlatList,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

import { useTheme } from '@/src/context/theme';
import { type AppNotification, useNotificationStore } from '@/src/store/useNotificationStore';

export default function NotificationsScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const { isDark } = useTheme();

  const notifications = useNotificationStore((s) => s.notifications);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);

  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Clear bell badge when user opens the list.
    markAllRead();
  }, [markAllRead]);

  useEffect(() => {
    opacity.stopAnimation();
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [notifications.length, opacity]);

  const scale = useMemo(() => clamp(screenWidth / 390, 0.86, 1.18), [screenWidth]);
  const s = (value: number) => Math.round(value * scale);

  const padX = Math.round(clamp(screenWidth * 0.05, 16, 28));
  const contentMaxWidth = 820;

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
      surface: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
    }),
    [isDark]
  );

  const renderItem = ({ item }: { item: AppNotification }) => {
    const isUnread = !item.read;
    return (
      <Pressable
        onPress={() => markRead(item.id)}
        style={({ pressed, hovered }) => [
          styles.card,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            padding: s(14),
            borderRadius: s(18),
          },
          (Platform.OS === 'web' && hovered) ? { opacity: 0.98 } : null,
          pressed ? { opacity: 0.86 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={isUnread ? 'Thông báo chưa đọc' : 'Thông báo'}
      >
        <View style={{ flexDirection: 'row', gap: s(10), alignItems: 'flex-start' }}>
          <View
            style={{
              width: s(10),
              height: s(10),
              borderRadius: 999,
              marginTop: s(6),
              backgroundColor: isUnread ? ExploreEaseColors.primary : colors.surface,
            }}
          />

          <View style={{ flex: 1, gap: s(4) }}>
            <Text style={{ color: colors.title, fontWeight: '900', fontSize: s(14) }} numberOfLines={2}>
              {item.message}
            </Text>
            <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(12) }} numberOfLines={1}>
              {formatTypeLabel(item.type)} • {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.shell, { paddingHorizontal: padX }]}>
        <View style={[styles.headerRow, { maxWidth: contentMaxWidth }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed, hovered }) => [
              styles.headerIconBtn,
              hovered ? { opacity: 0.95 } : null,
              pressed ? { opacity: 0.85 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
          >
            <Feather name="chevron-left" size={s(24)} color={colors.title} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.title, fontWeight: '900', fontSize: s(20) }} numberOfLines={1}>
              Thông báo
            </Text>
            <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(12) }} numberOfLines={1}>
              {notifications.length > 0 ? `${notifications.length} thông báo` : 'Chưa có thông báo'}
            </Text>
          </View>

          <View style={{ width: s(40) }} />
        </View>

        <Animated.View style={{ flex: 1, opacity, maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }}>
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingTop: s(14),
              paddingBottom: s(18),
              gap: s(12),
              flexGrow: notifications.length === 0 ? 1 : 0,
            } as any}
            ListEmptyComponent={
              <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.cardBg, borderRadius: s(18), padding: s(16) }]}>
                <Text style={{ color: colors.title, fontWeight: '900', fontSize: s(14) }}>Chưa có thông báo</Text>
                <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(12), marginTop: s(6) }}>
                  Khi bạn thêm địa điểm vào kế hoạch, thông báo sẽ hiện ở đây.
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS !== 'web'}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatTime = (ts: number) => {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
};

const formatTypeLabel = (type: AppNotification['type']) => {
  switch (type) {
    case 'success':
      return 'Thành công';
    case 'warning':
      return 'Cảnh báo';
    case 'error':
      return 'Lỗi';
    default:
      return 'Thông tin';
  }
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  shell: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
  },
  headerRow: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
  },
  emptyWrap: {
    borderWidth: 1,
  },
});
