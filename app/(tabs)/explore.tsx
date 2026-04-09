import { CreateEventForm, type EventFormData } from '@/components/events/CreateEventForm';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import {
  destinationService,
  type DestinationDiscoveryRow,
  type DiscoveryPriceFilter,
  type DiscoveryQueryFilters,
  type DiscoverySearchSuggestion,
  type DiscoverySortOption,
} from '@/src/services/destinationService';
import { eventService, type EventRow, type EventStatus } from '@/src/services/eventService';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { parseMoneyToNumber } from '@/utils/format';
import {
  formatDistance,
  geocodeLocationText,
  getEffectiveTargetLocation,
  getHaversineDistance,
  resolveEntityCoords,
  useLocationOverrideStore,
} from '@/utils/location';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Modal,
  NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
  TouchableOpacity,
  View,
} from 'react-native';

const combineLocalDateTime = (dateText: string, timeText: string): Date | null => {
  const dt = new Date(`${dateText.trim()}T${timeText.trim()}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

type CategoryRow = {
  id: string | number;
  name: string;
};

const FALLBACK_DESTINATION_IMAGE =
  'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=80';

const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

type EventDateFilter = 'all' | 'today' | 'next-7-days' | 'this-month';

const DISCOVERY_PAGE_SIZE = 20;
const PRELOAD_SCROLL_THRESHOLD = 0.5;
const NEARBY_RADIUS_KM = 5;
const NEARBY_RADIUS_METERS = NEARBY_RADIUS_KM * 1000;

const getEventDateRange = (filter: EventDateFilter) => {
  if (filter === 'all') {
    return { startFrom: undefined, endTo: undefined } as const;
  }

  const now = new Date();

  if (filter === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return { startFrom: start, endTo: end } as const;
  }

  if (filter === 'next-7-days') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);

    return { startFrom: start, endTo: end } as const;
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startFrom: start, endTo: end } as const;
};


export default function ExploreScreen() {
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { location: gpsLocation, errorMsg: gpsErrorMsg, isLoading: isLoadingGps } = useLocation();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const isManualLocationEnabled = useLocationOverrideStore((s) => s.useManualLocation);
  const manualLocationText = useLocationOverrideStore((s) => s.manualLocationText);
  const manualLocationCoords = useLocationOverrideStore((s) => s.manualLocationCoords);
  const setManualLocation = useLocationOverrideStore((s) => s.setManualLocation);
  const clearManualLocation = useLocationOverrideStore((s) => s.clearManualLocation);
  const setUseManualLocation = useLocationOverrideStore((s) => s.setUseManualLocation);

  const [manualInput, setManualInput] = useState(manualLocationText);
  const [resolvingManualLocation, setResolvingManualLocation] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
  const [searchNonce, setSearchNonce] = useState(0);
  const [aiSmartSearchEnabled, setAiSmartSearchEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<DiscoverySearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const lastAppliedRouteQueryRef = useRef<string>('');

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [eventCategories, setEventCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [eventDateFilter, setEventDateFilter] = useState<EventDateFilter>('all');
  const [eventStatusFilter, setEventStatusFilter] = useState<EventStatus | 'all'>('all');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [priceFilter, setPriceFilter] = useState<DiscoveryPriceFilter>('all');
  const [sortBy, setSortBy] = useState<DiscoverySortOption>('relevance');
  const [nearbyOnly, setNearbyOnly] = useState(false);

  const [attractions, setAttractions] = useState<DestinationDiscoveryRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [distanceByKey, setDistanceByKey] = useState<Record<string, number>>({});

  const [destinationOffset, setDestinationOffset] = useState(0);
  const [eventOffset, setEventOffset] = useState(0);
  const [hasMoreAttractions, setHasMoreAttractions] = useState(true);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedInitialRef = useRef(false);
  const loadRequestSeqRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = loading || loadingMore;

  const [showCreateModal, setShowCreateModal] = useState(false);

  const formatDateTimeText = useCallback((value: string | null | undefined) => {
    if (!value) return t('common.na');
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString(locale);
  }, [locale, t]);

  const getEventStatusLabel = useCallback((status: EventStatus) => {
    if (status === 'ongoing') return t('event.status.ongoing');
    if (status === 'completed') return t('event.status.completed');
    return t('event.status.incoming');
  }, [t]);

  const formatEventPriceText = useCallback((value: number | null | undefined) => {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    if (num <= 0) return t('common.free');
    return `${num.toLocaleString(locale)} ${t('common.currencyVndShort')}`;
  }, [locale, t]);

  const formatDestinationPriceText = useCallback((value: unknown) => {
    const amount = parseMoneyToNumber(value);
    if (amount === null) return t('common.na');
    if (amount <= 0) return t('common.free');
    return `${amount.toLocaleString(locale)} ${t('common.currencyVndShort')}`;
  }, [locale, t]);

  const toCategoryName = useCallback((item: DestinationDiscoveryRow) => {
    const rel = item.categories as any;
    const fromRelation = typeof rel?.name === 'string' ? rel.name.trim() : '';
    if (fromRelation) return fromRelation;
    return t('explore.category.general');
  }, [t]);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      inputBg: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
    }),
    [isDark]
  );

  const incomingRouteQuery = useMemo(() => {
    const raw = Array.isArray(params.q) ? params.q[0] : params.q;
    return typeof raw === 'string' ? raw.trim() : '';
  }, [params.q]);

  useEffect(() => {
    if (!incomingRouteQuery) return;

    const normalizedIncoming = incomingRouteQuery.toLowerCase();
    if (normalizedIncoming === lastAppliedRouteQueryRef.current) return;

    lastAppliedRouteQueryRef.current = normalizedIncoming;
    setSearchQuery(incomingRouteQuery);
    setSubmittedSearchQuery(incomingRouteQuery);
    setShowSuggestions(false);
    setSearchNonce((prev) => prev + 1);
  }, [incomingRouteQuery]);

  useEffect(() => {
    setManualInput(manualLocationText);
  }, [manualLocationText]);

  const effectiveTargetLocation = useMemo(
    () =>
      getEffectiveTargetLocation({
        gpsLocation,
        useManualLocation: isManualLocationEnabled,
        manualLocationCoords,
      }),
    [gpsLocation, isManualLocationEnabled, manualLocationCoords]
  );

  const categoryOptions = useMemo(() => {
    const fromDestinations = categories.map((c) => c.name).filter(Boolean);
    const fromEvents = events.map((e) => String(e.category ?? '').trim()).filter(Boolean);

    const merged = ['all', ...eventCategories, ...fromDestinations, ...fromEvents];
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of merged) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }

    return result;
  }, [categories, eventCategories, events]);

  const selectedCategoryId = useMemo(() => {
    if (selectedCategory === 'all') return null;
    const hit = categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase());
    return hit?.id ?? null;
  }, [categories, selectedCategory]);

  useEffect(() => {
    let cancelled = false;

    const loadCategoriesAndEventCategories = async () => {
      try {
        const [destinationRows, eventCategoryRows] = await Promise.all([
          destinationService.getCategories(),
          eventService.getDistinctCategories(),
        ]);

        if (cancelled) return;

        const mapped: CategoryRow[] = (destinationRows ?? [])
          .map((row: any) => ({ id: row.id, name: String(row.name ?? '').trim() }))
          .filter((row: CategoryRow) => !!row.name);

        setCategories(mapped);
        setEventCategories((eventCategoryRows ?? []).map((item) => String(item).trim()).filter(Boolean));
      } catch {
        if (cancelled) return;
        setCategories([]);
        setEventCategories([]);
      }
    };

    void loadCategoriesAndEventCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!searchQuery.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      try {
        const rows = await destinationService.getAutocompleteSuggestions(searchQuery.trim(), 5);
        if (cancelled) return;

        setSuggestions(rows);
        setShowSuggestions(rows.length > 0);
      } catch {
        if (cancelled) return;
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const loadDiscovery = useCallback(
    async (input: {
      showSpinner: boolean;
      append: boolean;
      destinationOffset: number;
      eventOffset: number;
    }) => {
      const { showSpinner, append, destinationOffset: nextDestinationOffset, eventOffset: nextEventOffset } = input;
      const requestSeq = ++loadRequestSeqRef.current;

      if (showSpinner) setLoading(true);
      if (append) setLoadingMore(true);
      setErrorMessage(null);

      try {
        const normalizedSearchQuery = submittedSearchQuery.trim();
        const useAiSmartSearch = aiSmartSearchEnabled && !!normalizedSearchQuery;

        if (append && useAiSmartSearch) {
          return;
        }

        let destinationRows: DestinationDiscoveryRow[] = [];
        let eventRows: EventRow[] = [];

        if (useAiSmartSearch) {
          const aiRows = await destinationService.searchDestinationsByAI(normalizedSearchQuery);

          const selectedCategoryLower = selectedCategory.toLowerCase();
          destinationRows = aiRows.filter((row) => {
            if (selectedCategoryId !== null && typeof selectedCategoryId !== 'undefined') {
              return String(row.category_id ?? '') === String(selectedCategoryId);
            }

            if (selectedCategoryLower !== 'all') {
              const relation = row.categories as any;
              const categoryName = Array.isArray(relation)
                ? String(relation[0]?.name ?? '').trim().toLowerCase()
                : String(relation?.name ?? '').trim().toLowerCase();

              if (categoryName !== selectedCategoryLower) return false;
            }

            if (typeof ratingFilter === 'number' && Number.isFinite(ratingFilter)) {
              const ratingValue = typeof row.rating === 'number' ? row.rating : 0;
              if (ratingValue < ratingFilter) return false;
            }

            if (priceFilter === 'free') {
              const priceValue = parseMoneyToNumber(row.price);
              if (priceValue !== 0) return false;
            } else if (priceFilter === 'paid') {
              const priceValue = parseMoneyToNumber(row.price);
              if (priceValue === null || priceValue <= 0) return false;
            }

            return true;
          });

          eventRows = [];
        } else {
          const destinationFilters: DiscoveryQueryFilters = {
            search: normalizedSearchQuery || undefined,
            categoryId: selectedCategoryId,
            categoryName: selectedCategory !== 'all' ? selectedCategory : null,
            ratingMin: ratingFilter,
            priceFilter,
            sort: sortBy,
            limit: DISCOVERY_PAGE_SIZE,
            offset: nextDestinationOffset,
          };

          const dateRange = getEventDateRange(eventDateFilter);
          const eventOrderBy: 'start_time' | 'created_at' | 'title' =
            sortBy === 'a-z' ? 'title' : sortBy === 'top-rated' ? 'start_time' : (normalizedSearchQuery ? 'start_time' : 'created_at');
          const eventAscending: boolean = sortBy === 'a-z' || sortBy === 'top-rated' || !!normalizedSearchQuery;

          const [destinationRowsRes, eventRowsRes] = await Promise.all([
            destinationService.getDestinationsForDiscovery(destinationFilters),
            eventService.getEvents({
              search: normalizedSearchQuery || undefined,
              category: selectedCategory !== 'all' ? selectedCategory : undefined,
              status: eventStatusFilter,
              freeOnly: priceFilter === 'free' ? true : undefined,
              minPrice: priceFilter === 'paid' ? 0.01 : undefined,
              startFrom: dateRange.startFrom,
              endTo: dateRange.endTo,
              limit: DISCOVERY_PAGE_SIZE,
              offset: nextEventOffset,
              orderBy: eventOrderBy,
              ascending: eventAscending,
            }),
          ]);

          destinationRows = destinationRowsRes;
          eventRows = eventRowsRes;
        }

        let nextAttractions = destinationRows;
        let nextEvents = eventRows;
        const nextDistanceByKey: Record<string, number> = {};

        if (nearbyOnly) {
          if (!effectiveTargetLocation) {
            if (requestSeq !== loadRequestSeqRef.current) return;
            if (!append) {
              setAttractions([]);
              setEvents([]);
              setDistanceByKey({});
            }
            setErrorMessage(t('explore.error.nearbyRequiresLocation'));
            return;
          }

          const filteredAttractions = await Promise.all(
            destinationRows.map(async (row) => {
              const coords = await resolveEntityCoords(row);
              if (!coords) return null;

              const meters = getHaversineDistance(
                effectiveTargetLocation.latitude,
                effectiveTargetLocation.longitude,
                coords.latitude,
                coords.longitude
              );

              if (!Number.isFinite(meters) || meters >= NEARBY_RADIUS_METERS) return null;

              return {
                row,
                meters,
                key: `destination:${String(row.id)}`,
              };
            })
          );

          const filteredEvents = await Promise.all(
            eventRows.map(async (row) => {
              const coords = await resolveEntityCoords(row);
              if (!coords) return null;

              const meters = getHaversineDistance(
                effectiveTargetLocation.latitude,
                effectiveTargetLocation.longitude,
                coords.latitude,
                coords.longitude
              );

              if (!Number.isFinite(meters) || meters >= NEARBY_RADIUS_METERS) return null;

              return {
                row,
                meters,
                key: `event:${String(row.id)}`,
              };
            })
          );

          nextAttractions = filteredAttractions.filter(Boolean).map((item) => (item as any).row);
          nextEvents = filteredEvents.filter(Boolean).map((item) => (item as any).row);

          for (const item of [...filteredAttractions, ...filteredEvents]) {
            if (!item) continue;
            nextDistanceByKey[(item as any).key] = (item as any).meters;
          }
        }

        if (requestSeq !== loadRequestSeqRef.current) return;

        if (append) {
          setAttractions((prev) => [...prev, ...nextAttractions]);
          setEvents((prev) => [...prev, ...nextEvents]);
          setDistanceByKey((prev) => (nearbyOnly ? { ...prev, ...nextDistanceByKey } : prev));
        } else {
          setAttractions(nextAttractions);
          setEvents(nextEvents);
          setDistanceByKey(nearbyOnly ? nextDistanceByKey : {});
        }

        const loadedDestinationCount = destinationRows.length;
        const loadedEventCount = eventRows.length;

        if (useAiSmartSearch) {
          setDestinationOffset(loadedDestinationCount);
          setEventOffset(0);
          setHasMoreAttractions(false);
          setHasMoreEvents(false);
        } else {
          setDestinationOffset(nextDestinationOffset + loadedDestinationCount);
          setEventOffset(nextEventOffset + loadedEventCount);
          setHasMoreAttractions(loadedDestinationCount >= DISCOVERY_PAGE_SIZE);
          setHasMoreEvents(loadedEventCount >= DISCOVERY_PAGE_SIZE);
        }

        hasLoadedInitialRef.current = true;
      } catch (err: any) {
        if (requestSeq !== loadRequestSeqRef.current) return;
        const msg = err?.message ?? t('explore.error.loadResults');
        setErrorMessage(msg);
      } finally {
        if (requestSeq !== loadRequestSeqRef.current) return;
        if (showSpinner) setLoading(false);
        if (append) setLoadingMore(false);
      }
    },
    [
      effectiveTargetLocation,
      eventDateFilter,
      eventStatusFilter,
      aiSmartSearchEnabled,
      nearbyOnly,
      priceFilter,
      ratingFilter,
      submittedSearchQuery,
      selectedCategory,
      selectedCategoryId,
      sortBy,
      t,
    ]
  );

  useEffect(() => {
    hasLoadedInitialRef.current = false;
    setDestinationOffset(0);
    setEventOffset(0);
    setHasMoreAttractions(true);
    setHasMoreEvents(true);
    void loadDiscovery({
      showSpinner: true,
      append: false,
      destinationOffset: 0,
      eventOffset: 0,
    });
  }, [loadDiscovery, searchNonce]);

  const onRefresh = useCallback(() => {
    hasLoadedInitialRef.current = false;
    setDestinationOffset(0);
    setEventOffset(0);
    setHasMoreAttractions(true);
    setHasMoreEvents(true);
    void loadDiscovery({
      showSpinner: false,
      append: false,
      destinationOffset: 0,
      eventOffset: 0,
    });
  }, [loadDiscovery]);

  const onResetFilters = useCallback(() => {
    setSearchQuery('');
    setSubmittedSearchQuery('');
    setSearchNonce((prev) => prev + 1);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedCategory('all');
    setEventDateFilter('all');
    setEventStatusFilter('all');
    setRatingFilter(null);
    setPriceFilter('all');
    setSortBy('relevance');
    setNearbyOnly(false);
  }, []);

  const onMaybePreloadNextPage = useCallback(() => {
    if (!hasLoadedInitialRef.current) return;
    if (loading || loadingMore) return;
    if (errorMessage) return;
    if (aiSmartSearchEnabled && !!submittedSearchQuery.trim()) return; //Nếu có đk, nâng cấp lên realtime nếu thoải mái được request từ model
    if (!hasMoreAttractions && !hasMoreEvents) return;

    void loadDiscovery({
      showSpinner: false,
      append: true,
      destinationOffset,
      eventOffset,
    });
  }, [destinationOffset, errorMessage, eventOffset, hasMoreAttractions, hasMoreEvents, loadDiscovery, loading, loadingMore, aiSmartSearchEnabled, submittedSearchQuery]);

  const executeSmartSearch = useCallback((eventOrText?: NativeSyntheticEvent<TextInputSubmitEditingEventData> | string) => {
    if (isLoading) return;

    const nextText =
      typeof eventOrText === 'string'
        ? eventOrText
        : (eventOrText?.nativeEvent?.text ?? searchQuery);
    const nextQuery = nextText.trim();

    setSearchQuery(nextText);
    setSubmittedSearchQuery(nextQuery);
    setShowSuggestions(false);
    setSearchNonce((prev) => prev + 1);
  }, [isLoading, searchQuery]);

  const onPickSuggestion = useCallback((item: DiscoverySearchSuggestion) => {
    executeSmartSearch(item.label);
  }, [executeSmartSearch]);

  const applyManualLocation = useCallback(async () => {
    const text = manualInput.trim();
    if (!text) {
      addNotification({
        message: t('explore.manualLocation.enterPrompt'),
        type: 'warning',
      });
      return;
    }

    setResolvingManualLocation(true);
    try {
      const coords = await geocodeLocationText(text);
      if (!coords) {
        addNotification({
          message: t('explore.manualLocation.resolveFailed'),
          type: 'error',
        });
        return;
      }

      setManualLocation({ text, coords });
      setUseManualLocation(true);
      addNotification({
        message: t('explore.manualLocation.updated'),
        type: 'success',
      });
    } finally {
      setResolvingManualLocation(false);
    }
  }, [addNotification, manualInput, setManualLocation, setUseManualLocation, t]);

  const useGpsLocation = useCallback(() => {
    setUseManualLocation(false);
    addNotification({
      message: t('explore.manualLocation.switchedToGps'),
      type: 'info',
    });
  }, [addNotification, setUseManualLocation, t]);

  const clearManual = useCallback(() => {
    clearManualLocation();
    setManualInput('');
    addNotification({
      message: t('explore.manualLocation.cleared'),
      type: 'info',
    });
  }, [addNotification, clearManualLocation, t]);

  const onCreateEvent = useCallback(
    async (form: EventFormData) => {
      const start = combineLocalDateTime(form.startDate, form.startTime);
      const end = combineLocalDateTime(form.endDate, form.endTime);

      if (!start || !end) {
        Alert.alert(t('events.form.error.invalidDateTimeTitle'), t('events.form.error.invalidDateTimeMessage'));
        throw new Error('Invalid datetime format');
      }

      if (end <= start) {
        Alert.alert(t('events.form.error.invalidDateTimeTitle'), t('events.form.error.endAfterStart'));
        throw new Error('end_time must be greater than start_time');
      }

      const price = Number(form.price || '0');
      if (Number.isNaN(price) || price < 0) {
        Alert.alert(t('events.form.error.invalidPriceTitle'), t('events.form.error.invalidPriceMessage'));
        throw new Error('Invalid price');
      }

      try {
        await eventService.createEventForCurrentUser({
          title: form.title,
          category: form.category,
          location: form.location,
          start_time: start,
          end_time: end,
          price,
          image_url: form.imageUrl.trim() ? form.imageUrl.trim() : null,
          description: form.description.trim() ? form.description.trim() : null,
        });

        setShowCreateModal(false);
        addNotification({
          message: t('events.form.createdSuccess'),
          type: 'success',
        });
        hasLoadedInitialRef.current = false;
        setDestinationOffset(0);
        setEventOffset(0);
        setHasMoreAttractions(true);
        setHasMoreEvents(true);
        await loadDiscovery({
          showSpinner: false,
          append: false,
          destinationOffset: 0,
          eventOffset: 0,
        });
      } catch (err: any) {
        const message = String(err?.message ?? t('events.form.error.createFailedMessage'));
        const lower = message.toLowerCase();

        if (lower.includes('not authenticated')) {
          Alert.alert(t('common.loginRequiredTitle'), t('explore.auth.createEventLoginRequired'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.login'), onPress: () => router.push('/login' as any) },
          ]);
          throw err;
        }

        Alert.alert(t('events.form.error.createFailedTitle'), message);
        throw err;
      }
    },
    [addNotification, loadDiscovery, t]
  );

  const onOpenDestination = useCallback((row: DestinationDiscoveryRow) => {
    router.push({
      pathname: '/destination/[id]' as any,
      params: {
        id: String(row.id),
        name: row.name,
        location: row.location ?? '',
        price: String(row.price ?? ''),
        rating: typeof row.rating === 'number' ? String(row.rating) : '',
        imageUrl: row.image_url ?? FALLBACK_DESTINATION_IMAGE,
      },
    } as any);
  }, []);

  const onOpenEvent = useCallback((row: EventRow) => {
    router.push(`/event/${row.id}` as any);
  }, []);

  const isFiltered =
    !!submittedSearchQuery ||
    aiSmartSearchEnabled ||
    selectedCategory !== 'all' ||
    eventDateFilter !== 'all' ||
    eventStatusFilter !== 'all' ||
    ratingFilter !== null ||
    priceFilter !== 'all' ||
    sortBy !== 'relevance' ||
    nearbyOnly;

  const isAiSearchActive = aiSmartSearchEnabled && !!submittedSearchQuery.trim();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={['explore-root']}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={PRELOAD_SCROLL_THRESHOLD}
        onEndReached={onMaybePreloadNextPage}
        renderItem={() => (
          <>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.title }]}>{t('explore.title')}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{t('explore.subtitle')}</Text>
          </View>

          <Pressable
            onPress={() => setShowCreateModal(true)}
            style={({ pressed }) => [styles.createBtn, pressed ? { opacity: 0.84 } : null]}
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color="#001018" />
            <Text style={styles.createBtnText}>{t('explore.createEvent')}</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.title }]}>{t('explore.search.label')}</Text>
          <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
            <Feather name="search" size={16} color={colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={executeSmartSearch}
              placeholder={t('explore.search.placeholder')}
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              editable={!isLoading}
            />
            {!!searchQuery ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setSubmittedSearchQuery('');
                  setSearchNonce((prev) => prev + 1);
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
                disabled={isLoading}
                accessibilityRole="button"
              >
                <Feather name="x" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
            <TouchableOpacity
              onPress={() => executeSmartSearch()}
              disabled={isLoading}
              activeOpacity={0.84}
              style={[
                styles.searchSubmitBtn,
                isLoading ? { opacity: 0.6 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('explore.search.label')}
            >
              <Feather name="arrow-right" size={16} color="#001018" />
            </TouchableOpacity>
          </View>

          <View style={styles.aiToggleRow}>
            <Pressable
              onPress={() => setAiSmartSearchEnabled((prev) => !prev)}
              style={({ pressed }) => [
                styles.aiToggleButton,
                { borderColor: colors.border, backgroundColor: colors.inputBg },
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.aiToggleLabel, { color: colors.title }]}>{t('explore.search.aiToggle')}</Text>
              <View style={[styles.aiToggleStatus, aiSmartSearchEnabled ? styles.aiToggleStatusOn : styles.aiToggleStatusOff]}>
                <Text style={[styles.aiToggleStatusText, { color: aiSmartSearchEnabled ? '#001018' : colors.text }]}>
                  {aiSmartSearchEnabled ? t('common.on') : t('common.off')}
                </Text>
              </View>
            </Pressable>

            <Text style={[styles.aiToggleHint, { color: colors.muted }]}>
              {aiSmartSearchEnabled ? t('explore.search.aiHintOn') : t('explore.search.aiHintOff')}
            </Text>
          </View>

          {showSuggestions && suggestions.length > 0 ? (
            <View style={[styles.suggestionList, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              {suggestions.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onPickSuggestion(item)}
                  style={({ pressed }) => [styles.suggestionItem, pressed ? { opacity: 0.84 } : null]}
                  accessibilityRole="button"
                >
                  <Feather name={item.type === 'destination' ? 'map-pin' : 'calendar'} size={14} color={ExploreEaseColors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.suggestionTitle, { color: colors.title }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {!!item.subtitle ? (
                      <Text style={[styles.suggestionSubtitle, { color: colors.muted }]} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.suggestionTag, { color: colors.muted }]}>
                    {item.type === 'destination' ? t('explore.suggestion.attraction') : t('explore.suggestion.event')}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 4 }}>
            <View style={styles.chipRow}>
              <FilterChip
                selected={nearbyOnly}
                label={t('explore.filter.nearbyChip')}
                onPress={() => setNearbyOnly((prev) => !prev)}
              />
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.title }]}>{t('explore.targetLocation.title')}</Text>

          <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
            <Feather name="map-pin" size={16} color={colors.muted} />
            <TextInput
              value={manualInput}
              onChangeText={setManualInput}
              placeholder={t('explore.targetLocation.placeholder')}
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text }]}
              autoCorrect={false}
            />
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => void applyManualLocation()}
              disabled={resolvingManualLocation || !manualInput.trim()}
              style={({ pressed }) => [
                styles.outlineBtn,
                { borderColor: colors.border },
                (resolvingManualLocation || !manualInput.trim()) ? { opacity: 0.5 } : null,
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              {resolvingManualLocation ? (
                <ActivityIndicator color={ExploreEaseColors.primary} size="small" />
              ) : (
                <Text style={[styles.outlineBtnText, { color: colors.text }]}>{t('explore.targetLocation.setManual')}</Text>
              )}
            </Pressable>

            <Pressable
              onPress={useGpsLocation}
              style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Text style={[styles.outlineBtnText, { color: colors.text }]}>{t('explore.targetLocation.useGps')}</Text>
            </Pressable>

            <Pressable
              onPress={clearManual}
              style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Text style={[styles.outlineBtnText, { color: colors.text }]}>{t('explore.targetLocation.clear')}</Text>
            </Pressable>
          </View>

          <View style={styles.targetInfoRow}>
            <Feather name={isManualLocationEnabled ? 'crosshair' : 'navigation'} size={14} color={ExploreEaseColors.primary} />
            <Text style={[styles.targetInfoText, { color: colors.muted }]}>
              {isManualLocationEnabled
                ? t('explore.targetLocation.manualLabel', { location: manualLocationText || t('explore.targetLocation.notSet') })
                : (gpsLocation ? t('explore.targetLocation.usingGps') : (isLoadingGps ? t('explore.targetLocation.detectingGps') : t('explore.targetLocation.gpsUnavailable')))}
            </Text>
          </View>

          {!isManualLocationEnabled && !!gpsErrorMsg ? (
            <Text style={[styles.helperErrorText, { color: '#ef4444' }]}>{gpsErrorMsg}</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.filterHeaderRow}>
            <Text style={[styles.label, { color: colors.title }]}>{t('explore.filter.title')}</Text>
            {isFiltered ? (
              <Pressable onPress={onResetFilters} accessibilityRole="button">
                <Text style={[styles.resetText, { color: ExploreEaseColors.primary }]}>{t('common.reset')}</Text>
              </Pressable>
            ) : null}
          </View>

          <FilterSection label={t('explore.filter.category')} color={colors.title}>
            {categoryOptions.map((value) => (
              <FilterChip
                key={value}
                selected={selectedCategory.toLowerCase() === value.toLowerCase()}
                label={value === 'all' ? t('common.all') : value}
                onPress={() => setSelectedCategory(value)}
              />
            ))}
          </FilterSection>

          <FilterSection label={t('explore.filter.rating')} color={colors.title}>
            <FilterChip selected={ratingFilter === null} label={t('common.all')} onPress={() => setRatingFilter(null)} />
            <FilterChip selected={ratingFilter === 4} label="4.0+" onPress={() => setRatingFilter(4)} />
            <FilterChip selected={ratingFilter === 4.5} label="4.5+" onPress={() => setRatingFilter(4.5)} />
          </FilterSection>

          <FilterSection label={t('explore.filter.price')} color={colors.title}>
            <FilterChip selected={priceFilter === 'all'} label={t('common.all')} onPress={() => setPriceFilter('all')} />
            <FilterChip selected={priceFilter === 'free'} label={t('common.free')} onPress={() => setPriceFilter('free')} />
            <FilterChip selected={priceFilter === 'paid'} label={t('common.paid')} onPress={() => setPriceFilter('paid')} />
          </FilterSection>

          <FilterSection label={t('explore.filter.eventDate')} color={colors.title}>
            <FilterChip selected={eventDateFilter === 'all'} label={t('common.all')} onPress={() => setEventDateFilter('all')} />
            <FilterChip selected={eventDateFilter === 'today'} label={t('explore.filter.today')} onPress={() => setEventDateFilter('today')} />
            <FilterChip
              selected={eventDateFilter === 'next-7-days'}
              label={t('explore.filter.next7Days')}
              onPress={() => setEventDateFilter('next-7-days')}
            />
            <FilterChip
              selected={eventDateFilter === 'this-month'}
              label={t('explore.filter.thisMonth')}
              onPress={() => setEventDateFilter('this-month')}
            />
          </FilterSection>

          <FilterSection label={t('explore.filter.eventStatus')} color={colors.title}>
            <FilterChip selected={eventStatusFilter === 'all'} label={t('common.all')} onPress={() => setEventStatusFilter('all')} />
            <FilterChip
              selected={eventStatusFilter === 'incoming'}
              label={t('event.status.incoming')}
              onPress={() => setEventStatusFilter('incoming')}
            />
            <FilterChip
              selected={eventStatusFilter === 'ongoing'}
              label={t('event.status.ongoing')}
              onPress={() => setEventStatusFilter('ongoing')}
            />
            <FilterChip
              selected={eventStatusFilter === 'completed'}
              label={t('event.status.completed')}
              onPress={() => setEventStatusFilter('completed')}
            />
          </FilterSection>

          <FilterSection label={t('explore.filter.sort')} color={colors.title}>
            <FilterChip selected={sortBy === 'relevance'} label={t('explore.sort.relevance')} onPress={() => setSortBy('relevance')} />
            <FilterChip selected={sortBy === 'top-rated'} label={t('explore.sort.topRated')} onPress={() => setSortBy('top-rated')} />
            <FilterChip selected={sortBy === 'a-z'} label={t('explore.sort.alphabetical')} onPress={() => setSortBy('a-z')} />
          </FilterSection>

        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={ExploreEaseColors.primary} />
            <Text style={[styles.stateText, { color: colors.muted }]}>{t('explore.loadingResults')}</Text>
          </View>
        ) : null}

        {!loading && !!errorMessage ? (
          <View style={styles.stateWrap}>
            <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage}</Text>
            <Pressable onPress={onRefresh} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('explore.attractions', { count: attractions.length })}</Text>
            </View>

            {attractions.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('explore.noAttractions')}</Text>
            ) : (
              attractions.map((item) => {
                const key = `destination:${String(item.id)}`;
                const distanceMeters = distanceByKey[key];

                return (
                  <Pressable
                    key={key}
                    onPress={() => onOpenDestination(item)}
                    style={({ pressed }) => [
                      styles.resultCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      pressed ? { opacity: 0.86 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <View style={styles.resultImageWrap}>
                      <ImageBackground
                        source={{ uri: item.image_url || FALLBACK_DESTINATION_IMAGE }}
                        style={styles.resultImage}
                        imageStyle={styles.resultImageStyle}
                        resizeMode="cover"
                      >
                        <View style={styles.resultImageOverlay} />
                        <View style={styles.resultImageInner}>
                          <Text style={styles.resultTag}>{toCategoryName(item)}</Text>
                        </View>
                        <View style={[styles.resultImageBase, { backgroundColor: 'rgba(34, 211, 238, 0.18)' }]}>
                          <Text style={{ color: '#001018', fontWeight: '900', fontSize: 11 }}>{t('explore.suggestion.attraction')}</Text>
                        </View>
                      </ImageBackground>
                    </View>

                    <View style={styles.resultBody}>
                      <Text style={[styles.resultTitle, { color: colors.title }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
                        {item.location || t('common.unknownLocation')}
                      </Text>
                      <View style={styles.resultBottomRow}>
                        <Text style={[styles.resultPrice, { color: ExploreEaseColors.primary }]}>{formatDestinationPriceText(item.price)}</Text>
                        <View style={styles.inlineMetaRow}>
                          {typeof item.rating === 'number' ? (
                            <Text style={[styles.resultMeta, { color: colors.muted }]}>
                              {t('explore.meta.ratingWithStar', { rating: item.rating.toFixed(1) })}
                            </Text>
                          ) : null}
                          {typeof distanceMeters === 'number' ? (
                            <Text style={[styles.resultMeta, { color: colors.muted }]}>
                              {t('explore.meta.distanceWithBullet', { distance: formatDistance(distanceMeters) })}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('explore.events', { count: events.length })}</Text>
              <Pressable onPress={() => setShowCreateModal(true)} accessibilityRole="button">
                <Text style={{ color: ExploreEaseColors.primary, fontWeight: '800', fontSize: 12 }}>{t('explore.createEvent')}</Text>
              </Pressable>
            </View>

            {events.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {isAiSearchActive ? t('explore.search.aiNoEvents') : t('explore.noEvents')}
              </Text>
            ) : (
              events.map((item) => {
                const key = `event:${String(item.id)}`;
                const distanceMeters = distanceByKey[key];

                return (
                  <View
                    key={key}
                    style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.resultImageWrap}>
                      <ImageBackground
                        source={{ uri: item.image_url || FALLBACK_EVENT_IMAGE }}
                        style={styles.resultImage}
                        imageStyle={styles.resultImageStyle}
                        resizeMode="cover"
                      >
                        <View style={styles.resultImageOverlay} />
                        <View style={styles.resultImageInner}>
                          <Text style={styles.resultTag}>{item.category || t('explore.suggestion.event')}</Text>
                        </View>
                        <View style={[styles.resultImageBase, { backgroundColor: 'rgba(34, 211, 238, 0.18)' }]}>
                          <Text style={{ color: '#001018', fontWeight: '900', fontSize: 11 }}>{t('explore.suggestion.event')}</Text>
                        </View>
                      </ImageBackground>
                    </View>

                    <View style={styles.resultBody}>
                      <Text style={[styles.resultTitle, { color: colors.title }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
                        {item.location || t('common.unknownLocation')}
                      </Text>
                      <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
                        {formatDateTimeText(item.start_time)}
                      </Text>
                      <View style={styles.resultBottomRow}>
                        <Text style={[styles.resultPrice, { color: ExploreEaseColors.primary }]}>{formatEventPriceText(item.price)}</Text>
                        <View style={styles.inlineMetaRow}>
                          <Text style={[styles.resultMeta, { color: colors.muted }]}>
                            {getEventStatusLabel(item.status)}
                          </Text>
                          {typeof distanceMeters === 'number' ? (
                            <Text style={[styles.resultMeta, { color: colors.muted }]}>
                              {t('explore.meta.distanceWithBullet', { distance: formatDistance(distanceMeters) })}
                            </Text>
                          ) : null}
                          <Pressable onPress={() => onOpenEvent(item)} style={styles.viewBtn} accessibilityRole="button">
                            <Text style={styles.viewBtnText}>{t('common.view')}</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {loadingMore ? (
              <View style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.resultMeta, { color: colors.muted }]}>{t('explore.loadingMore')}</Text>
              </View>
            ) : null}

            {!loadingMore && hasLoadedInitialRef.current && !hasMoreAttractions && !hasMoreEvents ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>{t('explore.endOfResults')}</Text>
            ) : null}
          </>
        ) : null}
          </>
        )}
      />

            <Modal
              visible={showCreateModal}
              animationType="slide"
              transparent={false}
              onRequestClose={() => setShowCreateModal(false)}
            >
              <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
                <CreateEventForm
                  onCancel={() => setShowCreateModal(false)}
                  onSubmit={onCreateEvent}
                />
              </SafeAreaView>
            </Modal>
          </SafeAreaView>
        );
      }

      type FilterSectionProps = {
        label: string;
        color: string;
        children: React.ReactNode;
      };

      function FilterSection({ label, color, children }: FilterSectionProps) {
        return (
          <View style={{ marginTop: 2 }}>
            <Text style={{ color, fontSize: 12, fontWeight: '800', marginBottom: 8 }}>{label}</Text>
            <View style={styles.chipRow}>{children}</View>
          </View>
        );
      }

      type FilterChipProps = {
        label: string;
        selected: boolean;
        onPress: () => void;
      };

      function FilterChip({ label, selected, onPress }: FilterChipProps) {
        return (
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [
              styles.chip,
              selected ? styles.chipSelected : styles.chipIdle,
              pressed ? { opacity: 0.84 } : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, selected ? styles.chipTextSelected : styles.chipTextIdle]}>{label}</Text>
          </Pressable>
        );
      }

      const styles = StyleSheet.create({
        safe: { flex: 1 },
        content: {
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 120,
          gap: 12,
        },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        },
        headerTitle: {
          fontSize: 30,
          lineHeight: 36,
          fontWeight: '900',
        },
        headerSubtitle: {
          marginTop: 4,
          fontSize: 13,
          fontWeight: '600',
        },
        createBtn: {
          minHeight: 36,
          borderRadius: 999,
          backgroundColor: ExploreEaseColors.primary,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          justifyContent: 'center',
        },
        createBtnText: {
          color: '#001018',
          fontSize: 12,
          fontWeight: '900',
        },
        card: {
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          gap: 8,
        },
        label: {
          fontSize: 13,
          fontWeight: '800',
        },
        searchWrap: {
          minHeight: 44,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        searchInput: {
          flex: 1,
          fontSize: 14,
          paddingVertical: 10,
        },
        searchSubmitBtn: {
          minWidth: 32,
          minHeight: 32,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ExploreEaseColors.primary,
        },
        suggestionList: {
          borderWidth: 1,
          borderRadius: 12,
          overflow: 'hidden',
        },
        suggestionItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(148,163,184,0.20)',
        },
        suggestionTitle: {
          fontSize: 13,
          fontWeight: '800',
        },
        suggestionSubtitle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 1,
        },
        suggestionTag: {
          fontSize: 10,
          fontWeight: '700',
        },
        aiToggleRow: {
          marginTop: 4,
          gap: 6,
        },
        aiToggleButton: {
          minHeight: 40,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        aiToggleLabel: {
          flex: 1,
          fontSize: 12,
          fontWeight: '800',
        },
        aiToggleStatus: {
          minWidth: 54,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          alignItems: 'center',
          justifyContent: 'center',
        },
        aiToggleStatusOn: {
          backgroundColor: ExploreEaseColors.primary,
        },
        aiToggleStatusOff: {
          backgroundColor: 'rgba(148,163,184,0.25)',
        },
        aiToggleStatusText: {
          fontSize: 11,
          fontWeight: '900',
        },
        aiToggleHint: {
          fontSize: 11,
          fontWeight: '600',
          lineHeight: 16,
          paddingHorizontal: 2,
        },
        actionsRow: {
          flexDirection: 'row',
          gap: 8,
        },
        outlineBtn: {
          flex: 1,
          minHeight: 38,
          borderRadius: 10,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
        },
        outlineBtnText: {
          fontSize: 12,
          fontWeight: '700',
        },
        targetInfoRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 2,
        },
        targetInfoText: {
          flex: 1,
          fontSize: 12,
          fontWeight: '600',
        },
        helperErrorText: {
          marginTop: 2,
          fontSize: 11,
          fontWeight: '700',
        },
        filterHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        resetText: {
          fontSize: 12,
          fontWeight: '800',
        },
        chipRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        chip: {
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
        },
        chipSelected: {
          backgroundColor: ExploreEaseColors.primary,
          borderColor: ExploreEaseColors.primary,
        },
        chipIdle: {
          backgroundColor: 'rgba(148,163,184,0.10)',
          borderColor: 'rgba(148,163,184,0.26)',
        },
        chipText: {
          fontSize: 12,
          fontWeight: '700',
        },
        chipTextSelected: {
          color: '#001018',
        },
        chipTextIdle: {
          color: '#64748b',
        },
        stateWrap: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 30,
          gap: 10,
        },
        stateText: {
          fontSize: 13,
          fontWeight: '700',
          textAlign: 'center',
        },
        retryBtn: {
          marginTop: 4,
          minHeight: 34,
          minWidth: 86,
          borderRadius: 8,
          backgroundColor: ExploreEaseColors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        retryBtnText: {
          color: '#001018',
          fontSize: 12,
          fontWeight: '900',
        },
        sectionHead: {
          marginTop: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: '900',
        },
        emptyText: {
          fontSize: 13,
          fontWeight: '600',
        },
        resultCard: {
          borderWidth: 1,
          borderRadius: 14,
          overflow: 'hidden',
        },
        resultImageWrap: {
          height: 92,
          backgroundColor: 'rgba(34, 211, 238, 0.12)',
          justifyContent: 'space-between',
        },
        resultImage: {
          flex: 1,
          justifyContent: 'space-between',
        },
        resultImageStyle: {
          width: '100%',
          height: '100%',
        },
        resultImageOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.18)',
        },
        resultImageInner: {
          padding: 10,
        },
        resultTag: {
          alignSelf: 'flex-start',
          backgroundColor: ExploreEaseColors.primary,
          color: '#001018',
          fontSize: 10,
          fontWeight: '900',
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: 999,
          overflow: 'hidden',
        },
        resultImageBase: {
          alignSelf: 'flex-start',
          margin: 10,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
        },
        resultBody: {
          paddingHorizontal: 12,
          paddingVertical: 11,
          gap: 4,
        },
        resultTitle: {
          fontSize: 15,
          lineHeight: 20,
          fontWeight: '900',
        },
        resultMeta: {
          fontSize: 12,
          fontWeight: '600',
        },
        resultBottomRow: {
          marginTop: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        resultPrice: {
          fontSize: 13,
          fontWeight: '900',
        },
        inlineMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        viewBtn: {
          minHeight: 28,
          borderRadius: 7,
          backgroundColor: ExploreEaseColors.primary,
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
        },
        viewBtnText: {
          color: '#001018',
          fontSize: 11,
          fontWeight: '900',
        },
      });
