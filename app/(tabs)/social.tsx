import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { socialService, type SocialFeedItem } from '@/src/services/socialService';
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

const formatRelativeTime = (isoValue: string, locale: string, t: TranslateFn) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMinutes < 1) return t('social.time.justNow');
  if (diffMinutes < 60) return t('social.time.minutesAgo', { count: diffMinutes });
  if (diffHours < 24) return t('social.time.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('social.time.daysAgo', { count: diffDays });

  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
  });
};

const getActivityDescription = (item: SocialFeedItem, t: TranslateFn) => {
  if (item.actionType === 'follow') {
    return t('social.feed.activity.follow', {
      actor: item.actorName,
      target: item.targetDisplayName || t('social.feed.someone'),
    });
  }

  if (item.actionType === 'review') {
    return t('social.feed.activity.review', { actor: item.actorName });
  }

  if (item.actionType === 'bookmark') {
    return t('social.feed.activity.bookmark', { actor: item.actorName });
  }

  if (item.actionType === 'attend_event') {
    return t('social.feed.activity.attendEvent', { actor: item.actorName });
  }

  if (item.actionType === 'message') {
    return t('social.feed.activity.message', { actor: item.actorName });
  }

  return t('social.feed.activity.generic', { actor: item.actorName });
};

const iconNameByAction: Record<SocialFeedItem['actionType'], React.ComponentProps<typeof Feather>['name']> = {
  review: 'star',
  bookmark: 'bookmark',
  attend_event: 'calendar',
  follow: 'user-plus',
  message: 'message-circle',
};

export default function SocialTabScreen() {
  const { isDark } = useTheme();
  const { language, t } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';

  const [feed, setFeed] = useState<SocialFeedItem[]>([]);
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
      muted: isDark ? 'rgba(148,163,184,0.85)' : 'rgba(100,116,139,0.95)',
      emptyBg: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    }),
    [isDark]
  );

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await socialService.getActivityFeed(60);
      setFeed(rows);
    } catch (err: any) {
      console.warn('load social feed failed:', err?.message ?? err);
      setFeed([]);
      setError(t('social.error.loadFeed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadFeed();
      return () => {};
    }, [loadFeed])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const rows = await socialService.getActivityFeed(60);
      setFeed(rows);
      setError(null);
    } catch (err: any) {
      console.warn('refresh social feed failed:', err?.message ?? err);
      setError(t('social.error.refreshFeed'));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const renderItem = useCallback(
    ({ item }: { item: SocialFeedItem }) => {
      const iconName = iconNameByAction[item.actionType] ?? 'activity';
      const initials = getInitials(item.actorName);
      const description = getActivityDescription(item, t);

      return (
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.leftCol}>
            {item.actorAvatarUrl ? (
              <Image source={{ uri: item.actorAvatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { borderColor: colors.border }]}> 
                <Text style={[styles.avatarText, { color: colors.title }]}>{initials}</Text>
              </View>
            )}
          </View>

          <View style={styles.centerCol}>
            <Text style={[styles.description, { color: colors.title }]}>{description}</Text>
            <Text style={[styles.createdAt, { color: colors.subtitle }]}>
              {formatRelativeTime(item.createdAt, locale, t)}
            </Text>
          </View>

          <View style={[styles.actionBadge, { borderColor: colors.border }]}> 
            <Feather name={iconName} size={16} color={ExploreEaseColors.primary} />
          </View>
        </View>
      );
    },
    [colors, locale, t]
  );

  const emptyState = useMemo(() => {
    if (loading) return null;

    return (
      <View style={[styles.emptyWrap, { backgroundColor: colors.emptyBg, borderColor: colors.border }]}> 
        <Feather name="users" size={24} color={ExploreEaseColors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.title }]}>
          {t('social.feed.emptyTitle')}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
          {t('social.feed.emptySubtitle')}
        </Text>
      </View>
    );
  }, [colors, loading, t]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.pageTitle, { color: colors.title }]}>
              {t('social.feed.title')}
            </Text>
            <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
              {t('social.feed.subtitle')}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/messages' as any)}
            style={({ pressed, hovered }) => [
              styles.messageBtn,
              { borderColor: colors.border, backgroundColor: colors.cardBg },
              Platform.OS === 'web' && hovered ? { opacity: 0.97 } : null,
              pressed ? { opacity: 0.84 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('social.feed.openMessagesA11y')}
          >
            <Feather name="send" size={16} color={ExploreEaseColors.primary} />
            <Text style={[styles.messageBtnText, { color: colors.title }]}>
              {t('social.feed.messagesButton')}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={ExploreEaseColors.primary} />
            <Text style={[styles.loadingText, { color: colors.subtitle }]}>
              {t('social.feed.loading')}
            </Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={[styles.errorWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
            <Text style={[styles.errorText, { color: colors.title }]}>{error}</Text>
            <Pressable
              onPress={() => void loadFeed()}
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
            data={feed}
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
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  headerTextWrap: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  loadingWrap: {
    paddingTop: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
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
    paddingBottom: 120,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  leftCol: {
    width: 42,
    alignItems: 'center',
  },
  centerCol: {
    flex: 1,
    gap: 4,
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
  description: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  createdAt: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  emptyWrap: {
    borderRadius: 16,
    borderWidth: 1,
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
