import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { socialService, type FollowStats } from '@/src/services/socialService';
import { supabase } from '@/src/services/supabase';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type PublicProfile = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
};

type UserEventPreview = {
  id: string;
  title: string;
  location: string | null;
  startTime: string | null;
  createdAt: string | null;
};

type UserReviewPreview = {
  id: string;
  kind: 'destination' | 'event';
  targetId: string;
  targetTitle: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
};

const toShortId = (value: string) => value.replace(/-/g, '').slice(0, 6).toUpperCase();

const hasMissingColumn = (error: unknown, columnName: string) => {
  const message = String((error as any)?.message ?? '').toLowerCase();
  return message.includes('does not exist') && message.includes(columnName.toLowerCase());
};

const isMissingRelation = (error: unknown) => {
  const message = String((error as any)?.message ?? '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('table') && message.includes('does not exist'))
  );
};

const extractBio = (row: any): string | null => {
  const candidates = [row?.bio, row?.about, row?.about_me, row?.description];
  for (const value of candidates) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) return text;
  }

  return null;
};

export default function PublicUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const profileUserId = useMemo(
    () => (Array.isArray(id) ? String(id[0] ?? '').trim() : String(id ?? '').trim()),
    [id]
  );

  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [followStats, setFollowStats] = useState<FollowStats | null>(null);
  const [followPending, setFollowPending] = useState(false);
  const [recentEvents, setRecentEvents] = useState<UserEventPreview[]>([]);
  const [recentReviews, setRecentReviews] = useState<UserReviewPreview[]>([]);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      cardBg: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      primaryText: '#001018',
    }),
    [isDark]
  );

  const formatDate = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return '';

      return parsed.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    },
    [locale]
  );

  const loadRecentEvents = useCallback(async (userId: string, includePending: boolean) => {
    const baseLimit = 6;

    const runQuery = (useApprovalFilter: boolean) => {
      let query = supabase
        .from('events')
        .select('id, title, location, start_time, created_at, approval_status')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(baseLimit);

      if (useApprovalFilter) {
        query = query.eq('approval_status', 'approved');
      }

      return query;
    };

    let result = await runQuery(!includePending);

    if (result.error && hasMissingColumn(result.error, 'approval_status')) {
      result = await supabase
        .from('events')
        .select('id, title, location, start_time, created_at')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(baseLimit);
    }

    if (result.error) {
      console.warn('loadRecentEvents failed:', result.error.message);
      return [] as UserEventPreview[];
    }

    return (result.data ?? []).map((row: any) => ({
      id: String(row?.id ?? ''),
      title: String(row?.title ?? '').trim() || t('common.na'),
      location: typeof row?.location === 'string' ? row.location : null,
      startTime: typeof row?.start_time === 'string' ? row.start_time : null,
      createdAt: typeof row?.created_at === 'string' ? row.created_at : null,
    }));
  }, [t]);

  const loadRecentReviews = useCallback(async (userId: string) => {
    const [destinationReviewRes, eventReviewRes] = await Promise.all([
      supabase
        .from('reviews')
        .select('id, destination_id, rating, comment, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('event_reviews')
        .select('id, event_id, rating, comment, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    if (destinationReviewRes.error) {
      console.warn('load destination reviews failed:', destinationReviewRes.error.message);
    }

    if (eventReviewRes.error && !isMissingRelation(eventReviewRes.error)) {
      console.warn('load event reviews failed:', eventReviewRes.error.message);
    }

    const destinationRows = destinationReviewRes.error ? [] : (destinationReviewRes.data ?? []);
    const eventRows = eventReviewRes.error ? [] : (eventReviewRes.data ?? []);

    const destinationIds = Array.from(
      new Set(
        destinationRows
          .map((row: any) => String(row?.destination_id ?? '').trim())
          .filter(Boolean)
      )
    );

    const eventIds = Array.from(
      new Set(
        eventRows
          .map((row: any) => String(row?.event_id ?? '').trim())
          .filter(Boolean)
      )
    );

    const [destinationTitleRes, eventTitleRes] = await Promise.all([
      destinationIds.length > 0
        ? supabase.from('destinations').select('id, name').in('id', destinationIds)
        : Promise.resolve({ data: [], error: null } as any),
      eventIds.length > 0
        ? supabase.from('events').select('id, title').in('id', eventIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    const destinationTitleById = new Map<string, string>();
    if (!destinationTitleRes.error) {
      for (const row of destinationTitleRes.data ?? []) {
        const idValue = String((row as any)?.id ?? '').trim();
        const titleValue = String((row as any)?.name ?? '').trim();
        if (!idValue || !titleValue) continue;
        destinationTitleById.set(idValue, titleValue);
      }
    }

    const eventTitleById = new Map<string, string>();
    if (!eventTitleRes.error) {
      for (const row of eventTitleRes.data ?? []) {
        const idValue = String((row as any)?.id ?? '').trim();
        const titleValue = String((row as any)?.title ?? '').trim();
        if (!idValue || !titleValue) continue;
        eventTitleById.set(idValue, titleValue);
      }
    }

    const mappedDestinationReviews: UserReviewPreview[] = destinationRows.map((row: any) => {
      const targetId = String(row?.destination_id ?? '').trim();
      return {
        id: `destination:${String(row?.id ?? '')}`,
        kind: 'destination',
        targetId,
        targetTitle: destinationTitleById.get(targetId) || t('profile.public.reviewFallbackDestination'),
        rating: Number(row?.rating ?? 0),
        comment: typeof row?.comment === 'string' ? row.comment : null,
        createdAt: typeof row?.created_at === 'string' ? row.created_at : null,
      };
    });

    const mappedEventReviews: UserReviewPreview[] = eventRows.map((row: any) => {
      const targetId = String(row?.event_id ?? '').trim();
      return {
        id: `event:${String(row?.id ?? '')}`,
        kind: 'event',
        targetId,
        targetTitle: eventTitleById.get(targetId) || t('profile.public.reviewFallbackEvent'),
        rating: Number(row?.rating ?? 0),
        comment: typeof row?.comment === 'string' ? row.comment : null,
        createdAt: typeof row?.created_at === 'string' ? row.created_at : null,
      };
    });

    return [...mappedDestinationReviews, ...mappedEventReviews]
      .sort((a, b) => {
        const aTs = new Date(a.createdAt ?? 0).getTime();
        const bTs = new Date(b.createdAt ?? 0).getTime();
        return bTs - aTs;
      })
      .slice(0, 8);
  }, [t]);

  const loadData = useCallback(async () => {
    if (!profileUserId) {
      setErrorMessage(t('profile.public.notFound'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const myUserId = authData.user?.id ?? null;
      setCurrentUserId(myUserId);

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profileUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileRow) {
        setProfile(null);
        setFollowStats(null);
        setRecentEvents([]);
        setRecentReviews([]);
        setErrorMessage(t('profile.public.notFound'));
        return;
      }

      const normalizedName = String((profileRow as any)?.full_name ?? '').trim();
      const normalizedAvatarUrl = String((profileRow as any)?.avatar_url ?? '').trim();

      const nextProfile: PublicProfile = {
        id: String((profileRow as any)?.id ?? profileUserId),
        fullName: normalizedName || `${t('profile.defaultName')} ${toShortId(profileUserId)}`,
        avatarUrl: normalizedAvatarUrl || null,
        bio: extractBio(profileRow),
      };

      const [nextEvents, nextReviews] = await Promise.all([
        loadRecentEvents(profileUserId, myUserId === profileUserId),
        loadRecentReviews(profileUserId),
      ]);

      setProfile(nextProfile);
      setRecentEvents(nextEvents);
      setRecentReviews(nextReviews);

      if (myUserId) {
        try {
          const stats = await socialService.getFollowStats(profileUserId);
          setFollowStats(stats);
        } catch (error) {
          console.warn('load follow stats failed:', error);
          setFollowStats(null);
        }
      } else {
        setFollowStats(null);
      }
    } catch (error: any) {
      console.warn('load public profile failed:', error?.message ?? error);
      setProfile(null);
      setFollowStats(null);
      setRecentEvents([]);
      setRecentReviews([]);
      setErrorMessage(error?.message ?? t('profile.public.notFound'));
    } finally {
      setLoading(false);
    }
  }, [loadRecentEvents, loadRecentReviews, profileUserId, t]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      return () => {};
    }, [loadData])
  );

  const isOwnProfile = !!currentUserId && !!profile?.id && currentUserId === profile.id;

  const onToggleFollow = useCallback(async () => {
    if (!profile || isOwnProfile || followPending) return;
    if (!currentUserId) {
      router.push('/login' as any);
      return;
    }

    setFollowPending(true);
    try {
      const next = followStats?.isFollowing
        ? await socialService.unfollowUser(profile.id)
        : await socialService.followUser(profile.id);

      setFollowStats(next);
    } catch (error) {
      console.warn('toggle follow failed:', error);
      Alert.alert(t('common.notification'), t('profile.public.followError'));
    } finally {
      setFollowPending(false);
    }
  }, [currentUserId, followPending, followStats?.isFollowing, isOwnProfile, profile, t]);

  const onMessageUser = useCallback(() => {
    if (!profile || isOwnProfile) return;

    if (!currentUserId) {
      router.push('/login' as any);
      return;
    }

    router.push(`/messages/${profile.id}` as any);
  }, [currentUserId, isOwnProfile, profile]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
        <View style={styles.centerStateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.centerStateText, { color: colors.muted }]}>{t('profile.public.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
        <View style={styles.errorStateWrap}>
          <Text style={[styles.errorStateText, { color: '#ef4444' }]}>{errorMessage || t('profile.public.notFound')}</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: colors.border, backgroundColor: colors.cardBg },
              pressed ? { opacity: 0.84 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.back')}
          >
            <Feather name="chevron-left" size={18} color={colors.title} />
            <Text style={[styles.backBtnText, { color: colors.title }]}>{t('notifications.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const resolvedAvatar = profile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(profile.fullName)}`;
  const followerCount = followStats?.followerCount ?? 0;
  const followingCount = followStats?.followingCount ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.iconBtn,
              { borderColor: colors.border, backgroundColor: colors.cardBg },
              pressed ? { opacity: 0.84 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.back')}
          >
            <Feather name="chevron-left" size={20} color={colors.title} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.title }]} numberOfLines={1}>
            {t('profile.title')}
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.profileCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
          <Image source={{ uri: resolvedAvatar }} style={styles.avatar} />

          <Text style={[styles.profileName, { color: colors.title }]} numberOfLines={1}>
            {profile.fullName}
          </Text>

          <Text style={[styles.profileBio, { color: colors.text }]}>
            {profile.bio || t('profile.public.noBio')}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.title }]}>{followerCount}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('profile.public.followers')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.title }]}>{followingCount}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{t('profile.public.following')}</Text>
            </View>
          </View>

          {!isOwnProfile ? (
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => void onToggleFollow()}
                disabled={followPending}
                style={({ pressed }) => [
                  styles.primaryAction,
                  {
                    backgroundColor: ExploreEaseColors.primary,
                    opacity: followPending ? 0.7 : (pressed ? 0.84 : 1),
                  },
                ]}
                accessibilityRole="button"
              >
                {followPending ? (
                  <ActivityIndicator size="small" color={colors.primaryText} />
                ) : (
                  <Text style={styles.primaryActionText}>
                    {followStats?.isFollowing ? t('profile.public.unfollow') : t('profile.public.follow')}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={onMessageUser}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Feather name="send" size={14} color={colors.title} />
                <Text style={[styles.secondaryActionText, { color: colors.title }]}>{t('social.feed.messagesButton')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('profile.public.recentEvents')}</Text>
          {recentEvents.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t('profile.public.emptyEvents')}</Text>
          ) : (
            recentEvents.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/event/${item.id}` as any)}
                style={({ pressed }) => [
                  styles.listItem,
                  { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)' },
                  pressed ? { opacity: 0.84 } : null,
                ]}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.title }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.itemMeta, { color: colors.muted }]} numberOfLines={1}>
                    {item.location || t('common.unknownLocation')}
                  </Text>
                </View>
                <Text style={[styles.itemDate, { color: colors.muted }]}>
                  {formatDate(item.startTime || item.createdAt)}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('profile.public.recentReviews')}</Text>
          {recentReviews.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t('profile.public.emptyReviews')}</Text>
          ) : (
            recentReviews.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (item.kind === 'event') {
                    router.push(`/event/${item.targetId}` as any);
                    return;
                  }

                  router.push({ pathname: '/destination/[id]', params: { id: item.targetId } } as any);
                }}
                style={({ pressed }) => [
                  styles.listItem,
                  { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)' },
                  pressed ? { opacity: 0.84 } : null,
                ]}
                accessibilityRole="button"
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.itemTitle, { color: colors.title }]} numberOfLines={1}>{item.targetTitle}</Text>
                  <Text style={[styles.itemMeta, { color: colors.muted }]} numberOfLines={2}>
                    {item.comment || t('review.card.noComment')}
                  </Text>
                </View>
                <View style={styles.reviewMetaCol}>
                  <Text style={[styles.reviewRating, { color: ExploreEaseColors.primary }]}>★ {item.rating.toFixed(1)}</Text>
                  <Text style={[styles.itemDate, { color: colors.muted }]}>{formatDate(item.createdAt)}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  profileCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '900',
  },
  profileBio: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  statsRow: {
    marginTop: 4,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 110,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(148,163,184,0.35)',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    marginTop: 6,
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryActionText: {
    color: '#001018',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryAction: {
    minWidth: 110,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listItem: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 11,
    fontWeight: '700',
  },
  reviewMetaCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  reviewRating: {
    fontSize: 12,
    fontWeight: '900',
  },
  centerStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  centerStateText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 22,
  },
  errorStateText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  backBtn: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
