import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { itineraryService, type ItineraryItemRow } from '@/src/services/itineraryService';
import { optimizeDayRoute } from '@/utils/routeOptimization';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ImageBackground, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

type TimelineItem = {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sortOrder?: number | null;
  raw: ItineraryItemRow;
};

type DayTimelineProps = {
  tripId: string;
  day: number;
  optimized?: boolean;
  onPressReminder?: (item: TimelineItem) => void;
  onPressAddDestination?: () => void;
};

const toTimelineItem = (row: ItineraryItemRow): TimelineItem => ({
  id: row.id,
  name: row.name,
  description: row.description,
  image: row.image_url,
  startTime: row.start_time,
  endTime: row.end_time,
  latitude: row.latitude,
  longitude: row.longitude,
  sortOrder: row.sort_order ?? null,
  raw: row,
});

const openGoogleMaps = async (item: TimelineItem) => {
  const lat = item.latitude;
  const lng = item.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    Alert.alert('Chưa có tọa độ', 'Điểm đến này chưa có thông tin tọa độ để mở bản đồ.');
    return;
  }

  const label = item.name ? encodeURIComponent(item.name) : '';
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${label ? `(${label})` : ''}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('Không thể mở bản đồ', 'Thiết bị không hỗ trợ mở liên kết bản đồ.');
    return;
  }

  await Linking.openURL(url);
};

const formatTimeRange = (item: TimelineItem) => {
  const a = item.startTime;
  const b = item.endTime;
  if (!a && !b) return null;
  if (a && b) return `${a} - ${b}`;
  return a ?? b ?? null;
};

export function DayTimeline({
  tripId,
  day,
  optimized = false,
  onPressReminder,
  onPressAddDestination,
}: DayTimelineProps) {
  const { isDark } = useTheme();
  const [items, setItems] = useState<ItineraryItemRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const colors = useMemo(
    () => ({
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      softText: isDark ? '#e2e8f0' : '#0f172a',
    }),
    [isDark]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await itineraryService.getItemsByTripAndDay(tripId, day);
      setItems(data);
    } catch (err: any) {
      console.warn('getItemsByTripAndDay failed:', err?.message ?? err);
      setItems([]);
      setErrorMessage('Không thể tải lịch trình.');
    } finally {
      setLoading(false);
    }
  }, [day, tripId]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      await load();
    };

    run().catch(() => {
      // handled in load()
    });

    return () => {
      alive = false;
      void alive;
    };
  }, [load]);

  const displayItems = useMemo(() => {
    const base = items ?? [];
    const rows = optimized ? optimizeDayRoute(base) : base;
    return rows.map(toTimelineItem);
  }, [items, optimized]);

  const onReminder = useCallback(
    (item: TimelineItem) => {
      if (onPressReminder) return onPressReminder(item);
      Alert.alert('Nhắc nhở', 'Chưa gắn xử lý nhắc nhở cho mục này.');
    },
    [onPressReminder]
  );

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <Text style={[styles.loadingText, { color: colors.subtitle }]}>Đang tải lịch trình...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={[styles.errorWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <View style={styles.errorHeader}>
          <View style={[styles.errorIcon, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.10)' }]}
          >
            <Feather name="alert-triangle" size={16} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.errorTitle, { color: colors.title }]}>{errorMessage}</Text>
            <Text style={[styles.errorText, { color: colors.subtitle }]}>Kiểm tra mạng hoặc đăng nhập rồi thử lại.</Text>
          </View>
        </View>

        <Pressable
          onPress={() => void load()}
          style={({ pressed, hovered }) => [
            styles.retryBtn,
            { backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)' },
            hovered ? { opacity: 0.95 } : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Thử tải lại lịch trình"
        >
          <Feather name="refresh-cw" size={16} color={ExploreEaseColors.primary} />
          <Text style={[styles.retryText, { color: ExploreEaseColors.primary }]}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  if (!displayItems.length) {
    return (
      <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <View style={styles.emptyHeader}>
          <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.10)' }]}>
            <Feather name="map-pin" size={16} color={ExploreEaseColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.emptyTitle, { color: colors.title }]}>Ngày {day} đang trống</Text>
            <Text style={[styles.emptyText, { color: colors.subtitle }]}>Thêm điểm đến để bắt đầu tối ưu lộ trình.</Text>
          </View>
        </View>

        <Pressable
          onPress={() => {
            if (onPressAddDestination) return onPressAddDestination();
            Alert.alert('Thêm điểm đến', 'Chưa gắn màn hình thêm điểm đến.');
          }}
          style={({ pressed, hovered }) => [
            styles.addBtn,
            { backgroundColor: ExploreEaseColors.primary },
            hovered ? { opacity: 0.95 } : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Thêm điểm đến"
        >
          <Feather name="plus" size={16} color="#001018" />
          <Text style={styles.addBtnText}>Thêm điểm đến</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {displayItems.map((item, index) => {
        const timeRange = formatTimeRange(item);
        const badge = index + 1;

        return (
          <View key={item.id} style={styles.row}>
            {index < displayItems.length - 1 && (
              <View style={[styles.timelineLine, { backgroundColor: isDark ? 'rgba(34,211,238,0.35)' : 'rgba(34,211,238,0.35)' }]} />
            )}

            <View style={[styles.dot, { borderColor: colors.cardBg, backgroundColor: ExploreEaseColors.primary }]}
            >
              <Text style={styles.dotText}>{badge}</Text>
            </View>

            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
              <View style={styles.imageWrap}>
                <ImageBackground
                  source={{ uri: item.image || 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80' }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <View style={styles.imageOverlay} />
              </View>

              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.title }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.description && (
                  <Text style={[styles.cardDesc, { color: colors.subtitle }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}

                <View style={styles.timeRow}>
                  <View style={styles.timeLeft}>
                    <Feather name="clock" size={14} color={ExploreEaseColors.primary} />
                    <Text style={[styles.timeText, { color: ExploreEaseColors.primary }]}>
                      {timeRange ?? 'Chưa có giờ'}
                    </Text>
                  </View>

                  {timeRange && (
                    <View style={[styles.durationPill, { backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)' }]}>
                      <Text style={[styles.durationText, { color: ExploreEaseColors.primary }]}>Lịch trình</Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => void openGoogleMaps(item)}
                    style={({ pressed, hovered }) => [
                      styles.routeBtn,
                      {
                        backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)',
                      },
                      (hovered ? { opacity: 0.95 } : null),
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.routeBtnText, { color: ExploreEaseColors.primary }]}>Xem đường đi</Text>
                    <Feather name="arrow-right" size={16} color={ExploreEaseColors.primary} />
                  </Pressable>

                  <Pressable
                    onPress={() => onReminder(item)}
                    style={({ pressed, hovered }) => [
                      styles.bellBtn,
                      {
                        backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)',
                      },
                      (hovered ? { opacity: 0.95 } : null),
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Đặt nhắc nhở"
                  >
                    <Feather name="bell" size={18} color={ExploreEaseColors.primary} />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 14,
  },
  loadingWrap: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorWrap: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  retryBtn: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '900',
  },
  emptyWrap: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  emptyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addBtn: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: {
    color: '#001018',
    fontSize: 13,
    fontWeight: '900',
  },

  row: {
    position: 'relative',
    paddingLeft: 46,
  },
  timelineLine: {
    position: 'absolute',
    left: 16,
    top: 38,
    width: 3,
    height: 62,
    borderRadius: 2,
    opacity: 0.7,
  },
  dot: {
    position: 'absolute',
    left: 0,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageWrap: {
    height: 120,
    backgroundColor: '#0b1220',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cardBody: {
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  cardDesc: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },

  timeRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  durationPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '900',
  },

  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  routeBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
