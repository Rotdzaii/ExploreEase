import { DayTimeline } from '@/components/trips/DayTimeline';
import { ShareTripBottomSheet } from '@/components/trips/ShareTripBottomSheet';
import { TripActionBar } from '@/components/trips/TripActionBar';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { itineraryService } from '@/src/services/itineraryService';
import { reminderService } from '@/src/services/reminderService';
import { tripService, type TripRow } from '@/src/services/tripService';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type TripDetail = {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  daysCount: number;
};

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
  return `${day} Thang ${month}`;
};

const toDaysCount = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.min(days, 60);
};

const mapTripRowToDetail = (row: TripRow): TripDetail => {
  const start = parseDateOnly(row.start_date ?? null);
  const end = parseDateOnly(row.end_date ?? null);

  return {
    id: row.id,
    name: row.name,
    destination: row.destination ?? '',
    startDate: toVnShortDate(start),
    endDate: toVnShortDate(end),
    daysCount: toDaysCount(start, end),
  };
};

export default function ItineraryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = params.id ? String(params.id) : '';

  const { isDark } = useTheme();
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

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState(1);
  const [optimized, setOptimized] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState('');

  const tripCode = useMemo(() => {
    if (!trip) return '';
    const suffix = trip.id.replace(/-/g, '').slice(0, 7).toUpperCase();
    return `EE-${suffix}`;
  }, [trip]);

  const loadTrip = useCallback(async () => {
    if (!tripId) {
      setTrip(null);
      setErrorMessage('Thieu itinerary id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const row = await tripService.getTripByIdForCurrentUser(tripId);
      if (!row) {
        setTrip(null);
        setErrorMessage('Khong tim thay ke hoach nay.');
        return;
      }

      const mapped = mapTripRowToDetail(row);
      setTrip(mapped);
      setSelectedDay((prev) => Math.min(Math.max(1, prev), mapped.daysCount));
    } catch (err: any) {
      console.warn('loadTrip failed:', err?.message ?? err);
      setTrip(null);
      setErrorMessage('Khong the tai ke hoach.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!trip) return;
      try {
        const rows = await itineraryService.getNotes(trip.id, selectedDay);
        if (!alive) return;
        setNotes(rows ?? []);
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
  }, [selectedDay, trip]);

  const addNote = useCallback(async () => {
    if (!trip) return;
    const trimmed = noteDraft.trim();
    if (!trimmed) return;

    setNoteDraft('');

    try {
      const next = await itineraryService.addNote(trip.id, selectedDay, trimmed);
      setNotes(next ?? []);
    } catch (err: any) {
      console.warn('addNote failed:', err?.message ?? err);
      Alert.alert('Khong the luu ghi chu', 'Vui long thu lai sau.');
    }
  }, [noteDraft, selectedDay, trip]);

  const onPressReminder = useCallback(
    (item: any) => {
      if (!trip) return;

      const now = new Date();
      const remind15 = new Date(now.getTime() + 15 * 60 * 1000);
      const remind60 = new Date(now.getTime() + 60 * 60 * 1000);
      const tomorrow8 = new Date(now);
      tomorrow8.setDate(now.getDate() + 1);
      tomorrow8.setHours(8, 0, 0, 0);

      Alert.alert(
        'Dat nhac nho',
        `Chon thoi gian nhac nho cho "${item.name}"`,
        [
          {
            text: '15 phut nua',
            onPress: () => {
              void reminderService.createReminder({
                tripId: trip.id,
                message: `Nhac nho: ${item.name} (Ngay ${selectedDay})`,
                remindAt: remind15,
              });
            },
          },
          {
            text: '1 gio nua',
            onPress: () => {
              void reminderService.createReminder({
                tripId: trip.id,
                message: `Nhac nho: ${item.name} (Ngay ${selectedDay})`,
                remindAt: remind60,
              });
            },
          },
          {
            text: 'Ngay mai 08:00',
            onPress: () => {
              void reminderService.createReminder({
                tripId: trip.id,
                message: `Nhac nho: ${item.name} (Ngay ${selectedDay})`,
                remindAt: tomorrow8,
              });
            },
          },
          { text: 'Huy', style: 'cancel' },
        ]
      );
    },
    [selectedDay, trip]
  );

  const onPressAddDestination = useCallback(() => {
    router.push('/(tabs)/explore' as any);
  }, [router]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: colors.subtitle }]}>Dang tai ke hoach...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerWrap}>
          <Text style={[styles.stateTitle, { color: colors.title }]}>{errorMessage ?? 'Khong tim thay ke hoach.'}</Text>
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
            >
              <Text style={[styles.outlineBtnText, { color: colors.title }]}>Quay lai</Text>
            </Pressable>

            <Pressable onPress={() => void loadTrip()} style={({ pressed }) => [styles.solidBtn, pressed ? { opacity: 0.84 } : null]}>
              <Text style={styles.solidBtnText}>Thu lai</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.detailHeader}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed, hovered }) => [
            styles.headerIconBtn,
            hovered ? { opacity: 0.95 } : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Quay lai danh sach ke hoach"
        >
          <Feather name="chevron-left" size={24} color={colors.title} />
        </Pressable>

        <Text style={[styles.detailTitle, { color: colors.title }]} numberOfLines={1}>
          {trip.name}
        </Text>

        <Pressable
          onPress={() => setIsShareOpen(true)}
          style={({ pressed, hovered }) => [
            styles.headerIconBtn,
            hovered ? { opacity: 0.95 } : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Chia se ke hoach"
        >
          <Feather name="share-2" size={20} color={colors.title} />
        </Pressable>
      </View>

      <Text style={[styles.detailSub, { color: colors.subtitle }]}>
        {trip.startDate} - {trip.endDate} | {trip.daysCount} ngay
      </Text>

      <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
          {Array.from({ length: trip.daysCount }, (_, i) => i + 1).map((d) => {
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
                <Text style={[styles.dayTabText, { color: active ? '#001018' : colors.subtitle }]}>Ngay {d}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Timeline ngay {selectedDay}</Text>
          <DayTimeline
            tripId={trip.id}
            day={selectedDay}
            optimized={optimized}
            onPressReminder={onPressReminder}
            onPressAddDestination={onPressAddDestination}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Ghi chu</Text>
          <View
            style={[
              styles.notesCard,
              {
                borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
              },
            ]}
          >
            <View style={styles.noteInputRow}>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Nhap ghi chu cho ngay nay..."
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
              <Text style={[styles.notesEmpty, { color: colors.subtitle }]}>Chua co ghi chu nao.</Text>
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
            onOptimizeRoute={() => setOptimized((prev) => !prev)}
            onShare={() => setIsShareOpen(true)}
          />
        </View>
      </ScrollView>

      <ShareTripBottomSheet
        isOpen={isShareOpen}
        tripName={trip.name}
        tripCode={tripCode}
        onClose={() => setIsShareOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  outlineBtn: {
    minHeight: 42,
    minWidth: 104,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  solidBtn: {
    minHeight: 42,
    minWidth: 104,
    borderRadius: 12,
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#001018',
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
