import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ImageBackground,
    Keyboard,
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

import { TimeOfDayToggle } from '@/components/home/TimeOfDayToggle';
import { YouMightAlsoLike, type YouMightAlsoLikeItem } from '@/components/home/YouMightAlsoLike';
import { ModerationModal, RatingDistribution, ReviewCard, ReviewForm } from '@/components/reviews';
import { QrShareModal } from '@/components/share/QrShareModal';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useLocation } from '@/hooks/useLocation';
import { useNetwork } from '@/hooks/useNetwork';
import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { calculateAverageRating, destinationService, type ReviewRow } from '@/src/services/destinationService';
import { favoritesService } from '@/src/services/favoritesService';
import { itineraryService } from '@/src/services/itineraryService';
import { offlineSyncService } from '@/src/services/offlineSyncService';
import { recommendationService, resolveTimeOfDayPreference, type PersonalizedRecommendationsResult } from '@/src/services/recommendationService';
import { reviewService } from '@/src/services/reviewService';
import { socialService } from '@/src/services/socialService';
import { storageService } from '@/src/services/storageService';
import { supabase } from '@/src/services/supabase';
import { tripService, type TripRow } from '@/src/services/tripService';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { useRecommendationPreferencesStore } from '@/src/store/useRecommendationPreferencesStore';
import { buildDestinationShareUrl } from '@/src/utils/shareLinks';
import { parseMoneyToNumber } from '@/utils/format';
import { formatDistance, getHaversineDistance } from '@/utils/location';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DetailParams = {
  id?: string;
  name?: string;
  location?: string;
  price?: string;
  rating?: string;
  imageUrl?: string;
};

type ReviewSortOption = 'newest' | 'highest' | 'lowest' | 'most-helpful';

const MAX_REVIEW_PHOTOS = 3;
const DESTINATION_OPEN_HOUR = 8;
const DESTINATION_CLOSE_HOUR = 22;

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNumberOrNull = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  return Number.isFinite(n) ? n : null;
};

const extractCoords = (row: any) => {
  if (!row) return null;
  const latitude =
    toNumberOrNull(row.latitude) ??
    toNumberOrNull(row.lat) ??
    toNumberOrNull(row.Latitude) ??
    toNumberOrNull(row.Lat);
  const longitude =
    toNumberOrNull(row.longitude) ??
    toNumberOrNull(row.lng) ??
    toNumberOrNull(row.long) ??
    toNumberOrNull(row.Longitude) ??
    toNumberOrNull(row.Lng);

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
};

const toAmenityList = (value: unknown) => {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.map((v) => String(v)).map((v) => v.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [] as string[];
};

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

const toDestinationCategory = (row: any): string | null => {
  if (!row) return null;

  const relation = row.categories;
  if (Array.isArray(relation)) {
    const first = relation[0];
    if (first && typeof first.name === 'string' && first.name.trim()) return first.name.trim();
  }

  if (relation && typeof relation === 'object') {
    const name = (relation as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }

  if (typeof row.category === 'string' && row.category.trim()) return row.category.trim();
  return null;
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

const openGoogleMaps = async (coords: { latitude: number; longitude: number }) => {
  const destination = `${coords.latitude},${coords.longitude}`;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof (window as any).open === 'function') {
      (window as any).open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }

  await Linking.openURL(url);
};

const releaseOverlayTriggerFocus = () => {
  Keyboard.dismiss();

  if (Platform.OS !== 'web') return;

  try {
    const activeElement = (globalThis as any)?.document?.activeElement as { blur?: () => void } | null | undefined;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
  } catch {
    // Ignore focus release failures on unsupported environments.
  }
};

export default function DestinationDetailScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const { formatPricePerPerson } = useCurrency();
  const timeOfDayPreference = useRecommendationPreferencesStore((s) => s.timeOfDayPreference);
  const setTimeOfDayPreference = useRecommendationPreferencesStore((s) => s.setTimeOfDayPreference);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<DetailParams>();

  const listRef = useRef<FlatList<ReviewRow>>(null);

  const scale = useMemo(() => clamp(screenWidth / 390, 0.86, 1.18), [screenWidth]);
  const s = useCallback((value: number) => Math.round(value * scale), [scale]);

  const name = params.name ? String(params.name) : 'Điểm đến';
  const price = params.price ? String(params.price) : '';

  const destinationId = params.id ? String(params.id) : '';

  const { location, errorMsg: locationErrorMsg, isLoading: isLoadingLocation } = useLocation();
  const { isOnline } = useNetwork();
  const [destinationCoords, setDestinationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingDestination, setLoadingDestination] = useState(false);
  const [destinationPrice, setDestinationPrice] = useState<unknown>(null);
  const [destinationRow, setDestinationRow] = useState<any | null>(null);
  const [isUsingOfflineCache, setIsUsingOfflineCache] = useState(false);
  const [nowTickMs, setNowTickMs] = useState(() => Date.now());

  const [isFavorited, setIsFavorited] = useState(false);
  const [loadingFavorite, setLoadingFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const ratingFromParams = useMemo(() => {
    const raw = params.rating ? Number(params.rating) : NaN;
    if (Number.isFinite(raw)) return raw;
    return null;
  }, [params.rating]);

  const imageUrl = params.imageUrl
    ? String(params.imageUrl)
    : 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21';

  const headerHeight = Math.round(clamp(screenHeight * 0.42, s(260), s(360)));
  const isCompactFooterLayout = screenWidth <= 390;

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
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

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const addSheetRef = useRef<BottomSheet>(null);
  const [isAddToTripOpen, setIsAddToTripOpen] = useState(false);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [selectedTripRow, setSelectedTripRow] = useState<TripRow | null>(null);
  const [selectedTripDay, setSelectedTripDay] = useState<number>(1);
  const [savingToTrip, setSavingToTrip] = useState(false);

  const [isNoTripsModalOpen, setIsNoTripsModalOpen] = useState(false);
  const [creatingTripAndAdding, setCreatingTripAndAdding] = useState(false);
  const [isTripPickerModalOpen, setIsTripPickerModalOpen] = useState(false);
  const [qrShareVisible, setQrShareVisible] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState<PersonalizedRecommendationsResult | null>(null);

  const addNotification = useNotificationStore((s) => s.addNotification);
  const destinationDisplayName = useMemo(
    () => String(destinationRow?.name ?? destinationRow?.title ?? name).trim() || 'địa điểm này',
    [destinationRow?.name, destinationRow?.title, name]
  );
  const qrSharePayload = useMemo(() => {
    const qrValue = buildDestinationShareUrl({
      id: destinationId,
      name: destinationDisplayName,
    });

    return {
      qrValue,
      shareMessage: `Khám phá địa điểm "${destinationDisplayName}" tại ExploreEase:\n${qrValue}`,
    };
  }, [destinationDisplayName, destinationId]);
  const effectiveRecommendationTimeOfDay = useMemo(
    () => resolveTimeOfDayPreference(timeOfDayPreference),
    [timeOfDayPreference]
  );

  const REVIEWS_PAGE_SIZE = 10;

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
    if (!destinationId) return;
    setLoadingReviews(true);
    setLoadingMoreReviews(false);
    setHasMoreReviews(true);
    setReviewsTotalCount(null);
    try {
      const res = await destinationService.getReviewsPage(destinationId, { from: 0, limit: REVIEWS_PAGE_SIZE });
      setReviews(res.rows ?? []);
      setReviewsTotalCount(res.totalCount);
      const loaded = (res.rows ?? []).length;
      if (typeof res.totalCount === 'number') setHasMoreReviews(loaded < res.totalCount);
      else setHasMoreReviews(loaded >= REVIEWS_PAGE_SIZE);
    } catch (error) {
      console.warn('refreshReviews failed:', error);
      setReviews([]);
      setReviewsTotalCount(null);
      setHasMoreReviews(false);
    } finally {
      setLoadingReviews(false);
    }
  }, [destinationId]);

  const loadMoreReviews = useCallback(async () => {
    if (!destinationId) return;
    if (loadingReviews || loadingMoreReviews || !hasMoreReviews) return;

    const from = reviews.length;
    setLoadingMoreReviews(true);
    try {
      const res = await destinationService.getReviewsPage(destinationId, { from, limit: REVIEWS_PAGE_SIZE });
      const nextRows = res.rows ?? [];
      const existingIds = new Set(reviews.map((r) => r.id));
      const uniqueRows = nextRows.filter((r) => !existingIds.has(r.id));

      setReviewsTotalCount((prev) => (typeof prev === 'number' ? prev : res.totalCount));
      setReviews((prev) => [...(prev ?? []), ...uniqueRows]);

      const nextCount = from + uniqueRows.length;
      if (typeof res.totalCount === 'number') setHasMoreReviews(nextCount < res.totalCount);
      else setHasMoreReviews(uniqueRows.length >= REVIEWS_PAGE_SIZE);
    } catch (error) {
      console.warn('loadMoreReviews failed:', error);
      setHasMoreReviews(false);
    } finally {
      setLoadingMoreReviews(false);
    }
  }, [destinationId, hasMoreReviews, loadingMoreReviews, loadingReviews, reviews]);

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
      const rows = await tripService.getTripsForCurrentUser();
      setTrips(rows ?? []);
      return (rows ?? []) as TripRow[];
    } catch (err: any) {
      console.warn('loadTrips failed:', err?.message ?? err);
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
      console.warn('ensureLoggedIn failed:', err?.message ?? err);
    }

    Alert.alert(t('common.loginRequiredTitle'), t('destination.auth.addToPlanLoginRequired'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.login'), onPress: () => router.push('/login' as any) },
    ]);
    return false;
  }, [t]);

  const openAddToTrip = useCallback(() => {
    releaseOverlayTriggerFocus();
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

  const createTrip = useCallback(async () => {
    if (creatingTrip) return;

    const ok = await ensureLoggedIn();
    if (!ok) return;

    setCreatingTrip(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const newTrip = await tripService.createTripForCurrentUser({
        name: t('destination.trip.newTripName', { name }),
        destination: name,
        cover: imageUrl,
        start_date: todayIso,
        end_date: todayIso,
      });

      setTrips((prev) => [newTrip, ...(prev ?? [])]);
      setSelectedTripRow(newTrip);
      setSelectedTripDay(1);
    } catch (err: any) {
      console.warn('createTrip failed:', err?.message ?? err);
      Alert.alert(t('trips.error.createTitle'), t('trips.error.tryAgainLater'));
    } finally {
      setCreatingTrip(false);
    }
  }, [creatingTrip, ensureLoggedIn, imageUrl, name, t]);

  const createTripAndAutoAdd = useCallback(async () => {
    if (creatingTripAndAdding) return;
    if (!destinationId) {
      Alert.alert(t('destination.trip.error.addFailedTitle'), t('destination.trip.error.missingDestinationId'));
      return;
    }

    const ok = await ensureLoggedIn();
    if (!ok) return;

    const coords = destinationCoords;
    const lat = coords?.latitude ?? null;
    const lng = coords?.longitude ?? null;

    const itemName = String(destinationRow?.name ?? destinationRow?.title ?? name).trim() || name;
    const itemImageUrl =
      (typeof destinationRow?.image_url === 'string' && destinationRow.image_url.trim())
        ? destinationRow.image_url.trim()
        : (typeof destinationRow?.thumbnail_url === 'string' && destinationRow.thumbnail_url.trim())
          ? destinationRow.thumbnail_url.trim()
          : imageUrl;

    setCreatingTripAndAdding(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const newTrip = await tripService.createTripForCurrentUser({
        name: t('destination.trip.newTripName', { name }),
        destination: name,
        cover: imageUrl,
        start_date: todayIso,
        end_date: todayIso,
      });

      await itineraryService.addDestinationToTripDay({
        tripId: newTrip.id,
        day: 1,
        destination_id: destinationId,
        name: itemName,
        image_url: itemImageUrl,
        latitude: lat,
        longitude: lng,
      });

      setTrips((prev) => [newTrip, ...(prev ?? [])]);
      setSelectedTripRow(newTrip);
      setSelectedTripDay(1);
      setIsNoTripsModalOpen(false);

      addNotification({
        message: `Đã thêm "${itemName}" vào kế hoạch`,
        type: 'success',
        durationMs: 3000,
      });
    } catch (err: any) {
      console.warn('createTripAndAutoAdd failed:', err?.message ?? err);
      Alert.alert(t('destination.trip.error.addFailedTitle'), t('trips.error.tryAgainLater'));
    } finally {
      setCreatingTripAndAdding(false);
    }
  }, [addNotification, creatingTripAndAdding, destinationCoords, destinationId, destinationRow, ensureLoggedIn, imageUrl, name, t]);

  const addToTrip = useCallback(async () => {
    if (!selectedTripRow || savingToTrip) return;
    if (!destinationId) {
      Alert.alert(t('destination.trip.error.addFailedTitle'), t('destination.trip.error.missingDestinationId'));
      return;
    }

    const ok = await ensureLoggedIn();
    if (!ok) return;

    const coords = destinationCoords;
    const lat = coords?.latitude ?? null;
    const lng = coords?.longitude ?? null;

    const itemName = String(destinationRow?.name ?? destinationRow?.title ?? name).trim() || name;
    const itemImageUrl =
      (typeof destinationRow?.image_url === 'string' && destinationRow.image_url.trim())
        ? destinationRow.image_url.trim()
        : (typeof destinationRow?.thumbnail_url === 'string' && destinationRow.thumbnail_url.trim())
          ? destinationRow.thumbnail_url.trim()
          : imageUrl;

    setSavingToTrip(true);
    try {
      await itineraryService.addDestinationToTripDay({
        tripId: selectedTripRow.id,
        day: selectedTripDay,
        destination_id: destinationId,
        name: itemName,
        image_url: itemImageUrl,
        latitude: lat,
        longitude: lng,
      });

      closeTripPicker();
      addNotification({
        message: `Đã thêm "${itemName}" vào kế hoạch`,
        type: 'success',
        durationMs: 3000,
      });
    } catch (err: any) {
      console.warn('addToTrip failed:', err?.message ?? err);
      Alert.alert(t('destination.trip.error.addFailedTitle'), t('trips.error.tryAgainLater'));
    } finally {
      setSavingToTrip(false);
    }
  }, [addNotification, closeTripPicker, destinationCoords, destinationId, destinationRow, ensureLoggedIn, imageUrl, name, savingToTrip, selectedTripDay, selectedTripRow, t]);

  const handleAddToPlan = useCallback(() => {
    void (async () => {
      const ok = await ensureLoggedIn();
      if (!ok) return;

      // Fetch trips first, then branch.
      const rows = await loadTrips();
      releaseOverlayTriggerFocus();

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

      // No trips: show modal with Create Now.
      setIsNoTripsModalOpen(true);
    })();
  }, [ensureLoggedIn, loadTrips, openAddToTrip]);

  const fetchDestinationCoords = useCallback(async () => {
    if (!destinationId) return;
    setLoadingDestination(true);
    try {
      const result = await destinationService.getDestinationByIdWithOfflineCache(destinationId, {
        isOnline,
      });

      const row = result.data ?? null;
      setDestinationRow(row ?? null);
      setDestinationCoords(extractCoords(row));
      setDestinationPrice((row as any)?.price ?? null);
      setIsUsingOfflineCache(result.source === 'cache');

      if (result.source === 'cache') {
        addNotification({
          message: t('destination.offline.loadedFromCache'),
          type: 'warning',
          durationMs: 3200,
        });
      }
    } catch (error) {
      console.warn('fetchDestinationCoords failed:', error);
      setDestinationRow(null);
      setDestinationCoords(null);
      setDestinationPrice(null);
      setIsUsingOfflineCache(false);

      if (!isOnline) {
        const reason = String((error as any)?.message ?? '');
        if (reason.includes('OFFLINE_CACHE_MISS')) {
          addNotification({
            message: t('destination.offline.noCachedData'),
            type: 'error',
            durationMs: 3600,
          });
        }
      }
    } finally {
      setLoadingDestination(false);
    }
  }, [addNotification, destinationId, isOnline, t]);

  useEffect(() => {
    void refreshReviews();
  }, [refreshReviews]);

  useEffect(() => {
    void fetchDestinationCoords();
  }, [fetchDestinationCoords]);

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
    if (!destinationId) return;
    let cancelled = false;
    setLoadingFavorite(true);
    void favoritesService
      .getIsFavorited(destinationId)
      .then((val) => {
        if (cancelled) return;
        setIsFavorited(!!val);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('getIsFavorited failed:', err);
        setIsFavorited(false);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingFavorite(false);
      });

    return () => {
      cancelled = true;
    };
  }, [destinationId]);

  useEffect(() => {
    const timerId = setInterval(() => {
      setNowTickMs(Date.now());
    }, 60_000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  const onToggleFavorite = useCallback(async () => {
    if (!destinationId) return;
    if (togglingFavorite) return;

    const next = !isFavorited;
    setTogglingFavorite(true);
    setIsFavorited(next);
    try {
      if (next) {
        await favoritesService.add(destinationId);
      } else {
        await favoritesService.remove(destinationId);
      }

      addNotification({
        message: next
          ? `Đã lưu địa điểm "${destinationDisplayName}"`
          : `Đã bỏ lưu địa điểm "${destinationDisplayName}"`,
        type: 'success',
        durationMs: 2600,
      });
    } catch (err) {
      console.warn('toggle favorite failed:', err);
      setIsFavorited(!next);
      const msg = String((err as any)?.message ?? '').toLowerCase();
      if (msg.includes('favorites table is missing')) {
        Alert.alert(t('destination.favorite.unavailableTitle'), t('destination.favorite.unavailableMessage'));
      } else {
        Alert.alert(t('destination.favorite.saveFailedTitle'), t('destination.favorite.saveFailedMessage'));
      }
    } finally {
      setTogglingFavorite(false);
    }
  }, [addNotification, destinationDisplayName, destinationId, isFavorited, t, togglingFavorite]);

  useEffect(() => {
    if (!destinationId) return;

    const channel = supabase
      .channel(`reviews:${destinationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews',
          filter: `destination_id=eq.${destinationId}`,
        },
        () => {
          void refreshReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [destinationId, refreshReviews]);

  const averageRating = useMemo(() => calculateAverageRating(reviews, 1), [reviews]);
  const displayRating = averageRating ?? ratingFromParams;

  const displayPrice = useMemo(() => {
    if (destinationPrice === null || typeof destinationPrice === 'undefined') {
      const paramPrice = typeof price === 'string' ? price.trim() : '';
      // If the param already looks like a formatted currency string, show it as-is
      // until the DB price loads (prevents double conversion flicker).
      if (paramPrice && (/\$|₫|USD|VND|đ/i.test(paramPrice) || /\/\s*người\s*$/i.test(paramPrice))) {
        return paramPrice;
      }
    }

    const amount = parseMoneyToNumber(destinationPrice ?? price);
    if (amount === null) return '—';
    return formatPricePerPerson(amount);
  }, [destinationPrice, formatPricePerPerson, price]);

  const distanceText = useMemo(() => {
    if (!location || !destinationCoords) return null;
    const meters = getHaversineDistance(
      location.latitude,
      location.longitude,
      destinationCoords.latitude,
      destinationCoords.longitude
    );
    return formatDistance(meters);
  }, [destinationCoords, location]);

  const isOpenNow = useMemo(() => {
    const now = new Date(nowTickMs);
    const minutes = now.getHours() * 60 + now.getMinutes();
    const openingMinutes = DESTINATION_OPEN_HOUR * 60;
    const closingMinutes = DESTINATION_CLOSE_HOUR * 60;

    return minutes >= openingMinutes && minutes < closingMinutes;
  }, [nowTickMs]);

  const canReplyToReviews = useMemo(() => {
    if (isAdmin) return true;
    if (!currentUserId) return false;

    const ownerCandidates = [
      (destinationRow as any)?.creator_id,
      (destinationRow as any)?.owner_id,
      (destinationRow as any)?.user_id,
      (destinationRow as any)?.created_by,
    ];

    return ownerCandidates.some((candidate) => {
      if (!candidate) return false;
      return String(candidate) === currentUserId;
    });
  }, [currentUserId, destinationRow, isAdmin]);

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
    const byCreatedAtDesc = (a: ReviewRow, b: ReviewRow) => {
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

    if (!isOnline) {
      addNotification({
        message: t('review.error.photoUploadRequiresInternet'),
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
  }, [addNotification, draftPhotoAssets.length, isOnline, t]);

  const removeDraftPhoto = useCallback((assetUri: string) => {
    setDraftPhotoAssets((prev) => prev.filter((asset) => asset.uri !== assetUri));
  }, []);

  const onPressWriteReview = useCallback(() => {
    setIsWritingReview((prev) => {
      const next = !prev;
      if (!next) {
        setDraftPhotoAssets([]);
      }
      return next;
    });
  }, []);

  const onToggleHelpfulReview = useCallback(async (review: ReviewRow) => {
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
      const result = await reviewService.toggleHelpful(reviewId);
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
      console.warn('toggleHelpful failed:', error);
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
    releaseOverlayTriggerFocus();
    setReportReviewId(reviewId);
    setReportReason('');
    setReportModalVisible(true);
  }, []);

  const handleReportReview = useCallback(async () => {
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
      await reviewService.reportReview({
        reviewId: reportReviewId,
        reason,
      });

      addNotification({
        message: t('review.success.reportDestination'),
        type: 'success',
        durationMs: 2600,
      });
      setReportModalVisible(false);
      setReportReason('');
      setReportReviewId(null);
    } catch (error: any) {
      console.warn('handleReportReview(destination) failed:', error);
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
      const result = await reviewService.replyToReview({
        reviewId,
        replyText,
      });

      setReviews((prev) =>
        prev.map((row) =>
          String(row.id) === reviewId
            ? {
                ...row,
                reply_text: result.replyText,
                admin_reply: result.adminReply,
                replied_at: result.repliedAt,
                replied_by: result.repliedBy,
              }
            : row
        )
      );

      setReplyDraftByReview((prev) => ({
        ...prev,
        [reviewId]: '',
      }));

      addNotification({
        message: t('review.success.replyDestination'),
        type: 'success',
        durationMs: 2600,
      });
    } catch (error: any) {
      console.warn('submitReplyToReview failed:', error);
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
    if (!destinationId) {
      console.error('[ReviewSubmit][Destination] missing destination_id');
      addNotification({
        message: t('review.validation.missingDestination'),
        type: 'error',
        durationMs: 3800,
      });
      return;
    }

    if (!currentUserId) {
      console.error('[ReviewSubmit][Destination] missing authenticated user session');
      promptLogin(t('review.validation.loginRequired'));
      return;
    }

    const rating = Number(draftRating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      console.error('[ReviewSubmit][Destination] invalid rating', { rating: draftRating });
      addNotification({
        message: t('review.validation.invalidRating'),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    const normalizedComment = draftComment.trim() ? draftComment.trim() : null;

    if (!isOnline) {
      try {
        if (draftPhotoAssets.length > 0) {
          addNotification({
            message: t('review.error.photoUploadRequiresInternet'),
            type: 'warning',
            durationMs: 3200,
          });
        }

        await offlineSyncService.enqueuePendingReview({
          user_id: currentUserId,
          destination_id: destinationId,
          rating,
          comment: normalizedComment,
          imageUrls: [],
        });

        setDraftComment('');
        setDraftRating(5);
        setDraftPhotoAssets([]);
        setIsWritingReview(false);

        addNotification({
          message: t('review.success.submitQueuedOffline'),
          type: 'warning',
          durationMs: 4200,
        });
      } catch (error: any) {
        const reason = String(error?.message ?? '').trim() || t('review.error.genericTryAgain');
        addNotification({
          message: t('review.error.submitFailed', { reason }),
          type: 'error',
          durationMs: 4200,
        });
      }
      return;
    }

    setSubmittingReview(true);
    try {
      const uploadedPhotoUrls: string[] = [];
      if (draftPhotoAssets.length > 0) {
        setUploadingDraftPhotos(true);
        try {
          for (const [index, asset] of draftPhotoAssets.slice(0, MAX_REVIEW_PHOTOS).entries()) {
            if (!asset.uri) continue;

            const uploadResult = await withTimeout(
              storageService.uploadReviewImage({
                uri: asset.uri,
                fileName: asset.fileName ?? `destination-review-${Date.now()}-${index + 1}.jpg`,
                contentType: asset.mimeType ?? undefined,
                reviewId: destinationId,
                scope: 'destination',
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
        destinationService.submitReview({
          destination_id: destinationId,
          rating,
          comment: normalizedComment,
          imageUrls: uploadedPhotoUrls,
        }),
        15000,
        t('review.error.submitFailed', { reason: t('review.error.uploadTimeout') })
      );

      try {
        await socialService.logActivity({
          actionType: 'review',
          targetId: destinationId,
          targetType: 'destination',
        });
      } catch (activityError: any) {
        console.warn('destination review activity log failed:', activityError?.message ?? activityError);
      }

      setDraftComment('');
      setDraftRating(5);
      setDraftPhotoAssets([]);
      setIsWritingReview(false);

      addNotification({
        message: t('review.success.submitDestination'),
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

      console.error('[ReviewSubmit][Destination] failed', {
        destinationId,
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
    destinationId,
    draftComment,
    draftPhotoAssets,
    draftRating,
    isOnline,
    promptLogin,
    refreshReviews,
    t,
  ]);

  const descriptionText = useMemo(() => {
    const raw =
      destinationRow?.description ??
      destinationRow?.details ??
      destinationRow?.summary ??
      destinationRow?.about ??
      null;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return t('destination.detail.fallbackDescription', { name });
  }, [destinationRow, name, t]);

  const addressText = useMemo(() => {
    const raw =
      destinationRow?.address ??
      destinationRow?.full_address ??
      destinationRow?.location ??
      destinationRow?.city ??
      params.location ??
      null;
    return raw ? String(raw) : '';
  }, [destinationRow, params.location]);

  const addressDisplayText = useMemo(() => {
    if (!destinationCoords || !addressText.trim()) return t('destination.detail.addressUpdating');
    return addressText.trim();
  }, [addressText, destinationCoords, t]);

  const amenities = useMemo(() => {
    return toAmenityList(destinationRow?.amenities ?? destinationRow?.features ?? destinationRow?.utilities);
  }, [destinationRow]);

  const destinationCategory = useMemo(() => toDestinationCategory(destinationRow), [destinationRow]);

  const toSuggestionPrice = useCallback(
    (value: number | null) => {
      if (value === null) return t('common.na');
      if (value <= 0) return t('common.free');
      return formatPricePerPerson(value);
    },
    [formatPricePerPerson, t]
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

  const fetchContextualRecommendations = useCallback(async () => {
    if (!destinationId) {
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
          kind: 'destination',
          id: destinationId,
          title: typeof destinationRow?.name === 'string' ? destinationRow.name : name,
          category: destinationCategory,
          location: typeof destinationRow?.location === 'string' ? destinationRow.location : (params.location ?? null),
        },
      });

      setRecommendations(result);
    } catch (err: any) {
      console.warn('fetchContextualRecommendations failed:', err?.message ?? err);
      setRecommendations(null);
    } finally {
      setLoadingRecommendations(false);
    }
  }, [
    destinationCategory,
    destinationId,
    destinationRow,
    effectiveRecommendationTimeOfDay,
    name,
    params.location,
  ]);

  useEffect(() => {
    void fetchContextualRecommendations();
  }, [fetchContextualRecommendations]);

  const renderReviewItem = useCallback(
    ({ item }: { item: ReviewRow }) => {
      const reviewerName = item.profiles?.full_name ?? t('review.card.anonymous');
      const avatarUrl = item.profiles?.avatar_url ?? null;
      const reviewId = String(item.id);
      const helpfulCount = typeof item.helpful_count === 'number' ? item.helpful_count : 0;
      const isHelpful = !!item.viewer_has_helpful_vote;
      const isHelpfulLoading = helpfulPendingId === reviewId;
      const reviewImageUrls = toReviewImageUrls(item.review_image_urls);
      const replyDraft = replyDraftByReview[reviewId] ?? '';
      const isReplyLoading = submittingReplyId === reviewId;
      const reviewerId = String(item.user_id ?? '').trim();
      const onPressReviewer = reviewerId
        ? () => {
            router.push(`/user/${reviewerId}` as any);
          }
        : undefined;

      return (
        <ReviewCard
          isDark={isDark}
          scale={s}
          reviewerName={reviewerName}
          avatarUrl={avatarUrl}
          rating={Number(item.rating) || 0}
          comment={item.comment ?? null}
          createdAt={item.created_at ?? null}
          imageUrls={reviewImageUrls}
          helpfulCount={helpfulCount}
          isHelpful={isHelpful}
          helpfulLoading={isHelpfulLoading}
          canReply={canReplyToReviews}
          replyText={item.admin_reply ?? item.reply_text ?? null}
          replyDraft={replyDraft}
          replyLoading={isReplyLoading}
          onChangeReplyDraft={(value) =>
            setReplyDraftByReview((prev) => ({
              ...prev,
              [reviewId]: value,
            }))
          }
          onSubmitReply={() => void submitReplyToReview(reviewId)}
          onToggleHelpful={() => void onToggleHelpfulReview(item)}
          onReport={() => openReportModal(reviewId)}
          onPressReviewer={onPressReviewer}
        />
      );
    },
    [
      canReplyToReviews,
      helpfulPendingId,
      isDark,
      onToggleHelpfulReview,
      openReportModal,
      replyDraftByReview,
      s,
      submitReplyToReview,
      submittingReplyId,
      t,
    ]
  );

  const listHeader = useMemo(() => {
    const contentTitleColor = isDark ? '#f1f5f9' : '#000000';
    const contentTextColor = isDark ? '#f1f5f9' : '#000000';
    const contentMutedColor = isDark ? '#94a3b8' : 'rgba(0,0,0,0.55)';

    const dbMapPreviewUrl = typeof (destinationRow as any)?.map_preview_url === 'string'
      ? String((destinationRow as any).map_preview_url).trim()
      : '';

    const staticMapsKey = (process.env as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
    const hasStaticMap = !!staticMapsKey && !!destinationCoords;
    const staticMapFallbackUri = hasStaticMap
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${destinationCoords!.latitude},${destinationCoords!.longitude}&zoom=14&size=640x360&scale=2&maptype=roadmap&markers=color:0x22d3ee%7C${destinationCoords!.latitude},${destinationCoords!.longitude}&key=${staticMapsKey}`
      : 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5?auto=format&fit=crop&w=1400&q=60';

    const staticMapUri = dbMapPreviewUrl || staticMapFallbackUri;

    return (
      <View>
        <View style={[styles.headerImageWrap, { height: headerHeight }]}>
          <ImageBackground source={{ uri: imageUrl }} style={styles.headerImage} resizeMode="cover">
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']}
              locations={[0, 0.45, 1]}
              style={[
                styles.headerGradient,
                {
                  top: 'auto',
                  bottom: 0,
                  height: Math.round(headerHeight * 0.62),
                },
              ]}
            >
              <View
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  paddingHorizontal: s(16),
                  paddingBottom: s(16),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s(12) }}>
                  <View style={{ flex: 1 }}>
                    <Text className="text-3xl font-extrabold text-white" numberOfLines={2}>
                      {name}
                    </Text>
                  </View>

                  <View style={[styles.ratingBadge, { paddingHorizontal: s(10), paddingVertical: s(6) }]}>
                    <MaterialCommunityIcons name="star" size={s(14)} color={ExploreEaseColors.primary} />
                    <Text style={[styles.ratingText, { fontSize: s(12) }]}>
                      {displayRating !== null ? displayRating.toFixed(1) : '—'}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: s(10), flexDirection: 'row', alignItems: 'baseline', gap: s(8) }}>
                  <Text
                    className="text-4xl font-extrabold"
                    style={{ color: ExploreEaseColors.primary }}
                    numberOfLines={1}
                  >
                    {String(displayPrice).replace(/\s*\/\s*người\s*$/i, '').trim()}
                  </Text>
                  <Text className="text-base font-semibold" style={{ color: 'rgba(226,232,240,0.92)' }}>
                    / người
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View
              style={[
                styles.headerTopRow,
                {
                  paddingHorizontal: s(16),
                  paddingTop: s(10),
                  justifyContent: 'space-between',
                },
              ]}
            >
              <Pressable
                onPress={() => {
                  if ((router as any)?.canGoBack?.()) {
                    router.back();
                    return;
                  }
                  router.replace('/(tabs)' as any);
                }}
                style={({ pressed }) => [
                  styles.iconPill,
                  { width: s(42), height: s(42), borderRadius: s(21) },
                  pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
                ]}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="chevron-left" size={s(24)} color={'white'} />
              </Pressable>

              <Pressable
                onPress={onToggleFavorite}
                disabled={loadingFavorite || togglingFavorite}
                style={({ pressed }) => [
                  styles.iconPill,
                  { width: s(42), height: s(42), borderRadius: s(21) },
                  pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
                  (loadingFavorite || togglingFavorite) ? { opacity: 0.7 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('destination.favorite.a11ySave')}
              >
                <MaterialCommunityIcons
                  name={isFavorited ? 'heart' : 'heart-outline'}
                  size={s(22)}
                  color={isFavorited ? ExploreEaseColors.primary : 'white'}
                />
              </Pressable>
            </View>
          </ImageBackground>
        </View>

        <View style={{ paddingHorizontal: s(16), marginTop: s(18) }}>
          <Text style={{ color: contentTitleColor, fontWeight: '900', fontSize: s(18) }}>{t('destination.detail.descriptionTitle')}</Text>

          {isUsingOfflineCache ? (
            <View style={{ marginTop: s(8), flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
              <MaterialCommunityIcons name="wifi-off" size={s(14)} color={ExploreEaseColors.primary} />
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(12) }}>
                {t('destination.offline.badge')}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              marginTop: s(10),
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: s(8),
              flexWrap: 'wrap',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(6),
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: s(10),
                paddingVertical: s(6),
                borderColor: isOpenNow ? 'rgba(34,197,94,0.42)' : 'rgba(239,68,68,0.40)',
                backgroundColor: isOpenNow ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)',
              }}
            >
              <MaterialCommunityIcons
                name={isOpenNow ? 'clock-check-outline' : 'clock-alert-outline'}
                size={s(14)}
                color={isOpenNow ? '#22c55e' : '#ef4444'}
              />
              <Text
                style={{
                  fontWeight: '900',
                  fontSize: s(12),
                  color: isOpenNow ? '#22c55e' : '#ef4444',
                }}
              >
                {isOpenNow ? t('destination.hours.openNow') : t('destination.hours.closed')}
              </Text>
            </View>

            <Text style={{ color: contentMutedColor, fontWeight: '700', fontSize: s(12) }}>
              {t('destination.hours.title')}: {t('destination.hours.defaultRange')}
            </Text>
          </View>

          <Text
            style={{
              color: contentTextColor,
              fontSize: s(14),
              lineHeight: s(22),
              marginTop: s(10),
              fontWeight: '600',
            }}
          >
            {descriptionText}
          </Text>

          {amenities.length ? (
            <View style={{ marginTop: s(16) }}>
              <Text style={{ color: contentTitleColor, fontWeight: '900', fontSize: s(18) }}>{t('destination.detail.amenitiesTitle')}</Text>
              <Text
                style={{
                  color: contentTextColor,
                  fontSize: s(14),
                  lineHeight: s(22),
                  marginTop: s(10),
                  fontWeight: '600',
                }}
              >
                {amenities.map((a) => `• ${a}`).join('\n')}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: s(16), marginTop: s(18) }}>
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
            subtitle={t('recommendation.suggestions.subtitleDestination')}
          />
        </View>

        <View style={{ paddingHorizontal: s(16), marginTop: s(18) }}>
          <View style={[styles.locationHeaderRow, { marginBottom: s(12) }]}>
            <Text style={{ color: contentTitleColor, fontWeight: '900', fontSize: s(18) }}>{t('destination.detail.locationTitle')}</Text>
            {isLoadingLocation ? (
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(13) }}>{t('destination.detail.locationLoading')}</Text>
            ) : distanceText ? (
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(13) }}>{t('destination.detail.distanceFromYou', { distance: distanceText })}</Text>
            ) : locationErrorMsg ? (
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(13) }}>{t('destination.detail.enableGpsDistance')}</Text>
            ) : null}
          </View>

          <View
            style={{
              borderRadius: s(18),
              width: '70%',
              alignSelf: 'center',
              padding: s(16),
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            }}
          >
            <Pressable
              disabled={!destinationCoords}
              onPress={() => {
                if (!destinationCoords) return;
                void openGoogleMaps(destinationCoords);
              }}
              style={({ pressed, hovered }) => [
                {
                  width: '100%',
                  borderRadius: s(24),
                  overflow: 'hidden',
                  height: s(198),
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
                  ...(Platform.OS === 'web'
                    ? { boxShadow: `0px 8px 14px rgba(0,0,0,${isDark ? 0.22 : 0.10})` }
                    : {
                        shadowColor: '#000',
                        shadowOpacity: isDark ? 0.22 : 0.1,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 6,
                      }),
                },
                (Platform.OS === 'web' && hovered) ? { opacity: 0.98 } : null,
                pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null,
                !destinationCoords ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              <ImageBackground source={{ uri: staticMapUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover">
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)', 'rgba(0,0,0,0.86)']}
                  locations={[0, 0.55, 1]}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' }}
                />

                <View style={{ position: 'absolute', left: s(12), right: s(12), bottom: s(10) }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: s(13) }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={{ color: 'rgba(226,232,240,0.92)', fontWeight: '700', fontSize: s(11), marginTop: s(2) }}>
                    {destinationCoords ? t('destination.detail.openInMaps') : t('destination.detail.locationUpdating')}
                  </Text>
                </View>

                {loadingDestination ? (
                  <View style={{ position: 'absolute', left: s(10), top: s(10) }}>
                    <BlurView
                      intensity={Platform.OS === 'web' ? 16 : 22}
                      tint="dark"
                      style={{
                        paddingHorizontal: s(10),
                        paddingVertical: s(6),
                        borderRadius: 999,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.12)',
                        backgroundColor: 'rgba(0,0,0,0.26)',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: s(11) }}>{t('destination.detail.loading')}</Text>
                    </BlurView>
                  </View>
                ) : null}
              </ImageBackground>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginTop: s(12) }}>
              <MaterialCommunityIcons name="map-marker" size={s(16)} color={ExploreEaseColors.primary} />
              <Text
                style={{
                  color: contentTextColor,
                  fontWeight: '800',
                  fontSize: s(14),
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {addressDisplayText}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: s(16), marginTop: s(18) }}>
          <View style={styles.reviewsHeaderRow}>
            <View style={{ flex: 1, gap: s(4) }}>
              <Text style={[styles.reviewsTitle, { fontSize: s(18), color: contentTitleColor }]}>{t('review.section.title')}</Text>
              <Text
                style={{
                  color: contentMutedColor,
                  fontWeight: '800',
                  fontSize: s(13),
                }}
                numberOfLines={1}
              >
                {t('review.section.summary', {
                  rating: averageRating !== null ? averageRating.toFixed(1) : '—',
                  count: reviewsTotalCount ?? reviews.length,
                })}
              </Text>
            </View>
            <Pressable
              onPress={onPressWriteReview}
              style={({ pressed, hovered }) => [
                styles.writeReviewBtn,
                { paddingHorizontal: s(12), height: s(36), borderRadius: s(12) },
                (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                pressed ? { opacity: 0.86 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.writeReviewText, { fontSize: s(13) }]}>
                {isWritingReview ? t('review.section.cancel') : t('review.section.write')}
              </Text>
            </Pressable>
          </View>

          <Text style={{ marginTop: s(8), color: contentMutedColor, fontWeight: '800', fontSize: s(12) }}>
            {t('review.distribution.title')}
          </Text>

          <RatingDistribution entries={ratingDistribution} isDark={isDark} scale={s} />

          <View style={[styles.reviewSortRow, { marginTop: s(10), columnGap: s(8), rowGap: s(8) }]}>
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
                      minHeight: s(34),
                      borderRadius: 999,
                      paddingHorizontal: s(12),
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
                      fontSize: s(12),
                      color: active ? ExploreEaseColors.primary : contentMutedColor,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loadingReviews ? (
            <View style={[styles.loadingRow, { marginTop: s(10) }]}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
              <Text style={[styles.loadingText, { fontSize: s(13), color: contentMutedColor }]}>{t('review.section.loading')}</Text>
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

        <View style={{ height: s(16) }} />
      </View>
    );
  }, [
    amenities,
    addressDisplayText,
    averageRating,
    descriptionText,
    displayRating,
    displayPrice,
    distanceText,
    destinationCoords,
    destinationRow,
    isDark,
    isFavorited,
    isLoadingLocation,
    locationErrorMsg,
    loadingFavorite,
    draftComment,
    draftPhotoAssets,
    draftRating,
    headerHeight,
    imageUrl,
    isUsingOfflineCache,
    isOpenNow,
    isWritingReview,
    loadingReviews,
    pickReviewPhotos,
    ratingDistribution,
    removeDraftPhoto,
    reviewSort,
    reviews.length,
    reviewsTotalCount,
    loadingDestination,
    name,
    onToggleFavorite,
    onPressWriteReview,
    onSubmitReview,
    onPressRecommendationItem,
    recommendationItems,
    loadingRecommendations,
    activeRecommendationTimeOfDay,
    recommendations,
    s,
    setTimeOfDayPreference,
    setReviewSort,
    submittingReview,
    timeOfDayPreference,
    togglingFavorite,
    t,
    uploadingDraftPhotos,
  ]);

  const pageBg = isDark ? ExploreEaseColors.background : '#f8fafc';

  const footerFg = isDark ? 'rgba(226,232,240,0.96)' : '#020617';
  const footerMuted = isDark ? 'rgba(148,163,184,0.95)' : '#475569';
  const footerTint: 'light' | 'dark' = isDark ? 'dark' : 'light';
  const footerSurface = isDark ? 'rgba(2,6,23,0.62)' : 'rgba(255,255,255,0.78)';
  const footerBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)';
  const footerBottomPad = Math.max(insets.bottom, s(10));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.root, { backgroundColor: pageBg }]}>
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
                  {t('destination.trip.addToPlanTitle')}
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
                  accessibilityLabel={t('destination.trip.close')}
                >
                  <MaterialCommunityIcons name="close" size={18} color={isDark ? '#ffffff' : '#0f172a'} />
                </Pressable>
              </View>

              {loadingTrips ? (
                <View style={{ paddingTop: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color={ExploreEaseColors.primary} />
                  <Text style={{ fontWeight: '700', color: isDark ? 'rgba(148,163,184,0.95)' : 'rgba(15,23,42,0.55)' }}>
                    {t('trips.loadingTitle')}
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
                      {t('destination.trip.pickDayForDestination')}
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
                            {t('trips.dayLabel', { day: d })}
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
                      <Text style={{ fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>{t('destination.trip.changeTrip')}</Text>
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
                      accessibilityLabel={t('destination.trip.confirmAdd')}
                    >
                      {savingToTrip ? (
                        <ActivityIndicator color="#001018" />
                      ) : (
                        <MaterialCommunityIcons name="check" size={18} color="#001018" />
                      )}
                      <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>{t('destination.trip.confirmAdd')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {t('destination.trip.pickTrip')}
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
                            {(trip.destination ?? '').trim() ? `${trip.destination} • ` : ''}{t('trips.card.days', { count: daysCount })}
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
                {t('destination.trip.noTripsTitle')}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b', lineHeight: 18 }}>
                {t('destination.trip.noTripsMessage')}
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
                accessibilityLabel={t('destination.trip.createNow')}
              >
                {creatingTripAndAdding ? (
                  <ActivityIndicator color="#001018" />
                ) : (
                  <MaterialCommunityIcons name="plus" size={18} color="#001018" />
                )}
                <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>{t('destination.trip.createNow')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <ModerationModal
          visible={reportModalVisible}
          isDark={isDark}
          reason={reportReason}
          submitting={submittingReport}
          onClose={() => setReportModalVisible(false)}
          onChangeReason={setReportReason}
          onSubmit={() => void handleReportReview()}
        />

        <FlatList
          ref={listRef}
          data={sortedReviews}
          renderItem={renderReviewItem}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: s(190) + footerBottomPad, rowGap: s(12) }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          refreshing={loadingReviews}
          onRefresh={() => void refreshReviews()}
          onEndReachedThreshold={0.6}
          onEndReached={() => void loadMoreReviews()}
          ListFooterComponent={
            loadingMoreReviews ? (
              <View style={{ paddingVertical: s(14), alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
              </View>
            ) : null
          }
        />

        <View style={[styles.footerWrap, { paddingHorizontal: s(16) }]}>
          <View style={[styles.footerShadow, { borderTopLeftRadius: 35, borderTopRightRadius: 35 }]}>
            <View
              style={[
                styles.footerClip,
                {
                  borderTopLeftRadius: 35,
                  borderTopRightRadius: 35,
                  backgroundColor: footerSurface,
                  borderColor: footerBorder,
                },
              ]}
            >
              <BlurView
                intensity={Platform.OS === 'web' ? 12 : 20}
                tint={footerTint}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />

              <View
                style={{
                  paddingTop: s(24),
                  paddingHorizontal: s(24),
                  paddingBottom: s(40) + insets.bottom,
                  flexDirection: isCompactFooterLayout ? 'column' : 'row',
                  alignItems: isCompactFooterLayout ? 'stretch' : 'center',
                  justifyContent: 'space-between',
                  gap: s(14),
                }}
              >
                <View style={{ flex: isCompactFooterLayout ? 0 : 1, minWidth: isCompactFooterLayout ? 0 : s(120) }}>
                  <Text style={{ color: footerMuted, fontWeight: '900', fontSize: s(12) }}>{t('destination.detail.priceLabel')}</Text>
                  <Text
                    style={{ color: footerFg, fontWeight: '900', fontSize: s(18), marginTop: s(4) }}
                    numberOfLines={1}
                  >
                    {displayPrice}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: isCompactFooterLayout ? 'space-between' : 'flex-end',
                    gap: s(10),
                    flexWrap: 'wrap',
                  }}
                >
                  <Pressable
                    onPress={handleAddToPlan}
                    style={({ pressed, hovered }) => [
                      styles.reviewFooterBtn,
                      {
                        height: s(52),
                        paddingHorizontal: s(14),
                        borderRadius: 999,
                        borderColor: footerBorder,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(8),
                        flexShrink: 1,
                        flexGrow: isCompactFooterLayout ? 1 : 0,
                        minWidth: isCompactFooterLayout ? 0 : s(130),
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86, transform: [{ scale: 0.95 }] } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('destination.trip.addToPlanTitle')}
                  >
                    <MaterialCommunityIcons name="playlist-plus" size={s(18)} color={ExploreEaseColors.primary} />
                    <Text style={{ color: footerFg, fontWeight: '900', fontSize: s(13), flexShrink: 1 }} numberOfLines={1}>
                      {t('destination.trip.addToPlanTitle')}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      releaseOverlayTriggerFocus();
                      setQrShareVisible(true);
                    }}
                    style={({ pressed, hovered }) => [
                      styles.reviewFooterBtn,
                      {
                        height: s(52),
                        paddingHorizontal: s(14),
                        borderRadius: 999,
                        borderColor: footerBorder,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(8),
                        flexShrink: 1,
                        flexGrow: isCompactFooterLayout ? 1 : 0,
                        minWidth: isCompactFooterLayout ? 0 : s(126),
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86, transform: [{ scale: 0.95 }] } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Chia sẻ QR địa điểm"
                  >
                    <MaterialCommunityIcons name="qrcode" size={s(18)} color={ExploreEaseColors.primary} />
                    <Text style={{ color: footerFg, fontWeight: '900', fontSize: s(13), flexShrink: 1 }} numberOfLines={1}>
                      Chia sẻ QR
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (!destinationCoords) {
                        Alert.alert(t('destination.directions.title'), t('destination.directions.missingCoords'));
                        return;
                      }
                      void openGoogleMaps(destinationCoords);
                    }}
                    style={({ pressed, hovered }) => [
                      styles.directionsBtn,
                      {
                        borderRadius: 999,
                        flexShrink: 1,
                        flexGrow: isCompactFooterLayout ? 1 : 0,
                        minWidth: isCompactFooterLayout ? 0 : s(148),
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.98 } : null,
                      pressed ? { opacity: 0.9, transform: [{ scale: 0.95 }] } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('destination.directions.title')}
                  >
                    <LinearGradient
                      colors={[ExploreEaseColors.primary, 'rgba(34, 211, 238, 0.78)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        paddingHorizontal: isCompactFooterLayout ? s(16) : s(24),
                        paddingVertical: s(16),
                        borderRadius: 999,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                        <MaterialCommunityIcons name="map" size={s(18)} color={ExploreEaseColors.background} />
                        <Text style={{ color: ExploreEaseColors.background, fontWeight: '900', fontSize: s(isCompactFooterLayout ? 13 : 15) }} numberOfLines={1}>
                          {t('destination.directions.title')}
                        </Text>
                      </View>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Add-to-trip bottom sheet (mount only when open to avoid web overlays blocking clicks) */}
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
            <View className="flex-1 px-5 pt-2" style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>
                  {t('destination.trip.addToPlanTitle')}
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
                  accessibilityLabel={t('destination.trip.close')}
                >
                  <MaterialCommunityIcons name="close" size={18} color={isDark ? '#ffffff' : '#0f172a'} />
                </Pressable>
              </View>

              {loadingTrips ? (
                <View style={{ paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color={ExploreEaseColors.primary} />
                  <Text style={{ fontWeight: '700', color: isDark ? 'rgba(148,163,184,0.95)' : 'rgba(15,23,42,0.55)' }}>
                    {t('trips.loadingTitle')}
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
                      {t('destination.trip.noTripsNoneYet')}
                    </Text>
                    <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                      {t('destination.trip.noTripsCreateHint')}
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
                    accessibilityLabel={t('trips.createNew')}
                  >
                    {creatingTrip ? (
                      <ActivityIndicator color="#001018" />
                    ) : (
                      <MaterialCommunityIcons name="plus" size={18} color="#001018" />
                    )}
                    <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>
                      {t('trips.createNew')}
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
                      {t('destination.trip.pickDayForDestination')}
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
                            {t('trips.dayLabel', { day: d })}
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
                      <Text style={{ fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>{t('destination.trip.changeTrip')}</Text>
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
                      accessibilityLabel={t('destination.trip.confirmAdd')}
                    >
                      {savingToTrip ? (
                        <ActivityIndicator color="#001018" />
                      ) : (
                        <MaterialCommunityIcons name="check" size={18} color="#001018" />
                      )}
                      <Text style={{ color: '#001018', fontWeight: '900', fontSize: 14 }}>{t('destination.trip.confirmAdd')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {t('destination.trip.pickTrip')}
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
                            {(trip.destination ?? '').trim() ? `${trip.destination} • ` : ''}{t('trips.card.days', { count: daysCount })}
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

        <QrShareModal
          visible={qrShareVisible}
          title="Chia sẻ QR địa điểm"
          subtitle="Quét mã để mở nhanh trang địa điểm này trên ExploreEase."
          qrValue={qrSharePayload.qrValue}
          shareMessage={qrSharePayload.shareMessage}
          onClose={() => setQrShareVisible(false)}
        />

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ExploreEaseColors.background },
  root: { flex: 1, backgroundColor: ExploreEaseColors.background },

  headerImageWrap: { width: '100%' },
  headerImage: { flex: 1 },
  headerGradient: { ...StyleSheet.absoluteFillObject },

  headerTopRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPill: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 211, 238, 0.20)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.26)',
  },
  ratingText: { color: ExploreEaseColors.primary, fontWeight: '800' },

  locationHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

  reviewsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewsTitle: { fontWeight: '900' },
  writeReviewBtn: {
    backgroundColor: 'rgba(34, 211, 238, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  writeReviewText: { color: ExploreEaseColors.primary, fontWeight: '900' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontWeight: '700' },

  reviewSortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  reviewSortChip: {
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  footerWrap: {
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footerShadow: {
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px -10px 26px rgba(0,0,0,0.18)' }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: -10 },
          elevation: 20,
        }),
  },
  footerClip: {
    overflow: 'hidden',
    borderTopWidth: 1,
  },
  reviewFooterBtn: {
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionsBtn: {
    overflow: 'hidden',
  },
});
