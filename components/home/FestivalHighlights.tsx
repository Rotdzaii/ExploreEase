import { EventCard } from '@/components/events/EventCard';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import type { EventRow } from '@/src/services/eventService';
import React, { useCallback, useMemo, useRef } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';

type WebWheelEventLike = {
  nativeEvent?: {
    deltaX?: number;
    deltaY?: number;
  };
  preventDefault?: () => void;
};

type FestivalHighlightsProps = {
  events: EventRow[];
  loading: boolean;
  bookmarkedMap?: Record<string, boolean>;
  bookmarkPendingMap?: Record<string, boolean>;
  onPressEvent?: (event: EventRow) => void;
  onShareEvent?: (event: EventRow) => void;
  onToggleBookmark?: (eventId: string, nextBookmarked: boolean) => void;
  onPressViewAll?: () => void;
};

export function FestivalHighlights({
  events,
  loading,
  bookmarkedMap,
  bookmarkPendingMap,
  onPressEvent,
  onShareEvent,
  onToggleBookmark,
  onPressViewAll,
}: FestivalHighlightsProps) {
  const { isDark } = useTheme();
  const { t } = useI18n();

  const rowScrollRef = useRef<ScrollView | null>(null);
  const horizontalOffsetRef = useRef(0);

  const palette = useMemo(
    () => ({
      title: isDark ? '#ffffff' : '#0f172a',
      sub: isDark ? '#94a3b8' : '#64748b',
      cardBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
      sectionBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.74)',
    }),
    [isDark]
  );

  const onRowScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    horizontalOffsetRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  const onRowWheel = useCallback((event: WebWheelEventLike) => {
    if (Platform.OS !== 'web') return;

    const wheelEvent = event?.nativeEvent ?? {};
    const deltaX = Number(wheelEvent.deltaX ?? 0);
    const deltaY = Number(wheelEvent.deltaY ?? 0);
    const dominantDelta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;

    if (!Number.isFinite(dominantDelta) || Math.abs(dominantDelta) < 0.5) {
      return;
    }

    horizontalOffsetRef.current = Math.max(0, horizontalOffsetRef.current + dominantDelta);
    rowScrollRef.current?.scrollTo({ x: horizontalOffsetRef.current, y: 0, animated: false });
  }, []);

  const webWheelProps = Platform.OS === 'web'
    ? ({ onWheel: onRowWheel as unknown as (event: unknown) => void } as Record<string, unknown>)
    : {};

  return (
    <View style={[styles.sectionWrap, { backgroundColor: palette.sectionBg, borderColor: palette.cardBorder }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: palette.title }]}>{t('events.home.title')}</Text>
          <Text style={[styles.sectionSubtitle, { color: palette.sub }]}>{t('events.home.subtitle')}</Text>
        </View>

        <Pressable
          onPress={onPressViewAll}
          style={({ pressed }) => [styles.viewAllBtn, pressed ? { opacity: 0.84 } : null]}
          accessibilityRole="button"
          accessibilityLabel={t('events.home.viewAll')}
        >
          <Text style={styles.viewAllText}>{t('events.home.viewAll')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: palette.sub }]}>{t('events.home.loading')}</Text>
        </View>
      ) : null}

      {!loading && events.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: palette.sub }]}>{t('events.home.empty')}</Text>
        </View>
      ) : null}

      {!loading && events.length > 0 ? (
        <ScrollView
          ref={rowScrollRef}
          horizontal
          onScroll={onRowScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={Platform.OS === 'web'}
          contentContainerStyle={styles.row}
          decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
          {...webWheelProps}
        >
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              width={282}
              bookmarked={Boolean(bookmarkedMap?.[event.id])}
              bookmarkPending={Boolean(bookmarkPendingMap?.[event.id])}
              onPress={onPressEvent}
              onShare={onShareEvent}
              onToggleBookmark={onToggleBookmark}
              showCountdown
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 20,
  },
  headerRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  viewAllBtn: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 119, 182, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0, 119, 182, 0.30)',
  },
  viewAllText: {
    color: ExploreEaseColors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  row: {
    paddingHorizontal: 16,
    gap: 12,
  },
  stateWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '700',
  },
});