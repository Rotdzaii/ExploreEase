import { EditEventForm, type EventEditData } from '@/components/events/EditEventForm';
import { TimeOfDayToggle } from '@/components/home/TimeOfDayToggle';
import { YouMightAlsoLike, type YouMightAlsoLikeItem } from '@/components/home/YouMightAlsoLike';
import { ModerationModal, RatingDistribution, ReviewCard, ReviewForm } from '@/components/reviews';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { calculateAverageRating as calculateEventAverageRating, eventReviewService, type EventReviewRow } from '@/src/services/eventReviewService';
import { eventService, getEventStatusByTime, type EventRow, type EventStatus } from '@/src/services/eventService';
import { itineraryService } from '@/src/services/itineraryService';
import { recommendationService, resolveTimeOfDayPreference, type PersonalizedRecommendationsResult } from '@/src/services/recommendationService';
import { reviewService } from '@/src/services/reviewService';
import { supabase } from '@/src/services/supabase';
import type { TripRow } from '@/src/services/tripService';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { useRecommendationPreferencesStore } from '@/src/store/useRecommendationPreferencesStore';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

type ReviewSortOption = 'newest' | 'highest' | 'lowest' | 'most-helpful';

const MAX_REVIEW_PHOTOS = 4;
const EVENT_REVIEWS_PAGE_SIZE = 10;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN');
};

const formatPrice = (value: number) => {
  if (value <= 0) return 'FREE';
  return `${value.toLocaleString('vi-VN')} đ`;
};

const statusLabel = (status: EventStatus) => {
  if (status === 'ongoing') return 'Đang diễn ra';
  if (status === 'completed') return 'Đã kết thúc';
  return 'Sắp diễn ra';
};

const getCountdownParts = (totalMs: number) => {
  const safeMs = Math.max(0, totalMs);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
  };
};

const twoDigits = (value: number) => String(Math.max(0, value)).padStart(2, '0');

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInput = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const combineLocalDateTime = (dateText: string, timeText: string): Date | null => {
  const dt = new Date(`${dateText.trim()}T${timeText.trim()}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
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

const toDaysCount = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.min(days, 60);
};

const buildInitialEditData = (event: EventRow): EventEditData => ({
  title: event.title ?? '',
  category: event.category ?? '',
  location: event.location ?? '',
  startDate: toDateInput(event.start_time),
  startTime: toTimeInput(event.start_time),
  endDate: toDateInput(event.end_time),
  endTime: toTimeInput(event.end_time),
  price: String(event.price ?? 0),
  imageUrl: event.image_url ?? '',
  description: event.description ?? '',
});

const toReviewImageUrls = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export default function EventDetailScreen() {
  const { isDark } = useTheme();
  const { t } = useI18n();
  const { formatPricePerPerson } = useCurrency();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = params.id ? String(params.id) : '';
  const addNotification = useNotificationStore((s) => s.addNotification);
  const timeOfDayPreference = useRecommendationPreferencesStore((s) => s.timeOfDayPreference);
  const setTimeOfDayPreference = useRecommendationPreferencesStore((s) => s.setTimeOfDayPreference);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState<PersonalizedRecommendationsResult | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [savingToTrip, setSavingToTrip] = useState(false);

  const [reviews, setReviews] = useState<EventReviewRow[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [reviewsTotalCount, setReviewsTotalCount] = useState<number | null>(null);
  const [hasMoreReviews, setHasMoreReviews] = useState(true);
  const [reviewSort, setReviewSort] = useState<ReviewSortOption>('newest');
  const [helpfulPendingId, setHelpfulPendingId] = useState<string | null>(null);
  const [replyDraftByReview, setReplyDraftByReview] = useState<Record<string, string>>({});
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const [isWritingReview, setIsWritingReview] = useState(false);
  const [draftRating, setDraftRating] = useState<number>(5);
  const [draftComment, setDraftComment] = useState('');
  const [draftPhotoAssets, setDraftPhotoAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploadingDraftPhotos, setUploadingDraftPhotos] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  const addSheetRef = useRef<BottomSheet>(null);
  const [isAddToTripOpen, setIsAddToTripOpen] = useState(false);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [selectedTripRow, setSelectedTripRow] = useState<TripRow | null>(null);
  const [selectedTripDay, setSelectedTripDay] = useState<number>(1);
  const [isNoTripsModalOpen, setIsNoTripsModalOpen] = useState(false);
  const [creatingTripAndAdding, setCreatingTripAndAdding] = useState(false);
  const [isTripPickerModalOpen, setIsTripPickerModalOpen] = useState(false);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
    }),
    [isDark]
  );

  const isOwner = useMemo(() => {
    if (!event?.creator_id || !currentUserId) return false;
    return event.creator_id === currentUserId;
  }, [currentUserId, event?.creator_id]);

  const liveStatus = useMemo<EventStatus>(() => {
    if (!event) return 'incoming';
    return getEventStatusByTime(event.start_time, event.end_time, new Date(nowTs));
  }, [event, nowTs]);

  const countdownParts = useMemo(() => {
    if (!event || liveStatus !== 'incoming') return null;

    const startsAt = new Date(event.start_time).getTime();
    if (Number.isNaN(startsAt)) return null;

    const remainingMs = startsAt - nowTs;
    return getCountdownParts(remainingMs);
  }, [event, liveStatus, nowTs]);

  const initialEditData = useMemo(() => {
    if (!event) return null;
    return buildInitialEditData(event);
  }, [event]);

  const effectiveRecommendationTimeOfDay = useMemo(
    () => resolveTimeOfDayPreference(timeOfDayPreference),
    [timeOfDayPreference]
  );

  const toSuggestionPrice = useCallback(
    (value: number | null) => {
      if (value === null) return '—';
      if (value <= 0) return 'FREE';
      return formatPricePerPerson(value);
    },
    [formatPricePerPerson]
  );

  const recommendationItems = useMemo<YouMightAlsoLikeItem[]>(
    () =>
      (recommendations?.combined ?? []).map((item) => ({
        ...item,
        displayPrice: toSuggestionPrice(item.priceValue),
      })),
    [recommendations, toSuggestionPrice]
  );

  const activeRecommendationTimeOfDay = recommendations?.timeOfDay ?? effectiveRecommendationTimeOfDay;
  const reviewScale = useMemo(() => clamp(screenWidth / 390, 0.9, 1.15), [screenWidth]);
  const s = useCallback((value: number) => Math.round(value * reviewScale), [reviewScale]);

  const promptLogin = useCallback((message: string) => {
    addNotification({
      message,
      type: 'warning',
      durationMs: 3000,
    });

    Alert.alert(t('common.loginRequiredTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.login'), onPress: () => router.push('/login' as any) },
    ]);
  }, [addNotification, t]);

  const addSheetSnapPoints = useMemo(() => ['62%'], []);

  const renderAddSheetBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const loadTrips = useCallback(async (): Promise<TripRow[]> => {
    setLoadingTrips(true);
    try {
      const rows = await itineraryService.getTripsForCurrentUser();
      setTrips(rows ?? []);
      return (rows ?? []) as TripRow[];
    } catch (err: any) {
      console.warn('loadTrips (event) failed:', err?.message ?? err);
      setTrips([]);
      return [];
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
      console.warn('ensureLoggedIn (event) failed:', err?.message ?? err);
    }

    Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập để thêm sự kiện vào kế hoạch.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng nhập', onPress: () => router.push('/login' as any) },
    ]);
    return false;
  }, []);

  const openAddToTrip = useCallback(() => {
    setSelectedTripRow(null);
    setSelectedTripDay(1);
    setIsAddToTripOpen(true);
  }, []);

  const closeAddToTrip = useCallback(() => {
    setIsAddToTripOpen(false);
  }, []);

  const closeTripPicker = useCallback(() => {
    setIsTripPickerModalOpen(false);
    setIsAddToTripOpen(false);
    setSelectedTripRow(null);
    setSelectedTripDay(1);
  }, []);

  const selectedTripDaysCount = useMemo(() => {
    if (!selectedTripRow) return 1;
    const start = parseDateOnly(selectedTripRow.start_date ?? null);
    const end = parseDateOnly(selectedTripRow.end_date ?? null);
    return toDaysCount(start, end);
  }, [selectedTripRow]);

  const addEventToTripDay = useCallback(async (trip: TripRow, day: number): Promise<boolean> => {
    if (!event || addingToPlan) return false;

    const startTime = toTimeInput(event.start_time) || null;
    const endTime = toTimeInput(event.end_time) || null;
    const timeSlot = startTime && endTime
      ? `${startTime}-${endTime}`
      : (startTime ?? endTime ?? null);

    setAddingToPlan(true);
    try {
      await itineraryService.addEventToTripDay({
        tripId: trip.id,
        day,
        event_id: event.id,
        name: event.title,
        description: event.description ?? null,
        image_url: event.image_url ?? null,
        start_time: startTime,
        end_time: endTime,
        time_slot: timeSlot,
      });

      addNotification({
        message: 'Đã thêm vào kế hoạch.',
        type: 'success',
        durationMs: 3000,
      });
      return true;
    } catch (err: any) {
      console.warn('addEventToTripDay failed:', err?.message ?? err);
      Alert.alert('Không thể thêm vào kế hoạch', 'Vui lòng thử lại sau.');
      return false;
    } finally {
      setAddingToPlan(false);
    }
  }, [addNotification, addingToPlan, event]);

  const createTrip = useCallback(async () => {
    if (creatingTrip || !event) return;

    const ok = await ensureLoggedIn();
    if (!ok) return;

    setCreatingTrip(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const newTrip = await itineraryService.createTripForCurrentUser({
        title: `Sự kiện: ${event.title}`,
        destination: event.location ?? null,
        cover: event.image_url ?? null,
        start_date: todayIso,
        end_date: todayIso,
      });

      setTrips((prev) => [newTrip, ...(prev ?? [])]);
      setSelectedTripRow(newTrip);
      setSelectedTripDay(1);
    } catch (err: any) {
      console.warn('createTrip (event) failed:', err?.message ?? err);
      Alert.alert('Không thể tạo chuyến đi', 'Vui lòng thử lại sau.');
    } finally {
      setCreatingTrip(false);
    }
  }, [creatingTrip, ensureLoggedIn, event]);

  const createTripAndAutoAdd = useCallback(async () => {
    if (creatingTripAndAdding || !event) return;

    const ok = await ensureLoggedIn();
    if (!ok) return;

    setCreatingTripAndAdding(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const newTrip = await itineraryService.createTripForCurrentUser({
        title: `Sự kiện: ${event.title}`,
        destination: event.location ?? null,
        cover: event.image_url ?? null,
        start_date: todayIso,
        end_date: todayIso,
      });

      const added = await addEventToTripDay(newTrip, 1);
      if (!added) return;

      setTrips((prev) => [newTrip, ...(prev ?? [])]);
      setSelectedTripRow(newTrip);
      setSelectedTripDay(1);
      setIsNoTripsModalOpen(false);
    } catch (err: any) {
      console.warn('createTripAndAutoAdd (event) failed:', err?.message ?? err);
      Alert.alert('Không thể thêm vào kế hoạch', 'Vui lòng thử lại sau.');
    } finally {
      setCreatingTripAndAdding(false);
    }
  }, [addEventToTripDay, creatingTripAndAdding, ensureLoggedIn, event]);

  const addToTrip = useCallback(async () => {
    if (!selectedTripRow || savingToTrip) return;

    const ok = await ensureLoggedIn();
    if (!ok) return;

    setSavingToTrip(true);
    try {
      const added = await addEventToTripDay(selectedTripRow, selectedTripDay);
      if (!added) return;
      closeTripPicker();
    } finally {
      setSavingToTrip(false);
    }
  }, [addEventToTripDay, closeTripPicker, ensureLoggedIn, savingToTrip, selectedTripDay, selectedTripRow]);

  const onPressAddToPlan = useCallback(async () => {
    const ok = await ensureLoggedIn();
    if (!ok) return;

    const rows = await loadTrips();

    if ((rows ?? []).length > 0) {
      if (Platform.OS === 'web') {
        setSelectedTripRow(null);
        setSelectedTripDay(1);
        setIsTripPickerModalOpen(true);
      } else {
        openAddToTrip();
      }
      return;
    }

    setIsNoTripsModalOpen(true);
  }, [ensureLoggedIn, loadTrips, openAddToTrip]);

  const onPressRecommendationItem = useCallback((item: YouMightAlsoLikeItem) => {
    if (item.kind === 'event') {
      router.push(`/event/${item.id}` as any);
      return;
    }

    router.push(
      {
        pathname: '/destination/[id]',
        params: {
          id: item.id,
          name: item.title,
          location: item.location,
          price: item.displayPrice,
          rating: typeof item.rating === 'number' ? item.rating.toFixed(1) : '',
          imageUrl: item.imageUrl ?? '',
        },
      } as any
    );
  }, []);

  const fetchAuthContext = useCallback(async () => {
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = userRes.user?.id ?? null;
      setCurrentUserId(userId);

      if (!userId) {
        setIsAdmin(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      const role = String((profile as any)?.role ?? '').trim().toLowerCase();
      setIsAdmin(role === 'admin');
    } catch (error) {
      console.warn('fetchAuthContext failed:', error);
      setCurrentUserId(null);
      setIsAdmin(false);
    }
  }, []);

  const refreshReviews = useCallback(async () => {
    if (!eventId) return;

    setLoadingReviews(true);
    setLoadingMoreReviews(false);
    setHasMoreReviews(true);
    setReviewsTotalCount(null);

    try {
      const res = await eventReviewService.getEventReviewsPage(eventId, {
        from: 0,
        limit: EVENT_REVIEWS_PAGE_SIZE,
      });

      setReviews(res.rows ?? []);
      setReviewsTotalCount(res.totalCount);
      const loaded = (res.rows ?? []).length;

      if (typeof res.totalCount === 'number') {
        setHasMoreReviews(loaded < res.totalCount);
      } else {
        setHasMoreReviews(loaded >= EVENT_REVIEWS_PAGE_SIZE);
      }
    } catch (error) {
      console.warn('refreshReviews failed:', error);
      setReviews([]);
      setReviewsTotalCount(null);
      setHasMoreReviews(false);
    } finally {
      setLoadingReviews(false);
    }
  }, [eventId]);

  const loadMoreReviews = useCallback(async () => {
    if (!eventId) return;
    if (loadingReviews || loadingMoreReviews || !hasMoreReviews) return;

    const from = reviews.length;
    setLoadingMoreReviews(true);

    try {
      const res = await eventReviewService.getEventReviewsPage(eventId, {
        from,
        limit: EVENT_REVIEWS_PAGE_SIZE,
      });

      const nextRows = res.rows ?? [];
      const existingIds = new Set(reviews.map((r) => String(r.id)));
      const uniqueRows = nextRows.filter((r) => !existingIds.has(String(r.id)));

      setReviewsTotalCount((prev) => (typeof prev === 'number' ? prev : res.totalCount));
      setReviews((prev) => [...(prev ?? []), ...uniqueRows]);

      const nextCount = from + uniqueRows.length;
      if (typeof res.totalCount === 'number') {
        setHasMoreReviews(nextCount < res.totalCount);
      } else {
        setHasMoreReviews(uniqueRows.length >= EVENT_REVIEWS_PAGE_SIZE);
      }
    } catch (error) {
      console.warn('loadMoreReviews failed:', error);
      setHasMoreReviews(false);
    } finally {
      setLoadingMoreReviews(false);
    }
  }, [eventId, hasMoreReviews, loadingMoreReviews, loadingReviews, reviews]);

  const fetchEvent = useCallback(async () => {
    if (!eventId) {
      setErrorMessage('Thiếu event_id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const row = await eventService.getEventById(eventId);
      if (!row) {
        setEvent(null);
        setErrorMessage('Không tìm thấy sự kiện.');
        return;
      }
      setEvent(row);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Không thể tải chi tiết sự kiện.');
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchEvent();
  }, [fetchEvent]);

  useEffect(() => {
    void fetchAuthContext();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void fetchAuthContext();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchAuthContext]);

  useEffect(() => {
    void refreshReviews();
  }, [refreshReviews]);

  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`event_reviews:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_reviews',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          void refreshReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, refreshReviews]);

  useEffect(() => {
    if (!event) return;

    const timerId = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [event]);

  const fetchContextualRecommendations = useCallback(async () => {
    if (!eventId) {
      setRecommendations(null);
      setLoadingRecommendations(false);
      return;
    }

    setLoadingRecommendations(true);
    try {
      const result = await recommendationService.getPersonalizedRecommendationsForCurrentUser({
        limitDestinations: 6,
        limitEvents: 4,
        timeOfDay: effectiveRecommendationTimeOfDay,
        respectTimeOfDayWindow: true,
        contextItem: {
          kind: 'event',
          id: eventId,
          title: event?.title ?? '',
          category: event?.category ?? null,
          location: event?.location ?? null,
        },
      });

      setRecommendations(result);
    } catch (err: any) {
      console.warn('fetchContextualRecommendations failed:', err?.message ?? err);
      setRecommendations(null);
    } finally {
      setLoadingRecommendations(false);
    }
  }, [effectiveRecommendationTimeOfDay, event?.category, event?.location, event?.title, eventId]);

  useEffect(() => {
    void fetchContextualRecommendations();
  }, [fetchContextualRecommendations]);

  const canReplyToReviews = useMemo(() => {
    if (isAdmin) return true;
    if (!event?.creator_id || !currentUserId) return false;
    return event.creator_id === currentUserId;
  }, [currentUserId, event?.creator_id, isAdmin]);

  const averageRating = useMemo(() => calculateEventAverageRating(reviews, 1), [reviews]);

  const ratingDistribution = useMemo(() => {
    const bucket: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const review of reviews) {
      const rounded = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0)));
      bucket[rounded] += 1;
    }

    const total = Math.max(1, reviews.length);
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: bucket[star],
      percent: (bucket[star] / total) * 100,
    }));
  }, [reviews]);

  const sortedReviews = useMemo(() => {
    const rows = [...reviews];

    const byCreatedAtDesc = (a: EventReviewRow, b: EventReviewRow) => {
      const aTs = new Date(a.created_at ?? 0).getTime();
      const bTs = new Date(b.created_at ?? 0).getTime();
      return bTs - aTs;
    };

    if (reviewSort === 'highest') {
      return rows.sort((a, b) => Number(b.rating) - Number(a.rating) || byCreatedAtDesc(a, b));
    }

    if (reviewSort === 'lowest') {
      return rows.sort((a, b) => Number(a.rating) - Number(b.rating) || byCreatedAtDesc(a, b));
    }

    if (reviewSort === 'most-helpful') {
      return rows.sort((a, b) => {
        const aHelpful = typeof a.helpful_count === 'number' ? a.helpful_count : 0;
        const bHelpful = typeof b.helpful_count === 'number' ? b.helpful_count : 0;
        if (bHelpful !== aHelpful) return bHelpful - aHelpful;
        return byCreatedAtDesc(a, b);
      });
    }

    return rows.sort(byCreatedAtDesc);
  }, [reviewSort, reviews]);

  const onPressWriteReview = useCallback(() => {
    setIsWritingReview((prev) => {
      const next = !prev;
      if (!next) {
        setDraftPhotoAssets([]);
      }
      return next;
    });
  }, []);

  const pickReviewPhotos = useCallback(async () => {
    const remaining = MAX_REVIEW_PHOTOS - draftPhotoAssets.length;
    if (remaining <= 0) {
      addNotification({
        message: t('review.validation.maxPhotos', { max: MAX_REVIEW_PHOTOS }),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      addNotification({
        message: t('review.validation.photoPermission'),
        type: 'error',
        durationMs: 3600,
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled) return;

    setDraftPhotoAssets((prev) => {
      const seen = new Set(prev.map((asset) => asset.uri));
      const merged = [...prev];
      for (const asset of result.assets ?? []) {
        if (!asset.uri || seen.has(asset.uri)) continue;
        merged.push(asset);
        seen.add(asset.uri);
        if (merged.length >= MAX_REVIEW_PHOTOS) break;
      }
      return merged;
    });
  }, [addNotification, draftPhotoAssets.length, t]);

  const removeDraftPhoto = useCallback((assetUri: string) => {
    setDraftPhotoAssets((prev) => prev.filter((asset) => asset.uri !== assetUri));
  }, []);

  const onToggleHelpfulReview = useCallback(async (review: EventReviewRow) => {
    if (!currentUserId) {
      promptLogin(t('review.auth.helpfulRequired'));
      return;
    }

    const reviewId = String(review.id);
    if (helpfulPendingId === reviewId) return;

    const wasHelpful = !!review.viewer_has_helpful_vote;
    const currentCount = typeof review.helpful_count === 'number' ? review.helpful_count : 0;
    const optimisticCount = Math.max(0, currentCount + (wasHelpful ? -1 : 1));

    setHelpfulPendingId(reviewId);
    setReviews((prev) =>
      prev.map((row) =>
        String(row.id) === reviewId
          ? {
              ...row,
              viewer_has_helpful_vote: !wasHelpful,
              helpful_count: optimisticCount,
            }
          : row
      )
    );

    try {
      const result = await eventReviewService.toggleHelpful(reviewId);
      setReviews((prev) =>
        prev.map((row) =>
          String(row.id) === reviewId
            ? {
                ...row,
                viewer_has_helpful_vote: result.isHelpful,
                helpful_count: result.helpfulCount,
              }
            : row
        )
      );
    } catch (error) {
      console.warn('toggleHelpful(event) failed:', error);
      setReviews((prev) =>
        prev.map((row) =>
          String(row.id) === reviewId
            ? {
                ...row,
                viewer_has_helpful_vote: wasHelpful,
                helpful_count: currentCount,
              }
            : row
        )
      );
      addNotification({
        message: t('review.error.updateHelpful'),
        type: 'error',
        durationMs: 3200,
      });
    } finally {
      setHelpfulPendingId(null);
    }
  }, [addNotification, currentUserId, helpfulPendingId, promptLogin, t]);

  const openReportModal = useCallback((reviewId: string) => {
    setReportReviewId(reviewId);
    setReportReason('');
    setReportModalVisible(true);
  }, []);

  const submitReviewReport = useCallback(async () => {
    if (!reportReviewId) return;

    if (!currentUserId) {
      setReportModalVisible(false);
      promptLogin(t('review.auth.reportRequired'));
      return;
    }

    const reason = reportReason.trim();
    if (!reason) {
      addNotification({
        message: t('review.validation.reportReasonRequired'),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    setSubmittingReport(true);
    try {
      await eventReviewService.reportReview({
        reviewId: reportReviewId,
        reason,
      });

      addNotification({
        message: t('review.success.reportEvent'),
        type: 'success',
        durationMs: 2600,
      });

      setReportModalVisible(false);
      setReportReason('');
      setReportReviewId(null);
    } catch (error: any) {
      console.warn('submitReviewReport(event) failed:', error);
      const reason = String(error?.message ?? '').trim() || t('review.error.genericTryAgain');
      addNotification({
        message: t('review.error.reportFailed', { reason }),
        type: 'error',
        durationMs: 3600,
      });
    } finally {
      setSubmittingReport(false);
    }
  }, [addNotification, currentUserId, promptLogin, reportReason, reportReviewId, t]);

  const submitReplyToReview = useCallback(async (reviewId: string) => {
    if (!canReplyToReviews) {
      addNotification({
        message: t('review.error.replyNoPermission'),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    if (!currentUserId) {
      promptLogin(t('review.auth.replyRequired'));
      return;
    }

    const replyText = (replyDraftByReview[reviewId] ?? '').trim();
    if (!replyText) {
      addNotification({
        message: t('review.validation.replyRequired'),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    setSubmittingReplyId(reviewId);
    try {
      const result = await eventReviewService.replyToReview({
        reviewId,
        replyText,
      });

      setReviews((prev) =>
        prev.map((row) =>
          String(row.id) === reviewId
            ? {
                ...row,
                reply_text: (result as any)?.reply_text ?? replyText,
                replied_at: (result as any)?.replied_at ?? new Date().toISOString(),
                replied_by: (result as any)?.replied_by ?? currentUserId,
              }
            : row
        )
      );

      setReplyDraftByReview((prev) => ({
        ...prev,
        [reviewId]: '',
      }));

      addNotification({
        message: t('review.success.replyEvent'),
        type: 'success',
        durationMs: 2600,
      });
    } catch (error: any) {
      console.warn('submitReplyToReview(event) failed:', error);
      const reason = String(error?.message ?? '').trim() || t('review.error.genericTryAgain');
      addNotification({
        message: t('review.error.replyFailed', { reason }),
        type: 'error',
        durationMs: 3600,
      });
    } finally {
      setSubmittingReplyId(null);
    }
  }, [addNotification, canReplyToReviews, currentUserId, promptLogin, replyDraftByReview, t]);

  const onSubmitReview = useCallback(async () => {
    if (!eventId) {
      console.error('[ReviewSubmit][Event] missing event_id');
      addNotification({
        message: t('review.validation.missingEvent'),
        type: 'error',
        durationMs: 3800,
      });
      return;
    }

    if (!currentUserId) {
      console.error('[ReviewSubmit][Event] missing authenticated user session');
      promptLogin(t('review.validation.loginRequired'));
      return;
    }

    const rating = Number(draftRating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      console.error('[ReviewSubmit][Event] invalid rating', { rating: draftRating });
      addNotification({
        message: t('review.validation.invalidRating'),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    setSubmittingReview(true);
    try {
      const uploadedPhotoUrls: string[] = [];
      if (draftPhotoAssets.length > 0) {
        setUploadingDraftPhotos(true);
        try {
          for (const asset of draftPhotoAssets.slice(0, MAX_REVIEW_PHOTOS)) {
            if (!asset.uri) continue;

            const response = await withTimeout(
              fetch(asset.uri),
              15000,
              t('review.error.uploadTimeout')
            );

            if (!response.ok) {
              throw new Error(`${t('review.error.uploadFailed')} (HTTP ${response.status})`);
            }

            const blob = await withTimeout(
              response.blob(),
              10000,
              t('review.error.uploadTimeout')
            );

            const uploadResult = await withTimeout(
              reviewService.uploadReviewImage({
                file: blob,
                fileName: asset.fileName ?? `event-review-${Date.now()}.jpg`,
                contentType: asset.mimeType ?? 'image/jpeg',
              }),
              20000,
              t('review.error.uploadTimeout')
            );

            if (!uploadResult?.publicUrl) {
              throw new Error(t('review.error.uploadFailed'));
            }

            uploadedPhotoUrls.push(uploadResult.publicUrl);
          }
        } finally {
          setUploadingDraftPhotos(false);
        }
      }

      await withTimeout(
        eventReviewService.submitEventReview({
          event_id: eventId,
          rating,
          comment: draftComment.trim() ? draftComment.trim() : null,
          imageUrls: uploadedPhotoUrls,
        }),
        15000,
        t('review.error.submitFailed', { reason: t('review.error.uploadTimeout') })
      );

      setDraftComment('');
      setDraftRating(5);
      setDraftPhotoAssets([]);
      setIsWritingReview(false);

      addNotification({
        message: t('review.success.submitEvent'),
        type: 'success',
        durationMs: 2400,
      });

      await refreshReviews();
    } catch (error: any) {
      const rawMessage = String(error?.message ?? '').trim();
      const lowerMessage = rawMessage.toLowerCase();

      const reason = lowerMessage.includes('row-level security') || lowerMessage.includes('policy')
        ? t('review.error.rlsBlocked')
        : (rawMessage || t('review.error.uploadFailed'));

      console.error('[ReviewSubmit][Event] failed', {
        eventId,
        currentUserId,
        rating,
        draftPhotoCount: draftPhotoAssets.length,
        reason,
        rawMessage,
        error,
      });

      addNotification({
        message: t('review.error.submitFailed', { reason }),
        type: 'error',
        durationMs: 4200,
      });
    } finally {
      setUploadingDraftPhotos(false);
      setSubmittingReview(false);
    }
  }, [
    addNotification,
    currentUserId,
    draftComment,
    draftPhotoAssets,
    draftRating,
    eventId,
    promptLogin,
    refreshReviews,
    t,
  ]);

  const onSubmitEdit = useCallback(
    async (formData: EventEditData) => {
      if (!event) return;

      const start = combineLocalDateTime(formData.startDate, formData.startTime);
      const end = combineLocalDateTime(formData.endDate, formData.endTime);

      if (!start || !end) {
        Alert.alert('Dữ liệu thời gian chưa đúng', 'Vui lòng nhập đúng định dạng ngày giờ.');
        return;
      }

      if (end <= start) {
        Alert.alert('Dữ liệu thời gian chưa đúng', 'Thời gian kết thúc phải sau thời gian bắt đầu.');
        return;
      }

      const price = Number(formData.price || '0');
      if (Number.isNaN(price) || price < 0) {
        Alert.alert('Giá không hợp lệ', 'Giá phải là số lớn hơn hoặc bằng 0.');
        return;
      }

      try {
        await eventService.updateEvent(event.id, {
          title: formData.title,
          category: formData.category,
          location: formData.location,
          start_time: start,
          end_time: end,
          price,
          image_url: formData.imageUrl.trim() ? formData.imageUrl.trim() : null,
          description: formData.description.trim() ? formData.description.trim() : null,
        });

        await fetchEvent();
        setShowEditModal(false);
        addNotification({
          message: 'Cập nhật sự kiện thành công.',
          type: 'success',
          durationMs: 2800,
        });
      } catch (err: any) {
        Alert.alert('Không thể cập nhật', err?.message ?? 'Đã có lỗi xảy ra khi cập nhật sự kiện.');
      }
    },
    [addNotification, event, fetchEvent]
  );

  const onDeleteEvent = useCallback(
    async (id: string) => {
      if (!event) return;

      Alert.alert(
        'Xóa sự kiện',
        'Bạn chắc chắn muốn xóa sự kiện này? Hành động này không thể hoàn tác.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await eventService.deleteEvent(id || event.id);
                  router.replace('/(tabs)/explore' as any);
                } catch (err: any) {
                  Alert.alert('Không thể xóa', err?.message ?? 'Đã có lỗi xảy ra khi xóa sự kiện.');
                }
              })();
            },
          },
        ]
      );
    },
    [event]
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: colors.muted }]}>Đang tải chi tiết sự kiện...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerWrap}>
          <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage ?? 'Không tìm thấy sự kiện.'}</Text>

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Text style={[styles.outlineBtnText, { color: colors.text }]}>Quay lại</Text>
            </Pressable>

            <Pressable
              onPress={() => void fetchEvent()}
              style={({ pressed }) => [styles.solidBtn, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Text style={styles.solidBtnText}>Thử lại</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroWrap}>
          <ImageBackground
            source={{ uri: event.image_url || FALLBACK_EVENT_IMAGE }}
            style={styles.heroImage}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.32)', 'rgba(0,0,0,0.86)']}
              locations={[0, 0.5, 1]}
              style={styles.heroGradient}
            />

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backBtn, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Feather name="chevron-left" size={22} color="#ffffff" />
            </Pressable>

            {isOwner ? (
              <Pressable
                onPress={() => setShowEditModal(true)}
                style={({ pressed }) => [styles.editBtn, pressed ? { opacity: 0.84 } : null]}
                accessibilityRole="button"
              >
                <Feather name="edit-2" size={16} color="#ffffff" />
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            ) : null}

            <View style={styles.heroBottom}>
              <View style={styles.heroBadgeRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{event.category}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{statusLabel(liveStatus)}</Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>{event.title}</Text>
            </View>
          </ImageBackground>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Mô tả</Text>
          <Text style={[styles.sectionText, { color: colors.text }]}>
            {event.description?.trim() ? event.description : 'Chưa có mô tả cho sự kiện này.'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Thông tin sự kiện</Text>

          <InfoRow label="ID" value={event.id} color={colors} />
          <InfoRow label="Category" value={event.category} color={colors} />
          <InfoRow label="Location" value={event.location} color={colors} />
          <InfoRow label="Start" value={formatDateTime(event.start_time)} color={colors} />
          <InfoRow label="End" value={formatDateTime(event.end_time)} color={colors} />
          <InfoRow label="Price" value={formatPrice(Number(event.price ?? 0))} color={colors} />
          <InfoRow label="Status" value={statusLabel(liveStatus)} color={colors} />
          <InfoRow label="Creator" value={event.creator_id} color={colors} />
          <InfoRow label="Created at" value={formatDateTime(event.created_at)} color={colors} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Ke hoach du lich</Text>
          <Text style={[styles.sectionText, { color: colors.text }]}>Them su kien nay vao lich trinh theo tung ngay.</Text>

          <Pressable
            onPress={() => void onPressAddToPlan()}
            disabled={addingToPlan}
            style={({ pressed }) => [
              styles.planButton,
              { opacity: addingToPlan ? 0.75 : 1 },
              pressed ? { opacity: 0.84 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Them su kien vao ke hoach"
          >
            {addingToPlan ? (
              <ActivityIndicator color="#001018" />
            ) : (
              <Feather name="plus-circle" size={18} color="#001018" />
            )}
            <Text style={styles.planButtonText}>{addingToPlan ? 'Dang them...' : 'Them vao ke hoach'}</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Đếm ngược sự kiện</Text>

          {liveStatus === 'incoming' && countdownParts ? (
            <>
              <Text style={[styles.sectionText, { color: colors.text }]}>Sự kiện sẽ bắt đầu sau:</Text>
              <View style={styles.countdownRow}>
                <CountdownTile label="Ngày" value={String(countdownParts.days)} />
                <CountdownTile label="Giờ" value={twoDigits(countdownParts.hours)} />
                <CountdownTile label="Phút" value={twoDigits(countdownParts.minutes)} />
                <CountdownTile label="Giây" value={twoDigits(countdownParts.seconds)} />
              </View>
            </>
          ) : null}

          {liveStatus === 'ongoing' ? (
            <Text style={[styles.sectionText, { color: colors.text }]}>Sự kiện đang diễn ra.</Text>
          ) : null}

          {liveStatus === 'completed' ? (
            <Text style={[styles.sectionText, { color: colors.text }]}>Sự kiện đã kết thúc.</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.reviewsHeaderRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('review.section.titleEvent')}</Text>
              <Text style={{ color: colors.muted, fontWeight: '800', fontSize: 13 }}>
                {t('review.section.summary', {
                  rating: averageRating !== null ? averageRating.toFixed(1) : '—',
                  count: reviewsTotalCount ?? reviews.length,
                })}
              </Text>
            </View>

            <Pressable
              onPress={onPressWriteReview}
              style={({ pressed }) => [styles.writeReviewBtn, pressed ? { opacity: 0.86 } : null]}
              accessibilityRole="button"
            >
              <Text style={styles.writeReviewText}>{isWritingReview ? t('review.section.cancel') : t('review.section.write')}</Text>
            </Pressable>
          </View>

          <RatingDistribution entries={ratingDistribution} isDark={isDark} scale={s} />

          <View style={styles.reviewSortRow}>
            {([
              { value: 'newest' as const, label: t('review.sort.newest') },
              { value: 'highest' as const, label: t('review.sort.highest') },
              { value: 'lowest' as const, label: t('review.sort.lowest') },
              { value: 'most-helpful' as const, label: t('review.sort.helpful') },
            ]).map((option) => {
              const active = reviewSort === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setReviewSort(option.value)}
                  style={({ pressed }) => [
                    styles.reviewSortChip,
                    {
                      backgroundColor: active
                        ? 'rgba(34, 211, 238, 0.16)'
                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'),
                      borderColor: active
                        ? 'rgba(34, 211, 238, 0.45)'
                        : (isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)'),
                    },
                    pressed ? { opacity: 0.84 } : null,
                  ]}
                  accessibilityRole="button"
                >
                  <Text
                    style={{
                      fontWeight: '800',
                      fontSize: 12,
                      color: active ? ExploreEaseColors.primary : colors.muted,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loadingReviews ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
              <Text style={[styles.loadingText, { color: colors.muted }]}>{t('review.section.loading')}</Text>
            </View>
          ) : null}

          {isWritingReview ? (
            <ReviewForm
              isDark={isDark}
              scale={s}
              rating={draftRating}
              comment={draftComment}
              photoUris={draftPhotoAssets.map((asset) => asset.uri)}
              maxPhotos={MAX_REVIEW_PHOTOS}
              submitting={submittingReview}
              uploadingPhotos={uploadingDraftPhotos}
              onChangeRating={setDraftRating}
              onChangeComment={setDraftComment}
              onPickPhotos={() => void pickReviewPhotos()}
              onRemovePhoto={removeDraftPhoto}
              onSubmit={onSubmitReview}
            />
          ) : null}
        </View>

        {!loadingReviews && sortedReviews.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionText, { color: colors.muted }]}>{t('review.section.emptyEvent')}</Text>
          </View>
        ) : null}

        {sortedReviews.map((item) => {
          const reviewId = String(item.id);
          const helpfulCount = typeof item.helpful_count === 'number' ? item.helpful_count : 0;
          const isHelpful = !!item.viewer_has_helpful_vote;
          const reviewImageUrls = toReviewImageUrls(item.review_image_urls);

          return (
            <ReviewCard
              key={reviewId}
              isDark={isDark}
              scale={s}
              reviewerName={item.profiles?.full_name ?? t('review.card.anonymous')}
              avatarUrl={item.profiles?.avatar_url ?? null}
              rating={Number(item.rating) || 0}
              comment={item.comment ?? null}
              createdAt={item.created_at ?? null}
              imageUrls={reviewImageUrls}
              helpfulCount={helpfulCount}
              isHelpful={isHelpful}
              helpfulLoading={helpfulPendingId === reviewId}
              canReply={canReplyToReviews}
              replyText={item.reply_text ?? null}
              replyDraft={replyDraftByReview[reviewId] ?? ''}
              replyLoading={submittingReplyId === reviewId}
              onChangeReplyDraft={(value) =>
                setReplyDraftByReview((prev) => ({
                  ...prev,
                  [reviewId]: value,
                }))
              }
              onSubmitReply={() => void submitReplyToReview(reviewId)}
              onToggleHelpful={() => void onToggleHelpfulReview(item)}
              onReport={() => openReportModal(reviewId)}
            />
          );
        })}

        {hasMoreReviews ? (
          <View style={{ marginHorizontal: 14, marginTop: 10 }}>
            <Pressable
              onPress={() => void loadMoreReviews()}
              disabled={loadingMoreReviews || loadingReviews}
              style={({ pressed }) => [
                styles.loadMoreBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
                  opacity: loadingMoreReviews || loadingReviews ? 0.7 : 1,
                },
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              {loadingMoreReviews ? (
                <ActivityIndicator color={ExploreEaseColors.primary} />
              ) : (
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>{t('review.section.loadMore')}</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={{ marginHorizontal: 14, marginTop: 14 }}>
          <TimeOfDayToggle
            value={timeOfDayPreference}
            onChange={setTimeOfDayPreference}
            title={t('recommendation.timing.title')}
          />

          <YouMightAlsoLike
            items={recommendationItems}
            loading={loadingRecommendations}
            timeOfDay={activeRecommendationTimeOfDay}
            travelStyle={recommendations?.preferences.travelStyle ?? null}
            onPressItem={onPressRecommendationItem}
            title={t('recommendation.suggestions.title')}
            subtitle={t('recommendation.suggestions.subtitleEvent')}
          />
        </View>
      </ScrollView>

      <Modal
        visible={isTripPickerModalOpen && Platform.OS === 'web'}
        transparent
        animationType="fade"
        onRequestClose={closeTripPicker}
      >
        <Pressable
          onPress={closeTripPicker}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
        >
          <Pressable
            onPress={() => void 0}
            style={{
              width: '100%',
              maxWidth: 520,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
              backgroundColor: isDark ? 'rgba(26, 38, 55, 0.98)' : '#ffffff',
              padding: 16,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>
                Thêm vào kế hoạch
              </Text>
              <Pressable
                onPress={closeTripPicker}
                style={({ pressed, hovered }) => [
                  {
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  },
                  (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Đóng"
              >
                <MaterialCommunityIcons name="close" size={18} color={isDark ? '#ffffff' : '#0f172a'} />
              </Pressable>
            </View>

            {loadingTrips ? (
              <View style={{ paddingTop: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={{ fontWeight: '700', color: isDark ? 'rgba(148,163,184,0.95)' : 'rgba(15,23,42,0.55)' }}>
                  Đang tải chuyến đi...
                </Text>
              </View>
            ) : selectedTripRow ? (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                    padding: 14,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: '900', fontSize: 14, color: isDark ? '#ffffff' : '#0f172a' }}>
                    {selectedTripRow.name}
                  </Text>
                  <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                    Chọn ngày để thêm sự kiện
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {Array.from({ length: selectedTripDaysCount }, (_, i) => i + 1).map((d) => {
                    const active = d === selectedTripDay;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setSelectedTripDay(d)}
                        style={({ pressed, hovered }) => [
                          {
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 14,
                            backgroundColor: active
                              ? ExploreEaseColors.primary
                              : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.06)'),
                          },
                          (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                          pressed ? { opacity: 0.86 } : null,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: active ? '#001018' : (isDark ? '#94a3b8' : '#64748b') }}>
                          Ngày {d}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => setSelectedTripRow(null)}
                    disabled={savingToTrip}
                    style={({ pressed, hovered }) => [
                      {
                        height: 48,
                        borderRadius: 16,
                        paddingHorizontal: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                        opacity: savingToTrip ? 0.7 : 1,
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>Đổi chuyến</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void addToTrip()}
                    disabled={savingToTrip}
                    style={({ pressed, hovered }) => [
                      {
                        flex: 1,
                        height: 48,
                        borderRadius: 16,
                        backgroundColor: ExploreEaseColors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 10,
                        opacity: savingToTrip ? 0.7 : 1,
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Xác nhận thêm vào hành trình"
                  >
                    {savingToTrip ? (
                      <ActivityIndicator color="#001018" />
                    ) : (
                      <MaterialCommunityIcons name="check" size={18} color="#001018" />
                    )}
                    <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>Xác nhận</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Chọn một chuyến đi
                </Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 10 }}>
                  {trips.map((trip) => {
                    const start = parseDateOnly(trip.start_date ?? null);
                    const end = parseDateOnly(trip.end_date ?? null);
                    const daysCount = toDaysCount(start, end);
                    return (
                      <Pressable
                        key={trip.id}
                        onPress={() => {
                          setSelectedTripRow(trip);
                          setSelectedTripDay(1);
                        }}
                        style={({ pressed, hovered }) => [
                          {
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                            padding: 14,
                            gap: 6,
                          },
                          (Platform.OS === 'web' && hovered) ? { opacity: 0.98 } : null,
                          pressed ? { opacity: 0.86 } : null,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontWeight: '900', fontSize: 14, color: isDark ? '#ffffff' : '#0f172a' }} numberOfLines={1}>
                          {trip.name}
                        </Text>
                        <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }} numberOfLines={2}>
                          {(trip.destination ?? '').trim() ? `${trip.destination} • ` : ''}{daysCount} ngày
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isNoTripsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNoTripsModalOpen(false)}
      >
        <Pressable
          onPress={() => setIsNoTripsModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
        >
          <Pressable
            onPress={() => void 0}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
              backgroundColor: isDark ? 'rgba(26, 38, 55, 0.98)' : '#ffffff',
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>
              Chưa có chuyến đi
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b', lineHeight: 18 }}>
              Bạn cần tạo ít nhất một chuyến đi trước khi thêm sự kiện này.
            </Text>

            <Pressable
              onPress={() => void createTripAndAutoAdd()}
              disabled={creatingTripAndAdding}
              style={({ pressed, hovered }) => [
                {
                  height: 48,
                  borderRadius: 16,
                  backgroundColor: ExploreEaseColors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 10,
                  opacity: creatingTripAndAdding ? 0.7 : 1,
                },
                (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                pressed ? { opacity: 0.86 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Tạo ngay"
            >
              {creatingTripAndAdding ? (
                <ActivityIndicator color="#001018" />
              ) : (
                <MaterialCommunityIcons name="plus" size={18} color="#001018" />
              )}
              <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>Tạo ngay</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS !== 'web' && isAddToTripOpen ? (
        <BottomSheet
          ref={addSheetRef}
          index={0}
          snapPoints={addSheetSnapPoints}
          enablePanDownToClose
          onClose={closeAddToTrip}
          backdropComponent={renderAddSheetBackdrop}
          backgroundStyle={{ backgroundColor: isDark ? 'rgba(26, 38, 55, 0.98)' : '#ffffff' }}
          handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.18)' }}
        >
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>
                Thêm vào kế hoạch
              </Text>

              <Pressable
                onPress={closeAddToTrip}
                style={({ pressed, hovered }) => [
                  {
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  },
                  (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Đóng"
              >
                <MaterialCommunityIcons name="close" size={18} color={isDark ? '#ffffff' : '#0f172a'} />
              </Pressable>
            </View>

            {loadingTrips ? (
              <View style={{ paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={{ fontWeight: '700', color: isDark ? 'rgba(148,163,184,0.95)' : 'rgba(15,23,42,0.55)' }}>
                  Đang tải chuyến đi...
                </Text>
              </View>
            ) : trips.length === 0 ? (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                    padding: 14,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: '900', fontSize: 14, color: isDark ? '#ffffff' : '#0f172a' }}>
                    Bạn chưa có chuyến đi nào
                  </Text>
                  <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                    Tạo chuyến đi mới để thêm sự kiện vào hành trình.
                  </Text>
                </View>

                <Pressable
                  onPress={() => void createTrip()}
                  disabled={creatingTrip}
                  style={({ pressed, hovered }) => [
                    {
                      height: 48,
                      borderRadius: 16,
                      backgroundColor: ExploreEaseColors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 10,
                      opacity: creatingTrip ? 0.7 : 1,
                    },
                    (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                    pressed ? { opacity: 0.86 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Tạo chuyến đi mới"
                >
                  {creatingTrip ? (
                    <ActivityIndicator color="#001018" />
                  ) : (
                    <MaterialCommunityIcons name="plus" size={18} color="#001018" />
                  )}
                  <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>
                    Tạo chuyến đi mới
                  </Text>
                </Pressable>
              </View>
            ) : selectedTripRow ? (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                    padding: 14,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontWeight: '900', fontSize: 14, color: isDark ? '#ffffff' : '#0f172a' }}>
                    {selectedTripRow.name}
                  </Text>
                  <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                    Chọn ngày để thêm sự kiện
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {Array.from({ length: selectedTripDaysCount }, (_, i) => i + 1).map((d) => {
                    const active = d === selectedTripDay;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setSelectedTripDay(d)}
                        style={({ pressed, hovered }) => [
                          {
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 14,
                            backgroundColor: active
                              ? ExploreEaseColors.primary
                              : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.06)'),
                          },
                          (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                          pressed ? { opacity: 0.86 } : null,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: active ? '#001018' : (isDark ? '#94a3b8' : '#64748b') }}>
                          Ngày {d}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => setSelectedTripRow(null)}
                    disabled={savingToTrip}
                    style={({ pressed, hovered }) => [
                      {
                        height: 48,
                        borderRadius: 16,
                        paddingHorizontal: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                        opacity: savingToTrip ? 0.7 : 1,
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>Đổi chuyến</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void addToTrip()}
                    disabled={savingToTrip}
                    style={({ pressed, hovered }) => [
                      {
                        flex: 1,
                        height: 48,
                        borderRadius: 16,
                        backgroundColor: ExploreEaseColors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 10,
                        opacity: savingToTrip ? 0.7 : 1,
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Xác nhận thêm vào hành trình"
                  >
                    {savingToTrip ? (
                      <ActivityIndicator color="#001018" />
                    ) : (
                      <MaterialCommunityIcons name="check" size={18} color="#001018" />
                    )}
                    <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>Xác nhận</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={{ fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Chọn một chuyến đi
                </Text>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 10 }}>
                  {trips.map((trip) => {
                    const start = parseDateOnly(trip.start_date ?? null);
                    const end = parseDateOnly(trip.end_date ?? null);
                    const daysCount = toDaysCount(start, end);
                    return (
                      <Pressable
                        key={trip.id}
                        onPress={() => {
                          setSelectedTripRow(trip);
                          setSelectedTripDay(1);
                        }}
                        style={({ pressed, hovered }) => [
                          {
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
                            padding: 14,
                            gap: 6,
                          },
                          (Platform.OS === 'web' && hovered) ? { opacity: 0.98 } : null,
                          pressed ? { opacity: 0.86 } : null,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontWeight: '900', fontSize: 14, color: isDark ? '#ffffff' : '#0f172a' }} numberOfLines={1}>
                          {trip.name}
                        </Text>
                        <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }} numberOfLines={2}>
                          {(trip.destination ?? '').trim() ? `${trip.destination} • ` : ''}{daysCount} ngày
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </BottomSheet>
      ) : null}

      <Modal
        visible={showEditModal && !!event && !!initialEditData && isOwner}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
          {event && initialEditData ? (
            <EditEventForm
              eventId={event.id}
              initialData={initialEditData}
              onCancel={() => setShowEditModal(false)}
              onSubmit={onSubmitEdit}
              onDelete={onDeleteEvent}
            />
          ) : null}
        </SafeAreaView>
      </Modal>

      <ModerationModal
        visible={reportModalVisible}
        isDark={isDark}
        reason={reportReason}
        submitting={submittingReport}
        onClose={() => {
          if (submittingReport) return;
          setReportModalVisible(false);
          setReportReviewId(null);
          setReportReason('');
        }}
        onChangeReason={setReportReason}
        onSubmit={() => void submitReviewReport()}
        title={t('review.report.title')}
        description={t('review.report.description')}
        submitLabel={t('review.report.submit')}
      />
    </SafeAreaView>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
  color: {
    title: string;
    text: string;
    border: string;
  };
};

function InfoRow({ label, value, color }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, { borderColor: color.border }]}>
      <Text style={[styles.infoLabel, { color: color.title }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: color.text }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

type CountdownTileProps = {
  label: string;
  value: string;
};

function CountdownTile({ label, value }: CountdownTileProps) {
  return (
    <View style={styles.countdownTile}>
      <Text style={styles.countdownValue}>{value}</Text>
      <Text style={styles.countdownLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingBottom: 30,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  stateText: {
    fontSize: 14,
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
  heroWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  heroImage: {
    width: '100%',
    height: 300,
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  backBtn: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  editBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15,23,42,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  editBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  heroBottom: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  categoryBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: ExploreEaseColors.primary,
  },
  categoryBadgeText: {
    color: '#001018',
    fontSize: 11,
    fontWeight: '900',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  card: {
    marginTop: 14,
    marginHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  planButton: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: ExploreEaseColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  planButtonText: {
    color: '#001018',
    fontSize: 13,
    fontWeight: '900',
  },
  reviewsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  writeReviewBtn: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  writeReviewText: {
    color: ExploreEaseColors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  reviewSortRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  reviewSortChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loadMoreBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
  },
  countdownTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  countdownValue: {
    color: ExploreEaseColors.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  countdownLabel: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
  },
  infoRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
