import { EventCard } from '@/components/events/EventCard';
import { FestivalShareModal } from '@/components/events/FestivalShareModal';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { eventBookmarkService } from '@/src/services/eventBookmarkService';
import { eventService, type EventRow } from '@/src/services/eventService';
import { supabase } from '@/src/services/supabase';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type FestivalTab = 'vietnam' | 'global';

const VIETNAM_LOCATION_MARKERS = [
  'viet nam',
  'việt nam',
  'vietnam',
  'ha noi',
  'hanoi',
  'ho chi minh',
  'ho chi minh city',
  'hcm',
  'da nang',
  'sai gon',
  'saigon',
  'nha trang',
  'can tho',
  'phu quoc',
  'quang ninh',
  'hai phong',
  'hue',
  'hoi an',
  'vung tau',
  'dong nai',
  'binh duong',
  'đà nẵng',
  'hà nội',
  'hồ chí minh',
  'tp.hcm',
  'tp hcm',
];

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isVietnamLocation = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  return VIETNAM_LOCATION_MARKERS.some((marker) => normalized.includes(marker));
};

export default function FestivalsScreen() {
  const { isDark } = useTheme();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<FestivalTab>('vietnam');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bookmarkedMap, setBookmarkedMap] = useState<Record<string, boolean>>({});
  const [bookmarkPendingMap, setBookmarkPendingMap] = useState<Record<string, boolean>>({});
  const [shareEvent, setShareEvent] = useState<EventRow | null>(null);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      title: isDark ? '#ffffff' : '#0f172a',
      muted: isDark ? '#94a3b8' : '#64748b',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      card: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
    }),
    [isDark]
  );

  const loadEvents = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setErrorMessage(null);
      const rows = await eventService.getEvents({
        orderBy: 'created_at',
        ascending: false,
        limit: 500,
      });

      const mapped = (rows ?? [])
        .filter((item) => item.approval_status !== 'rejected')
        .sort((a, b) => {
          const aCreated = new Date(a.created_at ?? '').getTime();
          const bCreated = new Date(b.created_at ?? '').getTime();
          const safeACreated = Number.isFinite(aCreated) ? aCreated : 0;
          const safeBCreated = Number.isFinite(bCreated) ? bCreated : 0;
          if (safeBCreated !== safeACreated) return safeBCreated - safeACreated;

          const aStart = new Date(a.start_time).getTime();
          const bStart = new Date(b.start_time).getTime();
          const safeAStart = Number.isFinite(aStart) ? aStart : 0;
          const safeBStart = Number.isFinite(bStart) ? bStart : 0;
          return safeBStart - safeAStart;
        });

      setEvents(mapped);
    } catch (err: any) {
      const message = String(err?.message ?? '').trim() || t('events.festivals.loadFailed');
      setErrorMessage(message);
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void loadEvents(false);
  }, [loadEvents]);

  useEffect(() => {
    let alive = true;

    const resolveCurrentUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!alive) return;
        setCurrentUserId(data.user?.id ?? null);
      } catch (error: any) {
        if (!alive) return;
        console.warn('festivals resolveCurrentUser failed:', error?.message ?? error);
        setCurrentUserId(null);
      }
    };

    void resolveCurrentUser();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void resolveCurrentUser();
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadBookmarks = async () => {
      if (events.length === 0) {
        setBookmarkedMap({});
        return;
      }

      try {
        const bookmarkedIds = await eventBookmarkService.getBookmarkedIds(currentUserId);
        if (!alive) return;

        const bookmarkedSet = new Set(bookmarkedIds);
        const nextMap: Record<string, boolean> = {};
        for (const row of events) {
          nextMap[row.id] = bookmarkedSet.has(row.id);
        }

        setBookmarkedMap(nextMap);
      } catch (error: any) {
        if (!alive) return;
        console.warn('festivals loadBookmarks failed:', error?.message ?? error);
        setBookmarkedMap({});
      }
    };

    void loadBookmarks();

    return () => {
      alive = false;
    };
  }, [currentUserId, events]);

  const vietnamEvents = useMemo(
    () => events.filter((event) => isVietnamLocation(event.location || '')),
    [events]
  );

  const globalEvents = useMemo(
    () => events.filter((event) => !isVietnamLocation(event.location || '')),
    [events]
  );

  useEffect(() => {
    if (events.length === 0) return;

    if (activeTab === 'vietnam' && vietnamEvents.length === 0 && globalEvents.length > 0) {
      setActiveTab('global');
      return;
    }

    if (activeTab === 'global' && globalEvents.length === 0 && vietnamEvents.length > 0) {
      setActiveTab('vietnam');
    }
  }, [activeTab, events.length, globalEvents.length, vietnamEvents.length]);

  const visibleEvents = activeTab === 'vietnam' ? vietnamEvents : globalEvents;

  const onPressEvent = useCallback((event: EventRow) => {
    router.push(`/event/${event.id}` as any);
  }, []);

  const onShareEvent = useCallback((event: EventRow) => {
    setShareEvent(event);
  }, []);

  const closeShareModal = useCallback(() => {
    setShareEvent(null);
  }, []);

  const onToggleBookmark = useCallback(async (eventId: string, nextBookmarked: boolean) => {
    const safeEventId = String(eventId ?? '').trim();
    if (!safeEventId) return;

    setBookmarkPendingMap((prev) => ({
      ...prev,
      [safeEventId]: true,
    }));
    setBookmarkedMap((prev) => ({
      ...prev,
      [safeEventId]: nextBookmarked,
    }));

    try {
      await eventBookmarkService.setBookmarked(safeEventId, nextBookmarked, currentUserId);
    } catch (error: any) {
      console.warn('festivals onToggleBookmark failed:', error?.message ?? error);
      setBookmarkedMap((prev) => ({
        ...prev,
        [safeEventId]: !nextBookmarked,
      }));
      Alert.alert(t('common.notification'), t('event.detail.bookmarkToggleFailed'));
    } finally {
      setBookmarkPendingMap((prev) => {
        const next = { ...prev };
        delete next[safeEventId];
        return next;
      });
    }
  }, [currentUserId, t]);

  const emptyText = activeTab === 'vietnam'
    ? t('events.festivals.emptyVietnam')
    : t('events.festivals.emptyGlobal');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <View style={[styles.headerWrap, { borderColor: colors.border }]}> 
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed ? { opacity: 0.82 } : null]}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.back')}
        >
          <Feather name="chevron-left" size={22} color={colors.title} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.title }]}>{t('events.festivals.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{t('events.festivals.subtitle')}</Text>
        </View>
      </View>

      <View style={[styles.tabRow, { borderColor: colors.border }]}> 
        <Pressable
          onPress={() => setActiveTab('vietnam')}
          style={({ pressed }) => [
            styles.tabBtn,
            activeTab === 'vietnam' ? styles.tabBtnActive : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, { color: activeTab === 'vietnam' ? '#001018' : colors.title }]}>
            {t('events.festivals.tabVietnam')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('global')}
          style={({ pressed }) => [
            styles.tabBtn,
            activeTab === 'global' ? styles.tabBtnActive : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, { color: activeTab === 'global' ? '#001018' : colors.title }]}>
            {t('events.festivals.tabGlobal')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadEvents(true)} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={ExploreEaseColors.primary} />
            <Text style={[styles.stateText, { color: colors.muted }]}>{t('events.festivals.loading')}</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateWrap}>
            <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage}</Text>
            <Pressable
              onPress={() => void loadEvents(false)}
              style={({ pressed }) => [styles.retryBtn, pressed ? { opacity: 0.84 } : null]}
            >
              <Text style={styles.retryText}>{t('events.festivals.retry')}</Text>
            </Pressable>
          </View>
        ) : visibleEvents.length === 0 ? (
          <View style={styles.stateWrap}>
            <Text style={[styles.stateText, { color: colors.muted }]}>{emptyText}</Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {visibleEvents.map((event) => (
              <View key={event.id} style={[styles.cardWrap, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <EventCard
                  event={event}
                  bookmarked={Boolean(bookmarkedMap[event.id])}
                  bookmarkPending={Boolean(bookmarkPendingMap[event.id])}
                  onPress={onPressEvent}
                  onShare={onShareEvent}
                  onToggleBookmark={onToggleBookmark}
                  showCountdown
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <FestivalShareModal
        visible={!!shareEvent}
        event={shareEvent}
        currentUserId={currentUserId}
        onClose={closeShareModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerWrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 26,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  tabBtnActive: {
    backgroundColor: ExploreEaseColors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '900',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 34,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 4,
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 211, 238, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.30)',
  },
  retryText: {
    color: ExploreEaseColors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  cardList: {
    gap: 14,
  },
  cardWrap: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
});