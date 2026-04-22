import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { eventBookmarkService } from '@/src/services/eventBookmarkService';
import { reminderService } from '@/src/services/reminderService';
import { transcribeAudioUri } from '@/src/services/speechService';
import { getStyles } from '@/src/styles/homeStyles';
import { parseMoneyToNumber } from '@/utils/format';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  ImageBackground,
  Platform,
  SafeAreaView,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
  type ColorValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';
import { FestivalShareModal } from '../../components/events/FestivalShareModal';
import { CategoriesCarousel } from '../../components/home/CategoriesCarousel';
import { FeaturedDestination } from '../../components/home/FeaturedDestination';
import { FestivalHighlights } from '../../components/home/FestivalHighlights';
import { Header } from '../../components/home/Header';
import { PopularDestinations } from '../../components/home/PopularDestinations';
import { SearchBar } from '../../components/home/SearchBar';
import { TimeOfDayToggle } from '../../components/home/TimeOfDayToggle';
import { YouMightAlsoLike, type YouMightAlsoLikeItem } from '../../components/home/YouMightAlsoLike';
import { ExploreEaseColors } from '../../constants/exploreEaseTheme';
import { destinationService } from '../../src/services/destinationService';
import { eventService, type EventRow } from '../../src/services/eventService';
import { presentLocalNotificationAsync, syncBookmarkedEventReminderAsync } from '../../src/services/localNotificationService';
import { profileService } from '../../src/services/profileService';
import { recommendationService, resolveTimeOfDayPreference, type PersonalizedRecommendationsResult } from '../../src/services/recommendationService';
import { supabase } from '../../src/services/supabase';
import { useRecommendationPreferencesStore } from '../../src/store/useRecommendationPreferencesStore';
import { useNotificationStore } from '../../src/store/useNotificationStore';

type CategoryRow = {
  id: number;
  name: string;
};

type HomeCategoryValue = 'all' | 'Cuisines' | 'Landmarks' | 'Activities';

type HomeCategoryItem = {
  id: HomeCategoryValue;
  label: string;
};

const HOME_CATEGORY_ITEMS: HomeCategoryItem[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'Cuisines', label: 'Ẩm thực 🍜' },
  { id: 'Landmarks', label: 'Tham quan 🏛️' },
  { id: 'Activities', label: 'Hoạt động 🎢' },
];

const isHomeCategoryValue = (value: string): value is HomeCategoryValue => {
  return value === 'all' || value === 'Cuisines' || value === 'Landmarks' || value === 'Activities';
};

const normalizeCategoryName = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

type DestinationRow = {
  id: number;
  name: string;
  location: string;
  price?: string | number | null;
  rating?: number | null;
  image_url?: string | null;
  is_featured?: boolean | null;
  category_id?: string | number | null;
  categories?: {
    name?: string | null;
  } | null;
};

type NotificationRow = {
  id: string | number;
  user_id: string;
  is_read?: boolean | null;
  created_at?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: any;
};

const toRating = (value: DestinationRow['rating']) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 4.7;
};

const HOME_DESTINATIONS_PAGE_SIZE = 24;
const HOME_EVENTS_PAGE_SIZE = 18;
const HOME_PRELOAD_THRESHOLD_PX = 320;

const normalizeAndSortHomeEvents = (rows: EventRow[]): EventRow[] => {
  return [...rows]
    .filter((row) => row.approval_status !== 'rejected')
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
};

type VoiceSearchState = 'idle' | 'recording' | 'processing';

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<{ full_name: string | null; nationality?: string | null } | null>(null);
  const { isDark } = useTheme();
  const { t } = useI18n();
  const { formatPricePerPerson } = useCurrency();
  const [, setNotifications] = useState<NotificationRow[]>([]);
  const [, setPendingRemindersCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [voiceSearchState, setVoiceSearchState] = useState<VoiceSearchState>('idle');
  const timeOfDayPreference = useRecommendationPreferencesStore((s) => s.timeOfDayPreference);
  const setTimeOfDayPreference = useRecommendationPreferencesStore((s) => s.setTimeOfDayPreference);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const recordingRef = React.useRef<Audio.Recording | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const [loadingPersonalized, setLoadingPersonalized] = useState(true);
  const [loadingHomeEvents, setLoadingHomeEvents] = useState(true);
  const isLoading = loadingProfile || loadingDestinations || loadingPersonalized || loadingHomeEvents;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [featured, setFeatured] = useState<DestinationRow | null>(null);
  const [allDestinations, setAllDestinations] = useState<DestinationRow[]>([]);
  const [destinationsOffset, setDestinationsOffset] = useState(0);
  const [hasMoreDestinations, setHasMoreDestinations] = useState(true);
  const [loadingMoreDestinations, setLoadingMoreDestinations] = useState(false);
  const [popular, setPopular] = useState<DestinationRow[]>([]);
  const [homeEvents, setHomeEvents] = useState<EventRow[]>([]);
  const [homeEventsOffset, setHomeEventsOffset] = useState(0);
  const [hasMoreHomeEvents, setHasMoreHomeEvents] = useState(true);
  const [loadingMoreHomeEvents, setLoadingMoreHomeEvents] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [homeEventBookmarkMap, setHomeEventBookmarkMap] = useState<Record<string, boolean>>({});
  const [homeEventBookmarkPendingMap, setHomeEventBookmarkPendingMap] = useState<Record<string, boolean>>({});
  const [shareEvent, setShareEvent] = useState<EventRow | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HomeCategoryValue>('all');
  const [personalized, setPersonalized] = useState<PersonalizedRecommendationsResult | null>(null);

  const categoryItems = useMemo(
    () => HOME_CATEGORY_ITEMS,
    []
  );

  const selectedCategoryName = selectedCategory === 'all' ? null : selectedCategory;

  const selectedCategoryId = useMemo(() => {
    if (!selectedCategoryName) return null;
    const selectedLower = normalizeCategoryName(selectedCategoryName);
    const hit = categories.find((category) => normalizeCategoryName(category.name) === selectedLower);
    return hit?.id ?? null;
  }, [categories, selectedCategoryName]);

  const pulse = React.useRef(new Animated.Value(0)).current;
  const loadingMoreDestinationsRef = React.useRef(false);
  const loadingMoreHomeEventsRef = React.useRef(false);
  const preloadTickRef = React.useRef(0);

  const effectiveTimeOfDay = useMemo(
    () => resolveTimeOfDayPreference(timeOfDayPreference),
    [timeOfDayPreference]
  );

  const onPressFilters = useCallback(() => {
    const query = searchText.trim();
    if (!query) {
      router.push('/(tabs)/explore' as any);
      return;
    }

    router.push(
      {
        pathname: '/(tabs)/explore',
        params: {
          q: query,
        },
      } as any
    );
  }, [searchText]);

  // Lấy styles dựa trên state hiện tại
  const styles = useMemo(() => getStyles({ isDarkMode: isDark, screenWidth }), [isDark, screenWidth]);

  const toDisplayPrice = useCallback(
    (value: DestinationRow['price']) => {
      const amount = parseMoneyToNumber(value);
      if (amount === null) return '';
      return formatPricePerPerson(amount);
    },
    [formatPricePerPerson]
  );

  const toSuggestionPrice = useCallback(
    (value: number | null) => {
      if (value === null) return '—';
      if (value <= 0) return t('common.free');
      return formatPricePerPerson(value);
    },
    [formatPricePerPerson, t]
  );

  const normalizeSearchValue = useCallback((value: string) => value.trim().toLowerCase(), []);

  const applySearchText = useCallback(
    (text: string) => {
      setSearchText(text);
    },
    []
  );

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const currentProfile = await profileService.getCurrentProfile();
      setProfile(currentProfile);
    } catch (err: any) {
      console.warn('fetchProfile failed:', err?.message ?? err);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const fetchDestinations = useCallback(async () => {
    setLoadingDestinations(true);
    try {
      const [cats, featuredRows, dests] = await Promise.all([
        destinationService.getCategories() as Promise<CategoryRow[]>,
        destinationService.getDestinations({ isFeatured: true, limit: 1, offset: 0 }) as Promise<DestinationRow[]>,
        destinationService.getDestinations({ limit: HOME_DESTINATIONS_PAGE_SIZE, offset: 0 }) as Promise<DestinationRow[]>,
      ]);

      setCategories(cats ?? []);

      const featuredDestination = (featuredRows ?? [])[0] ?? null;
      setFeatured(featuredDestination);

      const firstPageRows = dests ?? [];
      setAllDestinations(firstPageRows);
      setDestinationsOffset(firstPageRows.length);
      setHasMoreDestinations(firstPageRows.length >= HOME_DESTINATIONS_PAGE_SIZE);
      loadingMoreDestinationsRef.current = false;
      setLoadingMoreDestinations(false);
    } catch (err: any) {
      console.warn('fetchDestinations failed:', err?.message ?? err);
      setCategories([]);
      setFeatured(null);
      setAllDestinations([]);
      setDestinationsOffset(0);
      setHasMoreDestinations(false);
      loadingMoreDestinationsRef.current = false;
      setLoadingMoreDestinations(false);
      setPopular([]);
    } finally {
      setLoadingDestinations(false);
    }
  }, []);

  const loadMoreDestinations = useCallback(async () => {
    if (loadingMoreDestinationsRef.current || loadingDestinations || !hasMoreDestinations) {
      return;
    }

    loadingMoreDestinationsRef.current = true;
  setLoadingMoreDestinations(true);

    try {
      const rows = await (destinationService.getDestinations({
        limit: HOME_DESTINATIONS_PAGE_SIZE,
        offset: destinationsOffset,
      }) as Promise<DestinationRow[]>);

      const nextRows = rows ?? [];

      setAllDestinations((prev) => {
        if (nextRows.length === 0) return prev;

        const seenIds = new Set(prev.map((row) => String(row.id)));
        const merged = [...prev];
        for (const row of nextRows) {
          const key = String(row.id);
          if (seenIds.has(key)) continue;
          seenIds.add(key);
          merged.push(row);
        }

        return merged;
      });

      setDestinationsOffset((prev) => prev + nextRows.length);
      if (nextRows.length < HOME_DESTINATIONS_PAGE_SIZE) {
        setHasMoreDestinations(false);
      }
    } catch (err: any) {
      console.warn('loadMoreDestinations failed:', err?.message ?? err);
    } finally {
      loadingMoreDestinationsRef.current = false;
      setLoadingMoreDestinations(false);
    }
  }, [destinationsOffset, hasMoreDestinations, loadingDestinations]);

  const fetchHomeEvents = useCallback(async () => {
    setLoadingHomeEvents(true);
    try {
      const rows = await eventService.getEvents({
        orderBy: 'created_at',
        ascending: false,
        limit: HOME_EVENTS_PAGE_SIZE,
        offset: 0,
      });

      const initialRows = rows ?? [];
      const nextEvents = normalizeAndSortHomeEvents(initialRows);

      setHomeEvents(nextEvents);
      setHomeEventsOffset(initialRows.length);
      setHasMoreHomeEvents(initialRows.length >= HOME_EVENTS_PAGE_SIZE);
      loadingMoreHomeEventsRef.current = false;
      setLoadingMoreHomeEvents(false);
    } catch (err: any) {
      console.warn('fetchHomeEvents failed:', err?.message ?? err);
      setHomeEvents([]);
      setHomeEventsOffset(0);
      setHasMoreHomeEvents(false);
      loadingMoreHomeEventsRef.current = false;
      setLoadingMoreHomeEvents(false);
    } finally {
      setLoadingHomeEvents(false);
    }
  }, []);

  const loadMoreHomeEvents = useCallback(async () => {
    if (loadingMoreHomeEventsRef.current || loadingHomeEvents || !hasMoreHomeEvents) {
      return;
    }

    loadingMoreHomeEventsRef.current = true;
  setLoadingMoreHomeEvents(true);

    try {
      const rows = await eventService.getEvents({
        orderBy: 'created_at',
        ascending: false,
        limit: HOME_EVENTS_PAGE_SIZE,
        offset: homeEventsOffset,
      });

      const nextRows = rows ?? [];
      const normalizedNextRows = normalizeAndSortHomeEvents(nextRows);

      setHomeEvents((prev) => {
        if (normalizedNextRows.length === 0) return prev;

        const rowById = new Map<string, EventRow>();
        for (const row of prev) {
          rowById.set(row.id, row);
        }
        for (const row of normalizedNextRows) {
          rowById.set(row.id, row);
        }

        return normalizeAndSortHomeEvents(Array.from(rowById.values()));
      });

      setHomeEventsOffset((prev) => prev + nextRows.length);
      if (nextRows.length < HOME_EVENTS_PAGE_SIZE) {
        setHasMoreHomeEvents(false);
      }
    } catch (err: any) {
      console.warn('loadMoreHomeEvents failed:', err?.message ?? err);
    } finally {
      loadingMoreHomeEventsRef.current = false;
      setLoadingMoreHomeEvents(false);
    }
  }, [hasMoreHomeEvents, homeEventsOffset, loadingHomeEvents]);

  useEffect(() => {
    let alive = true;

    const resolveCurrentUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!alive) return;

        setCurrentUserId(data.user?.id ?? null);
      } catch (err: any) {
        if (!alive) return;
        console.warn('home resolveCurrentUser failed:', err?.message ?? err);
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

    const loadHomeEventBookmarks = async () => {
      if (homeEvents.length === 0) {
        setHomeEventBookmarkMap({});
        return;
      }

      try {
        const bookmarkedIds = await eventBookmarkService.getBookmarkedIds(currentUserId);
        if (!alive) return;

        const bookmarkedSet = new Set(bookmarkedIds);
        const nextMap: Record<string, boolean> = {};
        for (const event of homeEvents) {
          nextMap[event.id] = bookmarkedSet.has(event.id);
        }

        setHomeEventBookmarkMap(nextMap);
      } catch (err: any) {
        if (!alive) return;
        console.warn('loadHomeEventBookmarks failed:', err?.message ?? err);
        setHomeEventBookmarkMap({});
      }
    };

    void loadHomeEventBookmarks();

    return () => {
      alive = false;
    };
  }, [currentUserId, homeEvents]);

  useEffect(() => {
    const normalizedQuery = normalizeSearchValue(searchText);
    const selectedCategoryLower = selectedCategoryName ? normalizeCategoryName(selectedCategoryName) : null;

    const next = allDestinations.filter((row) => {
      const name = String(row.name ?? '').toLowerCase();
      const location = String(row.location ?? '').toLowerCase();
      const matchesQuery = !normalizedQuery || name.includes(normalizedQuery) || location.includes(normalizedQuery);

      if (!matchesQuery) return false;
      if (!selectedCategoryLower) return true;

      if (selectedCategoryId !== null && typeof selectedCategoryId !== 'undefined') {
        return String(row.category_id ?? '') === String(selectedCategoryId);
      }

      return normalizeCategoryName(row.categories?.name) === selectedCategoryLower;
    });

    setPopular(next);
  }, [allDestinations, normalizeSearchValue, searchText, selectedCategoryId, selectedCategoryName]);

  const onChangeCategory = useCallback((id: string) => {
    if (!isHomeCategoryValue(id)) return;
    setSelectedCategory(id);
  }, []);

  const fetchPersonalizedRecommendations = useCallback(async () => {
    setLoadingPersonalized(true);
    try {
      const result = await recommendationService.getPersonalizedRecommendationsForCurrentUser({
        limitDestinations: 8,
        limitEvents: 6,
        timeOfDay: effectiveTimeOfDay,
        respectTimeOfDayWindow: true,
      });

      setPersonalized(result);
    } catch (err: any) {
      console.warn('fetchPersonalizedRecommendations failed:', err?.message ?? err);
      setPersonalized(null);
    } finally {
      setLoadingPersonalized(false);
    }
  }, [effectiveTimeOfDay]);

  const onChangeSearchText = useCallback(
    (text: string) => {
      applySearchText(text);
    },
    [applySearchText]
  );

  const onSubmitSearch = useCallback(() => {
    onPressFilters();
  }, [onPressFilters]);

  const setRecordingAudioMode = useCallback(async (recordingEnabled: boolean) => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: recordingEnabled,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (voiceSearchState !== 'idle') return;

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('home.voice.permissionTitle'),
          t('home.voice.permissionMessage')
        );
        return;
      }

      await setRecordingAudioMode(true);

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setVoiceSearchState('recording');
    } catch (err: any) {
      console.warn('startVoiceRecording failed:', err?.message ?? err);
      recordingRef.current = null;
      setVoiceSearchState('idle');
      setRecordingAudioMode(false).catch(() => {
        // noop
      });
      Alert.alert(t('home.voice.unavailableTitle'), t('home.voice.unavailableMessage'));
    }
  }, [setRecordingAudioMode, t, voiceSearchState]);

  const stopVoiceRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setVoiceSearchState('idle');
      return;
    }

    setVoiceSearchState('processing');
    recordingRef.current = null;

    let recordingUri: string | null = null;

    try {
      await recording.stopAndUnloadAsync();
      recordingUri = recording.getURI();
    } catch (err: any) {
      console.warn('stopVoiceRecording failed:', err?.message ?? err);
    } finally {
      await setRecordingAudioMode(false).catch(() => {
        // noop
      });
    }

    if (!recordingUri) {
      setVoiceSearchState('idle');
      Alert.alert(t('home.voice.failedTitle'), t('home.voice.noAudioMessage'));
      return;
    }

    try {
      const transcript = await transcribeAudioUri(recordingUri, {
        language: 'vi',
      });

      const query = transcript.trim();
      if (!query) {
        Alert.alert(t('home.voice.noSpeechTitle'), t('home.voice.noSpeechMessage'));
        return;
      }

      applySearchText(query);
    } catch (err: any) {
      console.warn('voice transcription failed:', err?.message ?? err);
      Alert.alert(
        t('home.voice.failedTitle'),
        err?.message ?? t('home.voice.failedMessage')
      );
    } finally {
      setVoiceSearchState('idle');
    }
  }, [applySearchText, setRecordingAudioMode, t]);

  const onPressVoiceSearch = useCallback(() => {
    if (voiceSearchState === 'processing') return;

    if (voiceSearchState === 'recording') {
      void stopVoiceRecordingAndTranscribe();
      return;
    }

    void startVoiceRecording();
  }, [startVoiceRecording, stopVoiceRecordingAndTranscribe, voiceSearchState]);

  const voiceStatusText = useMemo(() => {
    if (voiceSearchState === 'recording') {
      return t('home.voice.listening');
    }

    if (voiceSearchState === 'processing') {
      return t('home.voice.processing');
    }

    return null;
  }, [t, voiceSearchState]);

  const fetchUnreadNotifications = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('notifications unread fetch error:', error.message);
        setNotifications([]);
        return;
      }

      setNotifications((data ?? []) as NotificationRow[]);
    } catch (err: any) {
      console.warn('fetchUnreadNotifications failed:', err?.message ?? err);
      setNotifications([]);
    }
  }, []);

  const onPressPersonalizedItem = useCallback((item: YouMightAlsoLikeItem) => {
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

  const onPressHomeEvent = useCallback((event: EventRow) => {
    router.push(`/event/${event.id}` as any);
  }, []);

  const onShareHomeEvent = useCallback((event: EventRow) => {
    setShareEvent(event);
  }, []);

  const closeShareModal = useCallback(() => {
    setShareEvent(null);
  }, []);

  const onToggleHomeEventBookmark = useCallback(async (eventId: string, nextBookmarked: boolean) => {
    const safeEventId = String(eventId ?? '').trim();
    if (!safeEventId) return;

    const targetEvent = homeEvents.find((item) => item.id === safeEventId);

    setHomeEventBookmarkPendingMap((prev) => ({
      ...prev,
      [safeEventId]: true,
    }));
    setHomeEventBookmarkMap((prev) => ({
      ...prev,
      [safeEventId]: nextBookmarked,
    }));

    try {
      await eventBookmarkService.setBookmarked(safeEventId, nextBookmarked, currentUserId);

      if (targetEvent) {
        try {
          await syncBookmarkedEventReminderAsync({
            bookmarked: nextBookmarked,
            eventId: targetEvent.id,
            eventTitle: targetEvent.title,
            startTime: targetEvent.start_time,
            location: targetEvent.location,
            userId: currentUserId,
          });
        } catch (reminderErr: any) {
          console.warn('home bookmark reminder sync failed:', reminderErr?.message ?? reminderErr);
        }

        const eventTitle = targetEvent.title?.trim() || 'sự kiện này';
        addNotification({
          message: nextBookmarked
            ? `Đã lưu sự kiện "${eventTitle}"`
            : `Đã bỏ lưu sự kiện "${eventTitle}"`,
          type: 'success',
          durationMs: 2600,
        });
      }
    } catch (err: any) {
      console.warn('onToggleHomeEventBookmark failed:', err?.message ?? err);
      setHomeEventBookmarkMap((prev) => ({
        ...prev,
        [safeEventId]: !nextBookmarked,
      }));
      Alert.alert(t('common.notification'), t('event.detail.bookmarkToggleFailed'));
    } finally {
      setHomeEventBookmarkPendingMap((prev) => {
        const next = { ...prev };
        delete next[safeEventId];
        return next;
      });
    }
  }, [addNotification, currentUserId, homeEvents, t]);

  const onPressViewAllFestivals = useCallback(() => {
    router.push('/festivals' as any);
  }, []);

  const onHomeScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);

    if (!Number.isFinite(distanceToBottom) || distanceToBottom > HOME_PRELOAD_THRESHOLD_PX) {
      return;
    }

    const now = Date.now();
    if (now - preloadTickRef.current < 220) {
      return;
    }
    preloadTickRef.current = now;

    if (hasMoreDestinations) {
      void loadMoreDestinations();
    }

    if (hasMoreHomeEvents) {
      void loadMoreHomeEvents();
    }
  }, [hasMoreDestinations, hasMoreHomeEvents, loadMoreDestinations, loadMoreHomeEvents]);

  const refreshPendingReminders = useCallback(async () => {
    try {
      const count = await reminderService.countPendingRemindersForCurrentUser();
      setPendingRemindersCount(count);
    } catch (err: any) {
      console.warn('refreshPendingReminders failed:', err?.message ?? err);
      setPendingRemindersCount(0);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await Promise.all([fetchProfile(), fetchDestinations(), fetchHomeEvents()]);
    };

    run().catch(() => {
      // errors already handled in fetchers
    });

    return () => {
      mounted = false;
      void mounted;
    };
  }, [fetchDestinations, fetchHomeEvents, fetchProfile]);

  useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      recordingRef.current = null;

      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {
          // noop
        });
      }

      setRecordingAudioMode(false).catch(() => {
        // noop
      });
    };
  }, [setRecordingAudioMode]);

  useEffect(() => {
    void fetchPersonalizedRecommendations();
  }, [fetchPersonalizedRecommendations]);

  useEffect(() => {
    let isActive = true;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        setNotifications([]);
        return;
      }

      await fetchUnreadNotifications(userId);

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isActive) return;

            const next = payload.new as NotificationRow;
            if (next?.is_read === true) return;

            setNotifications((prev) => {
              if (next?.id !== undefined && prev.some((n) => n.id === next.id)) return prev;
              return [next, ...prev];
            });

            void presentLocalNotificationAsync({
              title: next?.title,
              message: next?.message ?? next?.body,
              data: {
                notificationId: String(next?.id ?? ''),
                type: next?.type ?? 'system',
              },
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isActive) return;

            const next = payload.new as NotificationRow;
            if (!next?.id) return;

            setNotifications((prev) => {
              if (next.is_read) {
                return prev.filter((item) => item.id !== next.id);
              }

              const filtered = prev.filter((item) => item.id !== next.id);
              return [next, ...filtered];
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isActive) return;
            const oldRow = payload.old as NotificationRow;
            if (!oldRow?.id) return;

            setNotifications((prev) => prev.filter((item) => item.id !== oldRow.id));
          }
        )
        .subscribe();
    };

    init().catch((err: any) => {
      console.warn('notifications init failed:', err?.message ?? err);
    });

    return () => {
      isActive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchUnreadNotifications]);

  useEffect(() => {
    let isActive = true;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      await refreshPendingReminders();

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) return;

      channel = supabase
        .channel(`reminders:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'reminders',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (!isActive) return;
            void refreshPendingReminders();
          }
        )
        .subscribe();
    };

    init().catch((err: any) => {
      console.warn('reminders init failed:', err?.message ?? err);
    });

    return () => {
      isActive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refreshPendingReminders]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const displayName = profile?.full_name ?? (loadingProfile ? '...' : t('profile.defaultName'));
  const avatarUrl = displayName
    ? `https://api.dicebear.com/7.x/avataaars/jpg?seed=${encodeURIComponent(displayName)}`
    : undefined;

  const gradientColors: readonly [ColorValue, ColorValue, ColorValue] = isDark
    ? [ExploreEaseColors.background, ExploreEaseColors.background, 'rgba(10,25,41,0.95)']
    : ['#f8fafc', '#f8fafc', 'rgba(248,250,252,0.95)'];

  const blobAnimStyle1 = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.38] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
      },
    ],
  };

  const blobAnimStyle2 = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.32] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.1] }),
      },
    ],
  };

  const popularItems = useMemo(
    () =>
      popular
        .filter((d) => !!d.image_url)
        .map((d) => ({
          id: d.id,
          name: d.name,
          location: d.location,
          price: toDisplayPrice(d.price) || '—',
          imageUrl: d.image_url as string,
          rating: toRating(d.rating),
        })),
    [popular, toDisplayPrice]
  );

  const featuredForDisplay = useMemo(() => {
    if (selectedCategory === 'all') return featured;
    return popular.find((item) => !!item.image_url) ?? null;
  }, [featured, popular, selectedCategory]);

  const personalizedItems = useMemo<YouMightAlsoLikeItem[]>(
    () =>
      (personalized?.combined ?? []).map((item) => ({
        ...item,
        displayPrice: toSuggestionPrice(item.priceValue),
      })),
    [personalized, toSuggestionPrice]
  );

  const activeTimeOfDay = personalized?.timeOfDay ?? effectiveTimeOfDay;
  const isLoadingMore = loadingMoreDestinations || loadingMoreHomeEvents;
  const hasMore = hasMoreDestinations || hasMoreHomeEvents;
  const homeDataLength = allDestinations.length + homeEvents.length;

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainContainer}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Animated background gradient elements */}
      <View style={[styles.bgBlobContainer, { pointerEvents: 'none' }]}>
        <Animated.View style={[styles.bgCircle1, blobAnimStyle1]} />
        <Animated.View style={[styles.bgCircle2, blobAnimStyle2]} />
      </View>

      <SafeAreaView style={styles.safeAreaContent}>
        {isLoading ? (
          <View style={[styles.loadingIndicator, { pointerEvents: 'none' }]} />
        ) : null}
        <FlatList
          data={['home-root']}
          keyExtractor={(item) => item}
          renderItem={() => (
            <View style={styles.pageContent}>
              <Header
                styles={styles}
                name={displayName}
                avatarUrl={avatarUrl}
                isDarkMode={isDark}
                showNotificationsButton={false}
              />

              <SearchBar
                styles={styles}
                isDarkMode={isDark}
                value={searchText}
                onChangeText={onChangeSearchText}
                onSubmitEditing={onSubmitSearch}
                onPressFilters={onPressFilters}
                onPressVoiceSearch={onPressVoiceSearch}
                disableVoiceSearch={voiceSearchState === 'processing'}
                voiceSearchState={voiceSearchState}
                voiceStatusText={voiceStatusText}
              />

              <CategoriesCarousel
                styles={styles}
                isDarkMode={isDark}
                categories={categoryItems}
                activeId={selectedCategory}
                initialActiveId={categoryItems[0]?.id}
                onChange={onChangeCategory}
              />

              {featuredForDisplay ? (
                <FeaturedDestination
                  styles={styles}
                  title={featuredForDisplay.name}
                  location={featuredForDisplay.location}
                  price={toDisplayPrice(featuredForDisplay.price) || '—'}
                  rating={toRating(featuredForDisplay.rating)}
                  imageUrl={featuredForDisplay.image_url ?? ''}
                  onPress={() => {
                    router.push(
                      {
                        pathname: '/destination/[id]',
                        params: {
                          id: String(featuredForDisplay.id),
                          name: featuredForDisplay.name,
                          location: featuredForDisplay.location,
                          price: toDisplayPrice(featuredForDisplay.price) || '—',
                          rating: String(toRating(featuredForDisplay.rating)),
                          imageUrl: featuredForDisplay.image_url ?? '',
                        },
                      } as any
                    );
                  }}
                />
              ) : null}

              <TimeOfDayToggle
                value={timeOfDayPreference}
                onChange={setTimeOfDayPreference}
              />

              <YouMightAlsoLike
                items={personalizedItems}
                loading={loadingPersonalized}
                timeOfDay={activeTimeOfDay}
                travelStyle={personalized?.preferences.travelStyle ?? null}
                onPressItem={onPressPersonalizedItem}
              />

              <FestivalHighlights
                events={homeEvents}
                loading={loadingHomeEvents}
                bookmarkedMap={homeEventBookmarkMap}
                bookmarkPendingMap={homeEventBookmarkPendingMap}
                onPressEvent={onPressHomeEvent}
                onShareEvent={onShareHomeEvent}
                onToggleBookmark={onToggleHomeEventBookmark}
                onPressViewAll={onPressViewAllFestivals}
              />

              <PopularDestinations
                styles={styles}
                destinations={popularItems}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
          onScroll={onHomeScroll}
          scrollEventThrottle={16}
          ListFooterComponent={
            isLoadingMore ? (
              <View
                style={{
                  paddingVertical: 20,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                  <ActivityIndicator size="large" color={ExploreEaseColors.primary} />
              </View>
            ) : !hasMore && homeDataLength > 0 ? (
              <ImageBackground
                source={require('../../assets/images/background-vlu.png')}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
                imageStyle={{
                  borderRadius: 14,
                }}
              >
                <View
                  style={{
                    paddingTop: 14,
                    paddingBottom: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(2, 23, 43, 0.56)' : 'rgba(255, 255, 255, 0.68)',
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      fontSize: 12,
                      fontWeight: '700',
                      marginBottom: 4,
                      color: isDark ? '#dbeafe' : '#1e3a5f',
                    }}
                  >
                    Dự án: ExploreEase
                  </Text>
                  <Text
                    style={{
                      textAlign: 'center',
                      fontSize: 12,
                      fontWeight: '700',
                      marginBottom: 8,
                      color: '#0077B6',
                    }}
                  >
                    Thực hiện bởi: Nguyễn Mạnh Hoàng Nguyên
                  </Text>
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      backgroundColor: '#e5e5e5',
                    }}
                  >
                    {/* // 🎯 TODO: [PASTE VLU LOGO HERE] */}
                  </View>
                </View>
              </ImageBackground>
            ) : null
          }
        />

        <FestivalShareModal
          visible={!!shareEvent}
          event={shareEvent}
          currentUserId={currentUserId}
          onClose={closeShareModal}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}
