import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { secureMessageService } from '@/src/services/secureMessageService';
import type { ConversationSummary } from '@/src/services/socialService';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    Pressable,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

  type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const getInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'EE';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

const formatRelativeTime = (isoValue: string | null, locale: string, t: TranslateFn) => {
  if (!isoValue) return '';

  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMinutes < 1) return t('messages.time.now');
  if (diffMinutes < 60) return t('messages.time.minutes', { count: diffMinutes });
  if (diffHours < 24) return t('messages.time.hours', { count: diffHours });
  if (diffDays < 7) return t('messages.time.days', { count: diffDays });

  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
  });
};

const getConversationPreview = (item: ConversationSummary, t: TranslateFn) => {
  let previewText = t('messages.preview.noMessages');

  if (item.lastMessageType === 'text') {
    previewText = item.lastMessageText || t('messages.preview.sentMessage');
  } else if (item.lastMessageType === 'image') {
    previewText = t('messages.preview.sentImage');
  } else if (item.lastMessageType === 'location') {
    previewText = t('messages.preview.sharedLocation');
  }

  if (item.lastSenderName && item.lastMessageType !== 'none') {
    return `${item.lastSenderName}: ${previewText}`;
  }

  return previewText;
};

export default function MessagesListScreen() {
  const { isDark } = useTheme();
  const { language, t } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      bubble: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15, 23, 42, 0.05)',
    }),
    [isDark]
  );

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await secureMessageService.getConversations();
      setConversations(rows);
    } catch (err: any) {
      console.warn('load conversations failed:', err?.message ?? err);
      setConversations([]);
      setError(t('messages.list.error.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
      return () => {};
    }, [loadConversations])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const rows = await secureMessageService.getConversations();
      setConversations(rows);
      setError(null);
    } catch (err: any) {
      console.warn('refresh conversations failed:', err?.message ?? err);
      setError(t('messages.list.error.refresh'));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => {
      const initials = getInitials(item.title);
      const lastTime = formatRelativeTime(item.lastMessageAt, locale, t);
      const resolvedTitle = item.title || t('messages.list.groupFallbackTitle');
      const resolvedSubtitle = item.type === 'direct'
        ? t('messages.list.directSubtitle')
        : item.subtitle || t('messages.list.membersFallback', { count: item.participantCount });
      const previewText = getConversationPreview(item, t);

      return (
        <Pressable
          onPress={() => router.push(`/messages/${item.id}` as any)}
          style={({ pressed, hovered }) => [
            styles.card,
            { borderColor: colors.border, backgroundColor: colors.cardBg },
            Platform.OS === 'web' && hovered ? { opacity: 0.98 } : null,
            pressed ? { opacity: 0.86 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={resolvedTitle}
        >
          <View style={styles.avatarCol}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { borderColor: colors.border }]}> 
                <Text style={[styles.avatarText, { color: colors.title }]}>{initials}</Text>
              </View>
            )}
          </View>

          <View style={styles.contentCol}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.title }]} numberOfLines={1}>
                {resolvedTitle}
              </Text>
              <Text style={[styles.timeText, { color: colors.subtitle }]}>{lastTime}</Text>
            </View>

            <Text style={[styles.subtitle, { color: colors.subtitle }]} numberOfLines={1}>
              {resolvedSubtitle}
            </Text>

            <View style={styles.previewRow}>
              <Text style={[styles.previewText, { color: colors.title }]} numberOfLines={1}>
                {previewText}
              </Text>

              {item.type === 'group' ? (
                <View style={[styles.groupBadge, { backgroundColor: colors.bubble }]}> 
                  <Feather name="users" size={12} color={ExploreEaseColors.primary} />
                  <Text style={[styles.groupBadgeText, { color: colors.title }]}>{item.participantCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, locale, t]
  );

  const emptyState = useMemo(() => {
    if (loading) return null;

    return (
      <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <Feather name="message-circle" size={24} color={ExploreEaseColors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.title }]}>
          {t('messages.list.emptyTitle')}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
          {t('messages.list.emptySubtitle')}
        </Text>
      </View>
    );
  }, [colors, loading, t]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed, hovered }) => [
              styles.headerIcon,
              { borderColor: colors.border, backgroundColor: colors.cardBg },
              Platform.OS === 'web' && hovered ? { opacity: 0.98 } : null,
              pressed ? { opacity: 0.86 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.back')}
          >
            <Feather name="chevron-left" size={20} color={colors.title} />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={[styles.pageTitle, { color: colors.title }]}>
              {t('messages.list.title')}
            </Text>
            <Text style={[styles.pageSubtitle, { color: colors.subtitle }]}>
              {t('messages.list.count', { count: conversations.length })}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={ExploreEaseColors.primary} />
            <Text style={[styles.loadingText, { color: colors.subtitle }]}>
              {t('messages.list.loading')}
            </Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.errorWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
            <Text style={[styles.errorText, { color: colors.title }]}>{error}</Text>
            <Pressable
              onPress={() => void loadConversations()}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: ExploreEaseColors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!error ? (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={emptyState}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor={ExploreEaseColors.primary}
              />
            }
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  pageSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
  },
  loadingWrap: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 28,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorWrap: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    color: '#001018',
    fontSize: 13,
    fontWeight: '900',
  },
  listContent: {
    paddingBottom: 30,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
  },
  avatarCol: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.10)',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '900',
  },
  contentCol: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  groupBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyWrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
