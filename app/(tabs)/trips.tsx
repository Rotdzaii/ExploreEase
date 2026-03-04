import { DayTimeline } from '@/components/trips/DayTimeline';
import { ShareTripBottomSheet } from '@/components/trips/ShareTripBottomSheet';
import { TripActionBar } from '@/components/trips/TripActionBar';
import { TripCard } from '@/components/trips/TripCard';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { itineraryService } from '@/src/services/itineraryService';
import { reminderService } from '@/src/services/reminderService';
import { supabase } from '@/src/services/supabase';
import { tripService, type TripRow } from '@/src/services/tripService';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Trip = {
  id: string;
  name: string;
  cover: string;
  startDate: string;
  endDate: string;
  destination: string;
  daysCount: number;
};

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80';

const parseDateOnly = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  const dateOnly = match ? match[0] : value;
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day);
};

const toVnShortDate = (d: Date | null): string => {
  if (!d) return '';
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${day} Tháng ${month}`;
};

const toDaysCount = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.min(days, 60);
};

const mapTripRowToTrip = (row: TripRow): Trip => {
  const start = parseDateOnly(row.start_date ?? null);
  const end = parseDateOnly(row.end_date ?? null);
  const daysCount = toDaysCount(start, end);

  return {
    id: row.id,
    name: row.name,
    destination: row.destination ?? '',
    startDate: toVnShortDate(start),
    endDate: toVnShortDate(end),
    daysCount,
    cover: row.cover ?? FALLBACK_COVER,
  };
};

export default function TripsScreen() {
  const { isDark } = useTheme();
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
    }),
    [isDark]
  );

  const loadTrips = useCallback(async () => {
    setLoadingTrips(true);
    setTripsError(null);

    try {
      const rows = await tripService.getTripsForCurrentUser();
      setTrips((rows ?? []).map(mapTripRowToTrip));
    } catch (err: any) {
      console.warn('loadTrips failed:', err?.message ?? err);
      setTrips([]);
      setTripsError('Không thể tải danh sách chuyến đi.');
    } finally {
      setLoadingTrips(false);
    }
  }, []);

  const ensureLoggedIn = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (data.user?.id) return true;
    } catch (err: any) {
      console.warn('ensureLoggedIn (trips) failed:', err?.message ?? err);
    }

    Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập để tạo chuyến đi.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng nhập', onPress: () => router.push('/login' as any) },
    ]);
    return false;
  }, []);

  const createTrip = useCallback(async () => {
    if (creatingTrip) return;

    const ok = await ensureLoggedIn();
    if (!ok) return;

    setCreatingTrip(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const payload = {
        name: 'Chuyến đi mới',
        destination: null,
        cover: null,
        start_date: todayIso,
        end_date: todayIso,
      };

      console.log('[TripsScreen] createTrip payload:', payload);
      const newRow = await tripService.createTripForCurrentUser(payload);
      console.log('[TripsScreen] createTrip success:', newRow);

      const newTrip = mapTripRowToTrip(newRow);
      setTrips((prev) => [newTrip, ...(prev ?? [])]);
      setSelectedTrip(newTrip);
      setSelectedDay(1);
      setTripsError(null);
    } catch (err: any) {
      console.log('[TripsScreen] createTrip error:', err);
      console.warn('createTrip (trips) failed:', err?.message ?? err);
      Alert.alert('Không thể tạo chuyến đi', 'Vui lòng thử lại sau.');
    } finally {
      setCreatingTrip(false);
    }
  }, [creatingTrip, ensureLoggedIn]);

  useFocusEffect(
    useCallback(() => {
      void loadTrips();
      return () => {};
    }, [loadTrips])
  );

  const tripCode = useMemo(() => {
    if (!selectedTrip) return '';
    const suffix = selectedTrip.id.replace(/-/g, '').slice(0, 7).toUpperCase();
    return `EE-${suffix}`;
  }, [selectedTrip]);

  const handleSelectTrip = useCallback((trip: Trip) => {
    setSelectedTrip(trip);
    setSelectedDay(1);
    setOptimized(false);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTrip(null);
    setSelectedDay(1);
    setIsShareOpen(false);
    setOptimized(false);
    setNotes([]);
    setNoteDraft('');
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!selectedTrip) return;
      try {
        const data = await itineraryService.getNotes(selectedTrip.id, selectedDay);
        if (!alive) return;
        setNotes(data);
      } catch (err: any) {
        if (!alive) return;
        console.warn('getNotes failed:', err?.message ?? err);
        setNotes([]);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [selectedDay, selectedTrip]);

  const addNote = useCallback(async () => {
    const tripId = selectedTrip?.id;
    if (!tripId) return;

    const trimmed = noteDraft.trim();
    if (!trimmed) return;

    setNoteDraft('');

    try {
      const next = await itineraryService.addNote(tripId, selectedDay, trimmed);
      setNotes(next ?? []);
    } catch (err: any) {
      console.warn('addNote failed:', err?.message ?? err);
      Alert.alert('Không thể lưu ghi chú', 'Vui lòng thử lại sau.');
    }
  }, [noteDraft, selectedDay, selectedTrip]);

  const onPressReminder = useCallback(
    (item: any) => {
      if (!selectedTrip) return;

      const now = new Date();
      const remind15 = new Date(now.getTime() + 15 * 60 * 1000);
      const remind60 = new Date(now.getTime() + 60 * 60 * 1000);
      const tomorrow8 = new Date(now);
      tomorrow8.setDate(now.getDate() + 1);
      tomorrow8.setHours(8, 0, 0, 0);

      Alert.alert(
        'Đặt nhắc nhở',
        `Chọn thời gian nhắc nhở cho “${item.name}”`,
        [
          {
            text: '15 phút nữa',
            onPress: () => {
              void reminderService.createReminder({
                tripId: selectedTrip.id,
                message: `Nhắc nhở: ${item.name} (Ngày ${selectedDay})`,
                remindAt: remind15,
              });
            },
          },
          {
            text: '1 giờ nữa',
            onPress: () => {
              void reminderService.createReminder({
                tripId: selectedTrip.id,
                message: `Nhắc nhở: ${item.name} (Ngày ${selectedDay})`,
                remindAt: remind60,
              });
            },
          },
          {
            text: 'Ngày mai 08:00',
            onPress: () => {
              void reminderService.createReminder({
                tripId: selectedTrip.id,
                message: `Nhắc nhở: ${item.name} (Ngày ${selectedDay})`,
                remindAt: tomorrow8,
              });
            },
          },
          { text: 'Hủy', style: 'cancel' },
        ]
      );
    },
    [selectedDay, selectedTrip]
  );

  const toggleOptimize = useCallback(() => {
    setOptimized((v) => !v);
  }, []);

  const onPressAddDestination = useCallback(() => {
    Alert.alert(
      'Thêm điểm đến',
      'Chưa có màn hình thêm điểm đến. Hiện tại bạn có thể thêm bản ghi vào bảng itinerary_items trên Supabase (trip_id + day) để hiển thị ở đây.'
    );
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {selectedTrip ? (
        <>
          <View style={styles.detailHeader}>
            <Pressable
              onPress={handleBack}
              style={({ pressed, hovered }) => [
                styles.headerIconBtn,
                hovered ? { opacity: 0.95 } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Quay lại danh sách kế hoạch"
            >
              <Feather name="chevron-left" size={24} color={colors.title} />
            </Pressable>

            <Text style={[styles.detailTitle, { color: colors.title }]} numberOfLines={1}>
              {selectedTrip.name}
            </Text>

            <Pressable
              onPress={() => setIsShareOpen(true)}
              style={({ pressed, hovered }) => [
                styles.headerIconBtn,
                hovered ? { opacity: 0.95 } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Chia sẻ kế hoạch"
            >
              <Feather name="share-2" size={20} color={colors.title} />
            </Pressable>
          </View>

          <Text style={[styles.detailSub, { color: colors.subtitle }]}>
            {selectedTrip.startDate} - {selectedTrip.endDate} • {selectedTrip.daysCount} ngày
          </Text>

          <ScrollView
            contentContainerStyle={styles.detailScroll}
            showsVerticalScrollIndicator={false}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayTabs}
            >
              {Array.from({ length: selectedTrip.daysCount }, (_, i) => i + 1).map((d) => {
                const active = d === selectedDay;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    style={({ pressed, hovered }) => [
                      styles.dayTab,
                      active
                        ? { backgroundColor: ExploreEaseColors.primary }
                        : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.06)' },
                      hovered ? { opacity: 0.95 } : null,
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.dayTabText,
                        { color: active ? '#001018' : colors.subtitle },
                      ]}
                    >
                      Ngày {d}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>Lịch trình Ngày {selectedDay}</Text>
              <DayTimeline
                tripId={selectedTrip.id}
                day={selectedDay}
                optimized={optimized}
                onPressReminder={onPressReminder}
                onPressAddDestination={onPressAddDestination}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>Ghi chú</Text>
              <View style={[styles.notesCard, { borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)', backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' }]}>
                <View style={styles.noteInputRow}>
                  <TextInput
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    placeholder="Nhập ghi chú cho ngày này..."
                    placeholderTextColor={colors.subtitle}
                    style={[styles.noteInput, { color: colors.title }]}
                  />
                  <Pressable
                    onPress={() => void addNote()}
                    style={({ pressed, hovered }) => [
                      styles.addNoteBtn,
                      { backgroundColor: ExploreEaseColors.primary },
                      hovered ? { opacity: 0.95 } : null,
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={18} color="#001018" />
                  </Pressable>
                </View>

                {notes.length === 0 ? (
                  <Text style={[styles.notesEmpty, { color: colors.subtitle }]}>Chưa có ghi chú nào.</Text>
                ) : (
                  <View style={styles.notesList}>
                    {notes.map((n, idx) => (
                      <View key={`${idx}-${n}`} style={styles.noteRow}>
                        <View style={[styles.noteDot, { backgroundColor: ExploreEaseColors.primary }]} />
                        <Text style={[styles.noteText, { color: colors.title }]}>{n}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.section}>
              <TripActionBar
                optimized={optimized}
                onOptimizeRoute={toggleOptimize}
                onShare={() => setIsShareOpen(true)}
              />
            </View>
          </ScrollView>

          <ShareTripBottomSheet
            isOpen={isShareOpen}
            tripName={selectedTrip.name}
            tripCode={tripCode}
            onClose={() => setIsShareOpen(false)}
          />
        </>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <Text style={[styles.pageTitle, { color: colors.title }]}>Kế hoạch của tôi</Text>
            <Text style={[styles.pageSubtitle, { color: colors.subtitle }]}>
              Quản lý và lên kế hoạch cho các chuyến đi của bạn
            </Text>
          </View>

          <View style={styles.listWrap}>
            {loadingTrips ? (
              <View style={[styles.stateCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.stateTitle, { color: colors.title }]}>Đang tải chuyến đi...</Text>
                <Text style={[styles.stateText, { color: colors.subtitle }]}>Vui lòng đợi một chút.</Text>
              </View>
            ) : tripsError ? (
              <View style={[styles.stateCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.stateTitle, { color: colors.title }]}>{tripsError}</Text>
                <Text style={[styles.stateText, { color: colors.subtitle }]}>Kiểm tra mạng hoặc đăng nhập rồi thử lại.</Text>
                <Pressable
                  onPress={() => void loadTrips()}
                  style={({ pressed, hovered }) => [
                    styles.retryBtn,
                    { backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)' },
                    hovered ? { opacity: 0.95 } : null,
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Thử tải lại danh sách chuyến đi"
                >
                  <Feather name="refresh-cw" size={16} color={ExploreEaseColors.primary} />
                  <Text style={styles.retryText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : trips.length === 0 ? (
              <View style={[styles.stateCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.stateTitle, { color: colors.title }]}>Chưa có chuyến đi</Text>
                <Text style={[styles.stateText, { color: colors.subtitle }]}>Tạo chuyến đi mới để bắt đầu lên kế hoạch.</Text>

                <Pressable
                  onPress={() => void createTrip()}
                  disabled={creatingTrip}
                  style={({ pressed, hovered }) => [
                    {
                      marginTop: 6,
                      height: 44,
                      borderRadius: 14,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: ExploreEaseColors.primary,
                      opacity: creatingTrip ? 0.7 : 1,
                    },
                    hovered ? { opacity: 0.95 } : null,
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Tạo chuyến đi mới"
                >
                  {creatingTrip ? (
                    <ActivityIndicator color="#001018" />
                  ) : (
                    <Feather name="plus" size={16} color="#001018" />
                  )}
                  <Text style={{ color: '#001018', fontSize: 13, fontWeight: '900' }}>Tạo chuyến đi mới</Text>
                </Pressable>
              </View>
            ) : (
              trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  title={trip.name}
                  destination={trip.destination}
                  startDate={trip.startDate}
                  daysCount={trip.daysCount}
                  coverUri={trip.cover}
                  style={styles.card}
                  onPress={() => handleSelectTrip(trip)}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { paddingBottom: 140 },
  container: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },
  pageTitle: { fontSize: 28, fontWeight: '900', letterSpacing: 0.2 },
  pageSubtitle: { marginTop: 6, fontSize: 13, fontWeight: '600' },
  listWrap: { paddingHorizontal: 18, paddingTop: 10, gap: 16 },
  card: { height: 192 },

  stateCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  stateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 6,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryText: {
    color: ExploreEaseColors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  detailHeader: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    paddingHorizontal: 10,
  },
  detailSub: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 8,
  },
  detailScroll: {
    paddingHorizontal: 18,
    paddingBottom: 160,
    paddingTop: 8,
    gap: 18,
  },
  dayTabs: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 10,
  },
  dayTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  dayTabText: {
    fontSize: 13,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },

  notesCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noteInput: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    fontSize: 13,
    fontWeight: '700',
  },
  addNoteBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notesEmpty: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  notesList: {
    gap: 8,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
