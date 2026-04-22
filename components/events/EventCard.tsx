import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { getEventStatusByTime, type EventRow, type EventStatus } from '@/src/services/eventService';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ImageBackground,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

type EventCardProps = {
  event: EventRow;
  bookmarked?: boolean;
  bookmarkPending?: boolean;
  showCountdown?: boolean;
  width?: number;
  onPress?: (event: EventRow) => void;
  onShare?: (event: EventRow) => void;
  onToggleBookmark?: (eventId: string, bookmarked: boolean) => void;
};

const toStatusLabel = (status: EventStatus, t: (key: string) => string) => {
  if (status === 'ongoing') return t('event.status.ongoing');
  if (status === 'completed') return t('event.status.completed');
  return t('event.status.incoming');
};

const toStatusColor = (status: EventStatus) => {
  if (status === 'ongoing') return '#22c55e';
  if (status === 'completed') return '#64748b';
  return '#0ea5e9';
};

const toPriceLabel = (price: number, formatPricePerPerson: (price: number) => string, t: (key: string) => string) => {
  if (price <= 0) return t('common.free');
  return formatPricePerPerson(price);
};

const toDateLabel = (iso: string, locale: string, t: (key: string) => string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return t('events.discovery.unknownTime');

  return dt.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCountdown = (secondsLeft: number) => {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
};

export function EventCard({
  event,
  bookmarked = false,
  bookmarkPending = false,
  showCountdown = true,
  width,
  onPress,
  onShare,
  onToggleBookmark,
}: EventCardProps) {
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const { formatPricePerPerson } = useCurrency();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const [isBookmarked, setIsBookmarked] = useState(Boolean(bookmarked));
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    setIsBookmarked(Boolean(bookmarked));
  }, [bookmarked]);

  const liveStatus = useMemo<EventStatus>(() => {
    return getEventStatusByTime(event.start_time, event.end_time, new Date(nowTs));
  }, [event.end_time, event.start_time, nowTs]);

  const shouldRunCountdown = showCountdown && isBookmarked && liveStatus === 'incoming';

  useEffect(() => {
    if (!shouldRunCountdown) return;

    const intervalId = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [shouldRunCountdown]);

  const countdownLabel = useMemo(() => {
    if (!shouldRunCountdown) return null;

    const start = dayjs(event.start_time);
    if (!start.isValid()) return null;

    const diffSeconds = start.diff(dayjs(nowTs), 'second');
    if (diffSeconds <= 0) return t('events.card.countdownNow');
    return formatCountdown(diffSeconds);
  }, [event.start_time, nowTs, shouldRunCountdown, t]);

  const statusLabel = toStatusLabel(liveStatus, t);
  const statusColor = toStatusColor(liveStatus);

  const cardBackground = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)';
  const titleColor = isDark ? '#ffffff' : '#0f172a';
  const mutedText = isDark ? '#cbd5e1' : '#475569';

  const priceLabel = toPriceLabel(Number(event.price ?? 0), formatPricePerPerson, t);
  const startLabel = toDateLabel(event.start_time, locale, t);

  return (
    <Pressable
      onPress={() => onPress?.(event)}
      style={({ pressed, hovered }) => [
        styles.card,
        {
          ...(typeof width === 'number' ? { width } : null),
          backgroundColor: cardBackground,
          borderColor: cardBorder,
        },
        Platform.OS === 'web' && hovered ? { opacity: 0.98 } : null,
        pressed ? { opacity: 0.86 } : null,
      ]}
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
    >
      <ImageBackground
        source={{ uri: event.image_url || FALLBACK_EVENT_IMAGE }}
        style={styles.image}
        imageStyle={styles.imageInner}
      >
        <View style={styles.imageOverlay} />

        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>

        {countdownLabel ? (
          <View style={styles.countdownBadge}>
            <Feather name="clock" size={12} color="#ffffff" />
            <Text style={styles.countdownText}>{countdownLabel}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={(eventPress) => {
              eventPress.stopPropagation();
              const next = !isBookmarked;
              setIsBookmarked(next);
              onToggleBookmark?.(event.id, next);
            }}
            disabled={bookmarkPending}
            style={({ pressed }) => [styles.iconBtn, pressed ? { opacity: 0.82 } : null]}
            accessibilityRole="button"
            accessibilityLabel={
              bookmarkPending
                ? t('event.detail.bookmarkUpdating')
                : t(isBookmarked ? 'event.detail.bookmarkedAction' : 'event.detail.bookmarkAction')
            }
          >
            {bookmarkPending ? (
              <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
            ) : (
              <Feather name="bookmark" size={16} color={isBookmarked ? ExploreEaseColors.primary : '#ffffff'} />
            )}
          </Pressable>

          <Pressable
            onPress={(eventPress) => {
              eventPress.stopPropagation();
              onShare?.(event);
            }}
            style={({ pressed }) => [styles.iconBtn, pressed ? { opacity: 0.82 } : null]}
            accessibilityRole="button"
            accessibilityLabel={t('event.detail.shareAction')}
          >
            <Feather name="share-2" size={16} color="#ffffff" />
          </Pressable>
        </View>
      </ImageBackground>

      <View style={styles.body}>
        <View style={styles.categoryRow}>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText} numberOfLines={1}>{event.category}</Text>
          </View>
          <Text style={[styles.priceText, { color: titleColor }]} numberOfLines={1}>{priceLabel}</Text>
        </View>

        <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.metaRow}>
          <Feather name="calendar" size={14} color={ExploreEaseColors.primary} />
          <Text style={[styles.metaText, { color: mutedText }]} numberOfLines={1}>{startLabel}</Text>
        </View>

        <View style={styles.metaRow}>
          <Feather name="map-pin" size={14} color={ExploreEaseColors.primary} />
          <Text style={[styles.metaText, { color: mutedText }]} numberOfLines={1}>{event.location}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 28px rgba(2, 6, 23, 0.14)' } as any)
      : {
          shadowColor: '#020617',
          shadowOpacity: 0.16,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }),
  },
  image: {
    height: 170,
    justifyContent: 'space-between',
    padding: 10,
  },
  imageInner: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.28)',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 2,
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  countdownBadge: {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: [{ translateX: -52 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(249, 115, 22, 0.92)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  actionRow: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.44)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 12,
    gap: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryPill: {
    maxWidth: '64%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.28)',
  },
  categoryText: {
    color: ExploreEaseColors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  priceText: {
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
});