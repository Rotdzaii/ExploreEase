import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useLocation } from '@/hooks/useLocation';
import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { calculateAverageRating, destinationService, type ReviewRow } from '@/src/services/destinationService';
import { favoritesService } from '@/src/services/favoritesService';
import { itineraryService } from '@/src/services/itineraryService';
import { supabase } from '@/src/services/supabase';
import { tripService, type TripRow } from '@/src/services/tripService';
import { useNotificationStore } from '@/src/store/useNotificationStore';
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

export default function DestinationDetailScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { isDark } = useTheme();
  const { formatPricePerPerson } = useCurrency();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<DetailParams>();

  const listRef = useRef<FlatList<ReviewRow>>(null);

  const scale = useMemo(() => clamp(screenWidth / 390, 0.86, 1.18), [screenWidth]);
  const s = useCallback((value: number) => Math.round(value * scale), [scale]);

  const name = params.name ? String(params.name) : 'Điểm đến';
  const price = params.price ? String(params.price) : '';

  const destinationId = params.id ? String(params.id) : '';

  // Injected Logs: params snapshot
  useEffect(() => {
    console.log('[AddToPlan] destination_id:', destinationId, 'name:', name, 'params:', params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId]);

  const { location, errorMsg: locationErrorMsg, isLoading: isLoadingLocation } = useLocation();
  const [destinationCoords, setDestinationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingDestination, setLoadingDestination] = useState(false);
  const [destinationPrice, setDestinationPrice] = useState<unknown>(null);
  const [destinationRow, setDestinationRow] = useState<any | null>(null);

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

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [reviewsTotalCount, setReviewsTotalCount] = useState<number | null>(null);
  const [hasMoreReviews, setHasMoreReviews] = useState(true);

  const [isWritingReview, setIsWritingReview] = useState(false);
  const [draftRating, setDraftRating] = useState<number>(5);
  const [draftComment, setDraftComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

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

  const addNotification = useNotificationStore((s) => s.addNotification);

  const REVIEWS_PAGE_SIZE = 10;

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

      // Injected Logs: data flow
      console.log('[AddToPlan] Trips fetched (rows):', rows);

      setTrips(rows ?? []);
      return (rows ?? []) as TripRow[];
    } catch (err: any) {
      console.log('[AddToPlan] Trips fetched (rows):', null, 'Error:', err);
      console.warn('loadTrips failed:', err?.message ?? err);
      setTrips([]);
      return [];
    } finally {
      setLoadingTrips(false);
    }
  }, []);

  const ensureLoggedIn = useCallback(async (): Promise<boolean> => {
    try {
      // Injected Logs: auth
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Current User ID:', sessionData?.session?.user?.id);

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (data.user?.id) return true;
    } catch (err: any) {
      console.warn('ensureLoggedIn failed:', err?.message ?? err);
    }

    Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập để thêm địa điểm vào kế hoạch.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng nhập', onPress: () => router.push('/login' as any) },
    ]);
    return false;
  }, []);

  const openAddToTrip = useCallback(() => {
    // Injected Logs: UI state
    console.log('[AddToPlan] openAddToTrip called. isAddToTripOpen -> true');
    setSelectedTripRow(null);
    setSelectedTripDay(1);
    setIsAddToTripOpen(true);
  }, []);

  const closeAddToTrip = useCallback(() => {
    // Injected Logs: UI state
    console.log('[AddToPlan] closeAddToTrip called. isAddToTripOpen -> false');
    setIsAddToTripOpen(false);
  }, []);

  const closeTripPicker = useCallback(() => {
    setIsTripPickerModalOpen(false);
    setIsAddToTripOpen(false);
    setSelectedTripRow(null);
    setSelectedTripDay(1);
  }, []);

  // Injected Logs: UI state (source of truth)
  useEffect(() => {
    console.log('[AddToPlan] BottomSheet visible:', isAddToTripOpen);
  }, [isAddToTripOpen]);

  const selectedTripDaysCount = useMemo(() => {
    if (!selectedTripRow) return 1;
    const start = parseDateOnly(selectedTripRow.start_date ?? null);
    const end = parseDateOnly(selectedTripRow.end_date ?? null);
    return toDaysCount(start, end);
  }, [selectedTripRow]);

  const createTrip = useCallback(async () => {
    if (creatingTrip) return;

    // Injected Logs: create trip action
    console.log('[AddToPlan] createTrip pressed', { name, destination_id: destinationId });

    const ok = await ensureLoggedIn();
    if (!ok) return;

    setCreatingTrip(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      console.log('[AddToPlan] createTrip payload', {
        name: `Chuyến đi tới ${name}`,
        destination: name,
        start_date: todayIso,
        end_date: todayIso,
      });
      const newTrip = await tripService.createTripForCurrentUser({
        name: `Chuyến đi tới ${name}`,
        destination: name,
        cover: imageUrl,
        start_date: todayIso,
        end_date: todayIso,
      });

      console.log('[AddToPlan] createTrip success:', newTrip);

      setTrips((prev) => [newTrip, ...(prev ?? [])]);
      setSelectedTripRow(newTrip);
      setSelectedTripDay(1);
    } catch (err: any) {
      console.log('[AddToPlan] createTrip error:', err);
      console.warn('createTrip failed:', err?.message ?? err);
      Alert.alert('Không thể tạo chuyến đi', 'Vui lòng thử lại sau.');
    } finally {
      setCreatingTrip(false);
    }
  }, [creatingTrip, destinationId, ensureLoggedIn, imageUrl, name]);

  const createTripAndAutoAdd = useCallback(async () => {
    if (creatingTripAndAdding) return;
    if (!destinationId) {
      Alert.alert('Không thể thêm vào kế hoạch', 'Thiếu destination_id.');
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
        name: `Chuyến đi tới ${name}`,
        destination: name,
        cover: imageUrl,
        start_date: todayIso,
        end_date: todayIso,
      });

      await itineraryService.addItemToTrip({
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
        message: 'Đã thêm vào kế hoạch.',
        type: 'success',
        durationMs: 3000,
      });
    } catch (err: any) {
      console.warn('createTripAndAutoAdd failed:', err?.message ?? err);
      Alert.alert('Không thể thêm vào kế hoạch', 'Vui lòng thử lại sau.');
    } finally {
      setCreatingTripAndAdding(false);
    }
  }, [addNotification, creatingTripAndAdding, destinationCoords, destinationId, destinationRow, ensureLoggedIn, imageUrl, name]);

  const addToTrip = useCallback(async () => {
    // Injected Logs: params + state at action time
    console.log('[AddToPlan] addToTrip pressed', {
      destination_id: destinationId,
      destinationName: name,
      selectedTripId: selectedTripRow?.id,
      selectedTripDay,
      savingToTrip,
    });

    if (!selectedTripRow || savingToTrip) return;
    if (!destinationId) {
      Alert.alert('Không thể thêm vào kế hoạch', 'Thiếu destination_id.');
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
      await itineraryService.addItemToTrip({
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
        message: 'Đã thêm vào kế hoạch.',
        type: 'success',
        durationMs: 3000,
      });
    } catch (err: any) {
      console.warn('addToTrip failed:', err?.message ?? err);
      Alert.alert('Không thể thêm vào kế hoạch', 'Vui lòng thử lại sau.');
    } finally {
      setSavingToTrip(false);
    }
  }, [addNotification, closeTripPicker, destinationCoords, destinationId, destinationRow, ensureLoggedIn, imageUrl, name, savingToTrip, selectedTripDay, selectedTripRow]);

  const handleAddToPlan = useCallback(() => {
    // Instant check (debug): if you don't see this, onPress is not wired.
    console.log('Button Pressed!');

    void (async () => {
      const ok = await ensureLoggedIn();
      if (!ok) return;

      // Fetch trips first, then branch.
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

      // No trips: show modal with Create Now.
      setIsNoTripsModalOpen(true);
    })();
  }, [ensureLoggedIn, loadTrips, openAddToTrip]);

  const fetchDestinationCoords = useCallback(async () => {
    if (!destinationId) return;
    setLoadingDestination(true);
    try {
      const row = await destinationService.getDestinationById(destinationId);
      setDestinationRow(row ?? null);
      setDestinationCoords(extractCoords(row));
      setDestinationPrice((row as any)?.price ?? null);
    } catch (error) {
      console.warn('fetchDestinationCoords failed:', error);
      setDestinationRow(null);
      setDestinationCoords(null);
      setDestinationPrice(null);
    } finally {
      setLoadingDestination(false);
    }
  }, [destinationId]);

  useEffect(() => {
    void refreshReviews();
  }, [refreshReviews]);

  useEffect(() => {
    void fetchDestinationCoords();
  }, [fetchDestinationCoords]);

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
    } catch (err) {
      console.warn('toggle favorite failed:', err);
      setIsFavorited(!next);
      const msg = String((err as any)?.message ?? '').toLowerCase();
      if (msg.includes('favorites table is missing')) {
        Alert.alert('Chưa bật tính năng yêu thích', 'Server chưa có bảng favorites. Hãy chạy migration favorites trên Supabase rồi thử lại.');
      } else {
        Alert.alert('Không thể lưu địa điểm', 'Vui lòng đăng nhập và thử lại.');
      }
    } finally {
      setTogglingFavorite(false);
    }
  }, [destinationId, isFavorited, togglingFavorite]);

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

  const onPressWriteReview = useCallback(() => {
    setIsWritingReview((prev) => !prev);
  }, []);

  const onSubmitReview = useCallback(async () => {
    if (!destinationId) return;

    const rating = Number(draftRating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;

    setSubmittingReview(true);
    try {
      await destinationService.submitReview({
        destination_id: destinationId,
        rating,
        comment: draftComment.trim() ? draftComment.trim() : null,
      });

      setDraftComment('');
      setDraftRating(5);
      setIsWritingReview(false);
      await refreshReviews();
    } catch (error) {
      console.warn('submitReview failed:', error);
    } finally {
      setSubmittingReview(false);
    }
  }, [destinationId, draftComment, draftRating, refreshReviews]);

  const descriptionText = useMemo(() => {
    const raw =
      destinationRow?.description ??
      destinationRow?.details ??
      destinationRow?.summary ??
      destinationRow?.about ??
      null;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return `Khám phá ${name} với những trải nghiệm đáng nhớ, khung cảnh ấn tượng và dịch vụ chất lượng.`;
  }, [destinationRow, name]);

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
    if (!destinationCoords || !addressText.trim()) return 'Đang cập nhật địa chỉ...';
    return addressText.trim();
  }, [addressText, destinationCoords]);

  const amenities = useMemo(() => {
    return toAmenityList(destinationRow?.amenities ?? destinationRow?.features ?? destinationRow?.utilities);
  }, [destinationRow]);

  const renderStars = useCallback(
    (value: number, size: number) => (
      <View style={styles.starsRow}>
        {Array.from({ length: 5 }).map((_, idx) => {
          const filled = idx < value;
          return (
            <MaterialCommunityIcons
              key={idx}
              name={filled ? 'star' : 'star-outline'}
              size={size}
              color={ExploreEaseColors.primary}
            />
          );
        })}
      </View>
    ),
    []
  );

  const renderReviewItem = useCallback(
    ({ item }: { item: ReviewRow }) => {
      const reviewerName = item.profiles?.full_name ?? 'Ẩn danh';
      const avatarUrl = item.profiles?.avatar_url ?? null;

      const cardBg = isDark ? 'rgba(255,255,255,0.92)' : '#ffffff';
      const cardBorder = 'rgba(15, 23, 42, 0.10)';

      return (
        <View
          style={[
            styles.reviewCard,
            {
              borderRadius: s(16),
              padding: s(14),
              marginHorizontal: s(16),
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}
        >
          <View style={styles.reviewTopRow}>
            <View
              style={[
                styles.avatarWrap,
                {
                  width: s(40),
                  height: s(40),
                  borderRadius: s(20),
                  borderColor: 'rgba(15, 23, 42, 0.10)',
                  backgroundColor: 'rgba(15, 23, 42, 0.04)',
                },
              ]}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: s(20) }} />
              ) : (
                <View style={{ flex: 1, borderRadius: s(20), backgroundColor: 'rgba(15, 23, 42, 0.10)' }} />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text className="text-slate-950" style={{ fontWeight: '900', fontSize: s(14) }} numberOfLines={1}>
                {reviewerName}
              </Text>
              <View style={styles.reviewStarsRow}>
                {renderStars(Math.round(item.rating), s(14))}
                <Text className="text-slate-950" style={{ fontWeight: '800', fontSize: s(12) }}>
                  {Number(item.rating).toFixed(1)}
                </Text>
              </View>
            </View>
          </View>

          {item.comment ? (
            <Text className="text-slate-950" style={{ fontWeight: '700', fontSize: s(13), marginTop: s(10), lineHeight: s(18) }}>
              {item.comment}
            </Text>
          ) : (
            <Text className="text-slate-950" style={{ fontWeight: '700', fontSize: s(13), marginTop: s(10), opacity: 0.6 }}>
              (Không có bình luận)
            </Text>
          )}
        </View>
      );
    },
    [isDark, renderStars, s]
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
                accessibilityLabel="Lưu địa điểm"
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
          <Text style={{ color: contentTitleColor, fontWeight: '900', fontSize: s(18) }}>Mô tả</Text>
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
              <Text style={{ color: contentTitleColor, fontWeight: '900', fontSize: s(18) }}>Tiện ích</Text>
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
          <View style={[styles.locationHeaderRow, { marginBottom: s(12) }]}>
            <Text style={{ color: contentTitleColor, fontWeight: '900', fontSize: s(18) }}>Vị trí</Text>
            {isLoadingLocation ? (
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(13) }}>Đang lấy vị trí...</Text>
            ) : distanceText ? (
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(13) }}>Cách bạn {distanceText}</Text>
            ) : locationErrorMsg ? (
              <Text style={{ color: contentMutedColor, fontWeight: '800', fontSize: s(13) }}>Bật GPS để xem khoảng cách</Text>
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
                    {destinationCoords ? 'Nhấn để mở Google Maps' : 'Đang cập nhật vị trí...'}
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
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: s(11) }}>Đang tải...</Text>
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
              <Text style={[styles.reviewsTitle, { fontSize: s(18), color: contentTitleColor }]}>Đánh giá</Text>
              <Text
                style={{
                  color: contentMutedColor,
                  fontWeight: '800',
                  fontSize: s(13),
                }}
                numberOfLines={1}
              >
                ⭐ {averageRating !== null ? averageRating.toFixed(1) : '—'}/5 • {reviewsTotalCount ?? reviews.length}{' '}đánh giá
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
                {isWritingReview ? 'Hủy' : 'Viết đánh giá'}
              </Text>
            </Pressable>
          </View>

          {loadingReviews ? (
            <View style={[styles.loadingRow, { marginTop: s(10) }]}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
              <Text style={[styles.loadingText, { fontSize: s(13), color: contentMutedColor }]}>Đang tải đánh giá...</Text>
            </View>
          ) : null}

          {isWritingReview ? (
            <BlurView intensity={Platform.OS === 'web' ? 16 : 24} tint="dark" style={[styles.writeReviewCard, { borderRadius: s(16), padding: s(14), marginTop: s(12) }]}>
              <Text style={[styles.inputLabel, { fontSize: s(12), color: contentMutedColor }]}>Số sao</Text>
              <View style={[styles.pickStarsRow, { marginTop: s(8) }]}>
                {Array.from({ length: 5 }).map((_, idx) => {
                  const value = idx + 1;
                  const filled = value <= draftRating;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setDraftRating(value)}
                      style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
                      accessibilityRole="button"
                    >
                      <MaterialCommunityIcons
                        name={filled ? 'star' : 'star-outline'}
                        size={s(22)}
                        color={ExploreEaseColors.primary}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.inputLabel, { fontSize: s(12), marginTop: s(12), color: contentMutedColor }]}>Nhận xét</Text>
              <TextInput
                value={draftComment}
                onChangeText={setDraftComment}
                placeholder="Chia sẻ trải nghiệm của bạn..."
                placeholderTextColor={isDark ? 'rgba(148,163,184,0.65)' : 'rgba(71,85,105,0.55)'}
                multiline
                style={[
                  styles.commentInput,
                  {
                    minHeight: s(88),
                    borderRadius: s(14),
                    padding: s(12),
                    fontSize: s(13),
                    color: isDark ? '#ffffff' : '#0f172a',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
                    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
                  },
                ]}
              />

              <Pressable
                onPress={onSubmitReview}
                disabled={submittingReview}
                style={({ pressed, hovered }) => [
                  styles.submitBtn,
                  { height: s(44), borderRadius: s(14), marginTop: s(12) },
                  (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                  pressed ? { opacity: 0.86 } : null,
                  submittingReview ? { opacity: 0.7 } : null,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.submitText, { fontSize: s(14) }]}>
                  {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
                </Text>
              </Pressable>
            </BlurView>
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
    draftRating,
    headerHeight,
    imageUrl,
    isWritingReview,
    loadingReviews,
    reviews.length,
    reviewsTotalCount,
    loadingDestination,
    name,
    onToggleFavorite,
    onPressWriteReview,
    onSubmitReview,
    s,
    submittingReview,
    togglingFavorite,
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
                      Chọn ngày để thêm điểm đến
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
                    {trips.map((t) => {
                      const start = parseDateOnly(t.start_date ?? null);
                      const end = parseDateOnly(t.end_date ?? null);
                      const daysCount = toDaysCount(start, end);
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => {
                            setSelectedTripRow(t);
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
                            {t.name}
                          </Text>
                          <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }} numberOfLines={2}>
                            {(t.destination ?? '').trim() ? `${t.destination} • ` : ''}{daysCount} ngày
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
                Bạn cần tạo ít nhất một chuyến đi trước khi thêm địa điểm này.
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

        <FlatList
          ref={listRef}
          data={reviews}
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
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: s(14),
                }}
              >
                <View style={{ flex: 1, minWidth: s(120) }}>
                  <Text style={{ color: footerMuted, fontWeight: '900', fontSize: s(12) }}>Giá</Text>
                  <Text
                    style={{ color: footerFg, fontWeight: '900', fontSize: s(18), marginTop: s(4) }}
                    numberOfLines={1}
                  >
                    {displayPrice}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
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
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                      pressed ? { opacity: 0.86, transform: [{ scale: 0.95 }] } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Thêm vào kế hoạch"
                  >
                    <MaterialCommunityIcons name="playlist-plus" size={s(18)} color={ExploreEaseColors.primary} />
                    <Text style={{ color: footerFg, fontWeight: '900', fontSize: s(13) }} numberOfLines={1}>
                      Thêm vào kế hoạch
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (!destinationCoords) {
                        Alert.alert('Chỉ đường', 'Địa điểm này chưa có toạ độ để mở bản đồ.');
                        return;
                      }
                      void openGoogleMaps(destinationCoords);
                    }}
                    style={({ pressed, hovered }) => [
                      styles.directionsBtn,
                      {
                        borderRadius: 999,
                      },
                      (Platform.OS === 'web' && hovered) ? { opacity: 0.98 } : null,
                      pressed ? { opacity: 0.9, transform: [{ scale: 0.95 }] } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Chỉ đường"
                  >
                    <LinearGradient
                      colors={[ExploreEaseColors.primary, 'rgba(34, 211, 238, 0.78)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        paddingHorizontal: s(40),
                        paddingVertical: s(16),
                        borderRadius: 999,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                        <MaterialCommunityIcons name="map" size={s(18)} color={ExploreEaseColors.background} />
                        <Text style={{ color: ExploreEaseColors.background, fontWeight: '900', fontSize: s(15) }}>
                          Chỉ đường
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
                      Tạo chuyến đi mới để thêm điểm đến vào hành trình.
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
                      Chọn ngày để thêm điểm đến
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
                    {trips.map((t) => {
                      const start = parseDateOnly(t.start_date ?? null);
                      const end = parseDateOnly(t.end_date ?? null);
                      const daysCount = toDaysCount(start, end);
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => {
                            setSelectedTripRow(t);
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
                            {t.name}
                          </Text>
                          <Text style={{ fontWeight: '600', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }} numberOfLines={2}>
                            {(t.destination ?? '').trim() ? `${t.destination} • ` : ''}{daysCount} ngày
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

  floatingCardWrap: { width: '100%' },
  floatingCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardName: { color: 'white', fontWeight: '900' },
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

  metaRow: {},
  metaLabel: { color: 'rgba(148,163,184,0.95)', fontWeight: '800' },
  metaValue: { color: 'white', fontWeight: '900', marginTop: 6 },

  locationHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  locationTitle: { fontWeight: '900' },
  distanceText: { fontWeight: '800' },
  // Map UI moved to MapRedirectCard

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

  writeReviewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  inputLabel: { fontWeight: '900' },
  pickStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: {
    marginTop: 8,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: ExploreEaseColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: { color: ExploreEaseColors.background, fontWeight: '900' },

  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatarFallback: { flex: 1, backgroundColor: 'rgba(148,163,184,0.18)' },
  reviewName: { color: 'white', fontWeight: '900' },
  reviewStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reviewRatingText: { color: 'rgba(148,163,184,0.95)', fontWeight: '800' },
  reviewComment: { color: 'rgba(226,232,240,0.95)', fontWeight: '600', lineHeight: 18 },

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
