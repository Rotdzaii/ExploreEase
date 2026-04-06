import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { supabase } from '@/src/services/supabase';
import { Feather } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Platform,
    Pressable,
    SafeAreaView,
    SectionList,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

type NotificationType = 'system' | 'review' | 'event';

type NotificationRow = {
  id: string;
  user_id: string;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type NotificationSection = {
  key: NotificationType;
  title: string;
  data: NotificationRow[];
};

const TYPE_ORDER: NotificationType[] = ['review', 'event', 'system'];

const TYPE_TITLE_KEYS: Record<NotificationType, string> = {
  review: 'notifications.type.review',
  event: 'notifications.type.event',
  system: 'notifications.type.system',
};

export default function NotificationsScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;

  const loadNotifications = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, body, type, is_read, created_at, metadata')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setNotifications((data ?? []) as NotificationRow[]);
    } catch (err: any) {
      console.warn('loadNotifications failed:', err?.message ?? err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const markNotificationRead = useCallback(
    async (item: NotificationRow) => {
      if (!userId || item.is_read) return;

      const prev = notifications;
      setNotifications((current) =>
        current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row))
      );

      try {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', item.id)
          .eq('user_id', userId)
          .eq('is_read', false);

        if (error) throw error;
      } catch (err: any) {
        console.warn('markNotificationRead failed:', err?.message ?? err);
        setNotifications(prev);
      }
    },
    [notifications, userId]
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;

    const unreadCount = notifications.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);
    if (unreadCount === 0) return;

    setIsMarkingAll(true);
    const prev = notifications;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
    } catch (err: any) {
      console.warn('markAllRead failed:', err?.message ?? err);
      setNotifications(prev);
    } finally {
      setIsMarkingAll(false);
    }
  }, [notifications, userId]);

  useEffect(() => {
    opacity.stopAnimation();
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [notifications.length, opacity, userId]);

  useEffect(() => {
    let isMounted = true;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const uid = data.user?.id ?? null;
      if (!isMounted) return;

      setUserId(uid);
      if (!uid) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      await loadNotifications(uid);

      channel = supabase
        .channel(`notification-center:${uid}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            if (!isMounted) return;
            const next = payload.new as NotificationRow;
            if (!next?.id) return;

            setNotifications((prev) => {
              if (prev.some((item) => item.id === next.id)) return prev;
              return [next, ...prev];
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            if (!isMounted) return;
            const next = payload.new as NotificationRow;
            if (!next?.id) return;

            setNotifications((prev) => prev.map((item) => (item.id === next.id ? next : item)));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            if (!isMounted) return;
            const oldRow = payload.old as NotificationRow;
            if (!oldRow?.id) return;

            setNotifications((prev) => prev.filter((item) => item.id !== oldRow.id));
          }
        )
        .subscribe();
    };

    init().catch((err: any) => {
      console.warn('notifications center init failed:', err?.message ?? err);
      if (isMounted) {
        setLoading(false);
        setNotifications([]);
      }
    });

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

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

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.is_read ? 0 : 1), 0),
    [notifications]
  );

  const groupedSections = useMemo<NotificationSection[]>(() => {
    const groups: Record<NotificationType, NotificationRow[]> = {
      review: [],
      event: [],
      system: [],
    };

    for (const item of notifications) {
      const key = normalizeType(item.type);
      groups[key].push(item);
    }

    return TYPE_ORDER
      .map((key) => ({
        key,
        title: t(TYPE_TITLE_KEYS[key]),
        data: groups[key],
      }))
      .filter((section) => section.data.length > 0);
  }, [notifications, t]);

  const renderItem = ({ item }: { item: NotificationRow }) => {
    const isUnread = !item.is_read;
    const title = item.title?.trim() || t('notifications.item.defaultTitle');
    const message = item.message?.trim() || item.body?.trim() || t('notifications.item.defaultMessage');

    return (
      <Pressable
        onPress={() => void markNotificationRead(item)}
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
        accessibilityLabel={isUnread ? t('notifications.item.accessibility.unread') : t('notifications.item.accessibility.read')}
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
              {title}
            </Text>
            <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(12) }} numberOfLines={2}>
              {message}
            </Text>
            <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(11) }} numberOfLines={1}>
              {formatTime(item.created_at, locale)}
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
            accessibilityLabel={t('notifications.back')}
          >
            <Feather name="chevron-left" size={s(24)} color={colors.title} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.title, fontWeight: '900', fontSize: s(20) }} numberOfLines={1}>
              {t('home.notifications')}
            </Text>
            <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(12) }} numberOfLines={1}>
              {loading
                ? t('notifications.summary.loading')
                : notifications.length > 0
                ? t('notifications.summary.withCount', { total: notifications.length, unread: unreadCount })
                : t('notifications.summary.empty')}
            </Text>
          </View>

          <Pressable
            onPress={() => void markAllRead()}
            disabled={loading || isMarkingAll || unreadCount === 0}
            style={({ pressed }) => [
              styles.markAllBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.cardBg,
                opacity: loading || isMarkingAll || unreadCount === 0 ? 0.45 : pressed ? 0.82 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.markAllReadAccessibility')}
          >
            <Text style={{ color: colors.title, fontWeight: '800', fontSize: s(11) }}>
              {isMarkingAll ? t('notifications.markAllUpdating') : t('notifications.markAllDone')}
            </Text>
          </Pressable>
        </View>

        <Animated.View style={{ flex: 1, opacity, maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }}>
          <SectionList
            sections={groupedSections}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeaderWrap}>
                <Text style={{ color: colors.subtitle, fontWeight: '900', fontSize: s(11), letterSpacing: 0.4 }}>
                  {section.title.toUpperCase()} ({section.data.length})
                </Text>
              </View>
            )}
            contentContainerStyle={{
              paddingTop: s(14),
              paddingBottom: s(18),
              gap: s(12),
              flexGrow: groupedSections.length === 0 ? 1 : 0,
            } as any}
            ListEmptyComponent={
              <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.cardBg, borderRadius: s(18), padding: s(16) }]}>
                <Text style={{ color: colors.title, fontWeight: '900', fontSize: s(14) }}>{t('notifications.emptyTitle')}</Text>
                <Text style={{ color: colors.subtitle, fontWeight: '700', fontSize: s(12), marginTop: s(6) }}>
                  {t('notifications.emptyDescription')}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS !== 'web'}
            stickySectionHeadersEnabled={false}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeType = (type?: string | null): NotificationType => {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized === 'review') return 'review';
  if (normalized === 'event') return 'event';
  return 'system';
};

const formatTime = (ts?: string | null, locale: string = 'vi-VN') => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
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
  sectionHeaderWrap: {
    marginTop: 6,
    marginBottom: 4,
  },
  markAllBtn: {
    minWidth: 88,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  emptyWrap: {
    borderWidth: 1,
  },
});
