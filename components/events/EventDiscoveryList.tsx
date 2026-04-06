import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import type { EventRow } from '@/src/services/eventService';
import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

export type EventPriceFilter = 'all' | 'free' | 'paid';

type EventDiscoveryListProps = {
  events: EventRow[];
  loading: boolean;
  refreshing?: boolean;
  errorMessage?: string | null;
  selectedCategory: string;
  priceFilter: EventPriceFilter;
  likedMap: Record<string, boolean>;
  onSelectCategory: (category: string) => void;
  onSelectPriceFilter: (filter: EventPriceFilter) => void;
  onResetFilters: () => void;
  onToggleLike: (eventId: string) => void;
  onEventSelect?: (event: EventRow) => void;
  onPressCreate?: () => void;
  onRefresh?: () => void;
};

const BASE_CATEGORIES = ['all', 'Music', 'Food', 'Wellness', 'Art', 'Sports', 'Tech'];

const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const toDisplayDateTime = (iso: string, locale: string, t: TranslateFn) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('events.discovery.unknownTime');

  const dateText = d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeText = d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateText} • ${timeText}`;
};

const toDisplayPrice = (price: number, locale: string, t: TranslateFn) => {
  if (price <= 0) return t('common.free');
  return `${price.toLocaleString(locale)} ${t('common.currencyVndShort')}`;
};

const toStatusLabel = (status: EventRow['status'], t: TranslateFn) => {
  if (status === 'ongoing') return t('event.status.ongoing');
  if (status === 'completed') return t('event.status.completed');
  return t('event.status.incoming');
};

const toCategoryLabel = (category: string, t: TranslateFn) => {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'all') return t('common.all');
  if (normalized === 'music') return t('events.category.music');
  if (normalized === 'food') return t('events.category.food');
  if (normalized === 'wellness') return t('events.category.wellness');
  if (normalized === 'art') return t('events.category.art');
  if (normalized === 'sports') return t('events.category.sports');
  if (normalized === 'tech') return t('events.category.tech');
  if (normalized === 'education') return t('events.category.education');
  if (normalized === 'entertainment') return t('events.category.entertainment');
  if (normalized === 'networking') return t('events.category.networking');
  if (normalized === 'charity') return t('events.category.charity');
  return category;
};

export function EventDiscoveryList({
  events,
  loading,
  refreshing = false,
  errorMessage,
  selectedCategory,
  priceFilter,
  likedMap,
  onSelectCategory,
  onSelectPriceFilter,
  onResetFilters,
  onToggleLike,
  onEventSelect,
  onPressCreate,
  onRefresh,
}: EventDiscoveryListProps) {
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const [showFilters, setShowFilters] = useState(false);

  const isWide = width >= 900;
  const cardWidth = isWide ? '48.5%' : '100%';

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      title: isDark ? '#ffffff' : '#0f172a',
      body: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      chip: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
    }),
    [isDark]
  );

  const categories = useMemo(() => {
    const merged = [...BASE_CATEGORIES, ...events.map((item) => item.category || '')]
      .map((item) => item.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of merged) {
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }

    if (!result.some((item) => item.toLowerCase() === 'all')) {
      result.unshift('all');
    }

    return result;
  }, [events]);

  const isFiltered = selectedCategory !== 'all' || priceFilter !== 'all';
  const activeFilterCount = (selectedCategory !== 'all' ? 1 : 0) + (priceFilter !== 'all' ? 1 : 0);

  return (
    <ScrollView
      style={[styles.safe, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ExploreEaseColors.primary} /> : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerWrap}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.title }]}>{t('events.discovery.title')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{t('events.discovery.subtitle')}</Text>
        </View>

        <Pressable
          onPress={onPressCreate}
          style={({ pressed, hovered }) => [
            styles.createBtn,
            hovered ? { opacity: 0.95 } : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
        >
          <Feather name="plus" size={16} color="#001018" />
          <Text style={styles.createBtnText}>{t('explore.createEvent')}</Text>
        </Pressable>
      </View>

      <View style={[styles.filterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.filterHeaderRow}>
          <Pressable
            onPress={() => setShowFilters((prev) => !prev)}
            style={({ pressed, hovered }) => [
              styles.filterToggleBtn,
              {
                backgroundColor: 'rgba(34, 211, 238, 0.12)',
                borderColor: 'rgba(34, 211, 238, 0.30)',
              },
              hovered ? { opacity: 0.96 } : null,
              pressed ? { opacity: 0.84 } : null,
            ]}
            accessibilityRole="button"
          >
            <Feather name="filter" size={15} color={ExploreEaseColors.primary} />
            <Text style={styles.filterToggleText}>{t('common.filter')}</Text>
            {isFiltered ? (
              <View style={styles.filterCountPill}>
                <Text style={styles.filterCountText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>

          {isFiltered ? (
            <Pressable
              onPress={onResetFilters}
              style={({ pressed, hovered }) => [
                styles.resetBtn,
                hovered ? { opacity: 0.96 } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              <Feather name="x" size={14} color={colors.muted} />
              <Text style={[styles.resetText, { color: colors.muted }]}>{t('common.reset')}</Text>
            </Pressable>
          ) : null}
        </View>

        {showFilters ? (
          <View style={[styles.filterOptions, { borderColor: colors.border }]}>
            <View>
              <Text style={[styles.filterLabel, { color: colors.title }]}>{t('explore.filter.category')}</Text>
              <View style={styles.filterChipWrap}>
                {categories.map((category) => {
                  const isSelected = selectedCategory.toLowerCase() === category.toLowerCase();
                  const label = toCategoryLabel(category, t);

                  return (
                    <Pressable
                      key={category}
                      onPress={() => onSelectCategory(isSelected ? 'all' : category)}
                      style={({ pressed, hovered }) => [
                        styles.chip,
                        {
                          backgroundColor: isSelected ? ExploreEaseColors.primary : colors.chip,
                          borderColor: isSelected ? ExploreEaseColors.primary : colors.border,
                        },
                        hovered ? { opacity: 0.96 } : null,
                        pressed ? { opacity: 0.84 } : null,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#001018' : colors.body }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.filterLabel, { color: colors.title }]}>{t('explore.filter.price')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['all', 'free', 'paid'] as const).map((value) => {
                  const isSelected = priceFilter === value;
                  const label = value === 'all' ? t('common.all') : value === 'free' ? t('common.free') : t('common.paid');

                  return (
                    <Pressable
                      key={value}
                      onPress={() => onSelectPriceFilter(value)}
                      style={({ pressed, hovered }) => [
                        styles.priceChip,
                        {
                          backgroundColor: isSelected ? ExploreEaseColors.primary : colors.chip,
                          borderColor: isSelected ? ExploreEaseColors.primary : colors.border,
                        },
                        hovered ? { opacity: 0.96 } : null,
                        pressed ? { opacity: 0.84 } : null,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, { color: isSelected ? '#001018' : colors.body }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: colors.muted }]}>{t('explore.loadingResults')}</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage}</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: colors.muted }]}>{t('events.discovery.empty')}</Text>
        </View>
      ) : (
        <View style={styles.gridWrap}>
          {events.map((event) => {
            const liked = !!likedMap[event.id];
            const free = Number(event.price ?? 0) <= 0;

            return (
              <Pressable
                key={event.id}
                onPress={() => onEventSelect?.(event)}
                style={({ pressed, hovered }) => [
                  styles.card,
                  {
                    width: cardWidth,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                  hovered ? { opacity: 0.98 } : null,
                  pressed ? { opacity: 0.88 } : null,
                ]}
                accessibilityRole="button"
              >
                <View style={styles.imageWrap}>
                  <Image
                    source={{ uri: event.image_url || FALLBACK_EVENT_IMAGE }}
                    style={styles.image}
                    resizeMode="cover"
                  />

                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{event.category}</Text>
                  </View>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      onToggleLike(event.id);
                    }}
                    style={({ pressed: likedPressed }) => [
                      styles.likeBtn,
                      likedPressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Feather
                      name="heart"
                      size={17}
                      color={liked ? '#ef4444' : '#94a3b8'}
                      style={liked ? { transform: [{ scale: 1.06 }] } : undefined}
                    />
                  </Pressable>

                  <View style={[styles.priceBadge, free ? styles.freeBadge : null]}>
                    {!free ? <Feather name="dollar-sign" size={12} color="#ffffff" /> : null}
                    <Text style={[styles.priceText, free ? { color: '#001018' } : null]}>{toDisplayPrice(Number(event.price ?? 0), locale, t)}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={[styles.eventTitle, { color: colors.title }]} numberOfLines={2}>
                    {event.title}
                  </Text>

                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={14} color={ExploreEaseColors.primary} />
                    <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
                      {toDisplayDateTime(event.start_time, locale, t)}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Feather name="map-pin" size={14} color={ExploreEaseColors.primary} />
                    <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
                      {event.location}
                    </Text>
                  </View>

                  <View style={[styles.footerRow, { borderColor: colors.border }]}>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{toStatusLabel(event.status, t)}</Text>
                    </View>

                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onEventSelect?.(event);
                      }}
                      style={({ pressed: btnPressed }) => [styles.viewBtn, btnPressed ? { opacity: 0.84 } : null]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.viewBtnText}>{t('common.view')}</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 14,
  },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ExploreEaseColors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
  },
  createBtnText: {
    color: '#001018',
    fontSize: 13,
    fontWeight: '900',
  },
  filterCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterToggleBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterToggleText: {
    color: ExploreEaseColors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  filterCountPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: ExploreEaseColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterCountText: {
    color: '#001018',
    fontSize: 11,
    fontWeight: '900',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterOptions: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  priceChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 42,
    gap: 10,
  },
  stateText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    height: 178,
    backgroundColor: 'rgba(34, 211, 238, 0.10)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    borderRadius: 999,
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryBadgeText: {
    color: '#001018',
    fontSize: 11,
    fontWeight: '900',
  },
  likeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 3px 8px rgba(15, 23, 42, 0.16)' }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.14,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        }),
  },
  priceBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  freeBadge: {
    backgroundColor: 'rgba(34, 211, 238, 0.92)',
  },
  priceText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  cardBody: {
    padding: 12,
    gap: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
    minHeight: 42,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  footerRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    color: ExploreEaseColors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  viewBtn: {
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewBtnText: {
    color: '#001018',
    fontSize: 12,
    fontWeight: '900',
  },
});
