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
    type NearbyTopRatedRow,
    type PersonalizedRecommendationRow,
    type SmartSearchLocalizationSource,
} from '@/src/services/destinationService';
import { eventService, type EventRow, type EventStatus } from '@/src/services/eventService';
import { storageService } from '@/src/services/storageService';
import { supabase } from '@/src/services/supabase';
import { useLanguageStore } from '@/src/store/useLanguageStore';
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
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    ImageBackground,
    Keyboard,
    LayoutAnimation,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TextInputSubmitEditingEventData,
    TouchableOpacity,
    UIManager,
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

type ExploreCategoryValue = 'all' | 'Cuisines' | 'Landmarks' | 'Activities';

type ExploreCategoryChip = {
  label: string;
  value: ExploreCategoryValue;
};

const EXPLORE_CATEGORY_CHIPS: ExploreCategoryChip[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Ẩm thực 🍜', value: 'Cuisines' },
  { label: 'Tham quan 🏛️', value: 'Landmarks' },
  { label: 'Hoạt động 🎢', value: 'Activities' },
];

const DISCOVERY_PAGE_SIZE = 10;
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


export default function ExploreScreen() {
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const { t: smartSearchT } = useTranslation('smartSearch');
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
  const [smartSearchLocalizationSource, setSmartSearchLocalizationSource] = useState<SmartSearchLocalizationSource>('default');
  const [suggestions, setSuggestions] = useState<DiscoverySearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const lastAppliedRouteQueryRef = useRef<string>('');

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ExploreCategoryValue>('all');
  const [eventDateFilter, setEventDateFilter] = useState<EventDateFilter>('all');
  const [eventStatusFilter, setEventStatusFilter] = useState<EventStatus | 'all'>('all');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [priceFilter, setPriceFilter] = useState<DiscoveryPriceFilter>('all');
  const [sortBy, setSortBy] = useState<DiscoverySortOption>('relevance');
  const [nearbyOnly, setNearbyOnly] = useState(false);

  const [attractions, setAttractions] = useState<DestinationDiscoveryRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventCreatorProfiles, setEventCreatorProfiles] = useState<Record<string, { fullName: string; avatarUrl: string | null }>>({});
  const [distanceByKey, setDistanceByKey] = useState<Record<string, number>>({});

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [eventOffset, setEventOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedInitialRef = useRef(false);
  const loadRequestSeqRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [personalizedRecommendations, setPersonalizedRecommendations] = useState<PersonalizedRecommendationRow[]>([]);
  const [loadingPersonalizedRecommendations, setLoadingPersonalizedRecommendations] = useState(true);
  const [personalizedErrorMessage, setPersonalizedErrorMessage] = useState<string | null>(null);
  const [personalizedRequiresLogin, setPersonalizedRequiresLogin] = useState(false);
  const [fallbackInterestRecommendations, setFallbackInterestRecommendations] = useState<DestinationDiscoveryRow[]>([]);
  const [loadingFallbackRecommendations, setLoadingFallbackRecommendations] = useState(false);
  const personalizedRequestSeqRef = useRef(0);
  const [nearbyTopRatedRows, setNearbyTopRatedRows] = useState<NearbyTopRatedRow[]>([]);
  const [loadingNearbyTopRated, setLoadingNearbyTopRated] = useState(true);
  const [nearbyTopRatedErrorMessage, setNearbyTopRatedErrorMessage] = useState<string | null>(null);
  const [nearbyTopRatedPermissionDenied, setNearbyTopRatedPermissionDenied] = useState(false);
  const nearbyTopRatedRequestSeqRef = useRef(0);
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

  const isGpsPermissionDenied = useMemo(() => {
    const message = String(gpsErrorMsg ?? '').trim().toLowerCase();
    if (!message) return false;

    return (
      message.includes('từ chối') ||
      message.includes('denied') ||
      message.includes('permission')
    );
  }, [gpsErrorMsg]);

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
    setSmartSearchLocalizationSource('default');
    setShowSuggestions(false);
    setSearchNonce((prev) => prev + 1);
  }, [incomingRouteQuery]);

  useEffect(() => {
    setManualInput(manualLocationText);
  }, [manualLocationText]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!UIManager.setLayoutAnimationEnabledExperimental) return;
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }, []);

  const effectiveTargetLocation = useMemo(
    () =>
      getEffectiveTargetLocation({
        gpsLocation,
        useManualLocation: isManualLocationEnabled,
        manualLocationCoords,
      }),
    [gpsLocation, isManualLocationEnabled, manualLocationCoords]
  );

  const selectedCategoryName = selectedCategory === 'all' ? null : selectedCategory;
  const showDefaultExploreSections = selectedCategory === 'all';

  const selectedCategoryId = useMemo(() => {
    if (!selectedCategoryName) return null;
    const hit = categories.find((c) => c.name.toLowerCase() === selectedCategoryName.toLowerCase());
    return hit?.id ?? null;
  }, [categories, selectedCategoryName]);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const destinationRows = await destinationService.getCategories();

        if (cancelled) return;

        const mapped: CategoryRow[] = (destinationRows ?? [])
          .map((row: any) => ({ id: row.id, name: String(row.name ?? '').trim() }))
          .filter((row: CategoryRow) => !!row.name);

        setCategories(mapped);
      } catch {
        if (cancelled) return;
        setCategories([]);
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const creatorIds = Array.from(
      new Set(
        events
          .map((item) => String(item.creator_id ?? '').trim())
          .filter(Boolean)
      )
    );

    if (creatorIds.length === 0) {
      setEventCreatorProfiles({});
      return () => {
        cancelled = true;
      };
    }

    const loadCreatorProfiles = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', creatorIds);

      if (cancelled) return;

      if (error) {
        console.warn('load creator profiles failed:', error.message);
        setEventCreatorProfiles({});
        return;
      }

      const nextMap: Record<string, { fullName: string; avatarUrl: string | null }> = {};
      for (const row of data ?? []) {
        const id = String((row as any)?.id ?? '').trim();
        if (!id) continue;

        nextMap[id] = {
          fullName: String((row as any)?.full_name ?? '').trim(),
          avatarUrl: ((row as any)?.avatar_url ?? null) as string | null,
        };
      }

      setEventCreatorProfiles(nextMap);
    };

    void loadCreatorProfiles();

    return () => {
      cancelled = true;
    };
  }, [events]);

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

  const loadPersonalizedRecommendations = useCallback(async () => {
    const requestSeq = ++personalizedRequestSeqRef.current;

    setLoadingPersonalizedRecommendations(true);
    setLoadingFallbackRecommendations(false);
    setPersonalizedErrorMessage(null);
    setPersonalizedRequiresLogin(false);
    setFallbackInterestRecommendations([]);

    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = String(userRes.user?.id ?? '').trim();
      if (!userId) {
        if (requestSeq !== personalizedRequestSeqRef.current) return;
        setPersonalizedRecommendations([]);
        setPersonalizedRequiresLogin(true);
        setFallbackInterestRecommendations([]);
        return;
      }

      const rows = await destinationService.getPersonalizedRecommendations(userId, 8);
      if (requestSeq !== personalizedRequestSeqRef.current) return;

      if (rows.length > 0) {
        setPersonalizedRecommendations(rows);
        setFallbackInterestRecommendations([]);
        setLoadingFallbackRecommendations(false);
      } else {
        setPersonalizedRecommendations([]);
        setLoadingFallbackRecommendations(true);

        try {
          const fallbackRowsRaw = await destinationService.getDestinationsForCurrentUserInterests(8);
          if (requestSeq !== personalizedRequestSeqRef.current) return;

          const fallbackRows = Array.isArray(fallbackRowsRaw)
            ? (fallbackRowsRaw as DestinationDiscoveryRow[])
            : [];

          const dedupedFallbackRows: DestinationDiscoveryRow[] = [];
          const seen = new Set<string>();
          for (const row of fallbackRows) {
            if (!row) continue;
            const id = String((row as any)?.id ?? '').trim();
            const name = String((row as any)?.name ?? '').trim();
            if (!id || !name) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            dedupedFallbackRows.push(row);
          }

          setFallbackInterestRecommendations(dedupedFallbackRows);
        } catch (fallbackError: any) {
          if (requestSeq !== personalizedRequestSeqRef.current) return;
          console.warn('load fallback recommendations failed:', fallbackError?.message ?? fallbackError);
          setFallbackInterestRecommendations([]);
        } finally {
          if (requestSeq !== personalizedRequestSeqRef.current) return;
          setLoadingFallbackRecommendations(false);
        }
      }

      setPersonalizedRequiresLogin(false);
    } catch (error: any) {
      if (requestSeq !== personalizedRequestSeqRef.current) return;
      console.warn('loadPersonalizedRecommendations failed:', error?.message ?? error);
      setPersonalizedRecommendations([]);
      setFallbackInterestRecommendations([]);
      setLoadingFallbackRecommendations(false);
      setPersonalizedRequiresLogin(false);
      setPersonalizedErrorMessage(String(error?.message ?? t('explore.error.loadResults')));
    } finally {
      if (requestSeq !== personalizedRequestSeqRef.current) return;
      setLoadingPersonalizedRecommendations(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPersonalizedRecommendations();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadPersonalizedRecommendations();
    });

    return () => {
      personalizedRequestSeqRef.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [loadPersonalizedRecommendations]);

  const loadNearbyTopRated = useCallback(async () => {
    const requestSeq = ++nearbyTopRatedRequestSeqRef.current;

    setLoadingNearbyTopRated(true);
    setNearbyTopRatedErrorMessage(null);
    setNearbyTopRatedPermissionDenied(false);

    if (!gpsLocation) {
      if (requestSeq !== nearbyTopRatedRequestSeqRef.current) return;

      setNearbyTopRatedRows([]);

      if (isLoadingGps) {
        return;
      }

      if (isGpsPermissionDenied) {
        setNearbyTopRatedPermissionDenied(true);
      } else if (gpsErrorMsg) {
        setNearbyTopRatedErrorMessage(String(gpsErrorMsg));
      }

      setLoadingNearbyTopRated(false);
      return;
    }

    try {
      const rows = await destinationService.getNearbyTopRated(
        gpsLocation.latitude,
        gpsLocation.longitude,
        NEARBY_RADIUS_KM
      );

      if (requestSeq !== nearbyTopRatedRequestSeqRef.current) return;
      setNearbyTopRatedRows(rows);
    } catch (error: any) {
      if (requestSeq !== nearbyTopRatedRequestSeqRef.current) return;
      setNearbyTopRatedRows([]);
      setNearbyTopRatedErrorMessage(String(error?.message ?? t('explore.error.loadResults')));
    } finally {
      if (requestSeq !== nearbyTopRatedRequestSeqRef.current) return;
      setLoadingNearbyTopRated(false);
    }
  }, [gpsErrorMsg, gpsLocation, isGpsPermissionDenied, isLoadingGps, t]);

  useEffect(() => {
    void loadNearbyTopRated();

    return () => {
      nearbyTopRatedRequestSeqRef.current += 1;
    };
  }, [loadNearbyTopRated]);

  const loadDiscovery = useCallback(
    async (input: {
      showSpinner: boolean;
      append: boolean;
      page: number;
      eventOffset: number;
    }) => {
      const { showSpinner, append, page: nextPage, eventOffset: nextEventOffset } = input;
      const nextDestinationOffset = nextPage * DISCOVERY_PAGE_SIZE;
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
        const shouldLoadEvents = selectedCategory === 'all';
        const dateRange = getEventDateRange(eventDateFilter);
        const eventOrderBy: 'start_time' | 'created_at' | 'title' =
          sortBy === 'a-z' ? 'title' : sortBy === 'top-rated' ? 'start_time' : (normalizedSearchQuery ? 'start_time' : 'created_at');
        const eventAscending: boolean = sortBy === 'a-z' || sortBy === 'top-rated' || !!normalizedSearchQuery;

        if (useAiSmartSearch) {
          const aiResult = await destinationService.searchDestinationsByAI(normalizedSearchQuery, {
            currentLanguage: language,
          });
          const aiRows = aiResult.rows;
          setSmartSearchLocalizationSource(aiResult.localizationSource);

          const selectedCategoryLower = selectedCategoryName?.toLowerCase() ?? 'all';
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

          if (shouldLoadEvents) {
            eventRows = await eventService.getEvents({
              search: normalizedSearchQuery || undefined,
              category: selectedCategoryName ?? undefined,
              status: eventStatusFilter,
              freeOnly: priceFilter === 'free' ? true : undefined,
              minPrice: priceFilter === 'paid' ? 0.01 : undefined,
              startFrom: dateRange.startFrom,
              endTo: dateRange.endTo,
              limit: DISCOVERY_PAGE_SIZE,
              offset: 0,
              orderBy: eventOrderBy,
              ascending: eventAscending,
            });
          }
        } else {
          setSmartSearchLocalizationSource('default');

          const destinationFilters: DiscoveryQueryFilters = {
            search: normalizedSearchQuery || undefined,
            categoryId: selectedCategoryId,
            categoryName: selectedCategoryName,
            ratingMin: ratingFilter,
            priceFilter,
            sort: sortBy,
            limit: DISCOVERY_PAGE_SIZE,
            offset: nextDestinationOffset,
          };

          if (shouldLoadEvents) {
            const [destinationRowsRes, eventRowsRes] = await Promise.all([
              destinationService.getDestinationsForDiscovery(destinationFilters),
              eventService.getEvents({
                search: normalizedSearchQuery || undefined,
                category: selectedCategoryName ?? undefined,
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
          } else {
            destinationRows = await destinationService.getDestinationsForDiscovery(destinationFilters);
            eventRows = [];
          }
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
        const nextHasMore = loadedDestinationCount >= DISCOVERY_PAGE_SIZE;

        if (useAiSmartSearch) {
          setPage(0);
          setHasMore(false);
          setEventOffset(0);
        } else {
          setPage(nextPage);
          setHasMore(nextHasMore);
          setEventOffset(nextEventOffset + loadedEventCount);
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
      language,
      submittedSearchQuery,
      selectedCategory,
      selectedCategoryName,
      selectedCategoryId,
      sortBy,
      t,
    ]
  );

  useEffect(() => {
    hasLoadedInitialRef.current = false;
    setAttractions([]);
    setEvents([]);
    setDistanceByKey({});
    setPage(0);
    setHasMore(true);
    setEventOffset(0);
    void loadDiscovery({
      showSpinner: true,
      append: false,
      page: 0,
      eventOffset: 0,
    });
  }, [loadDiscovery, searchNonce, selectedCategory]);

  const onRefresh = useCallback(() => {
    hasLoadedInitialRef.current = false;
    setAttractions([]);
    setEvents([]);
    setDistanceByKey({});
    setPage(0);
    setHasMore(true);
    setEventOffset(0);
    void loadDiscovery({
      showSpinner: false,
      append: false,
      page: 0,
      eventOffset: 0,
    });
    void loadPersonalizedRecommendations();
    void loadNearbyTopRated();
  }, [loadDiscovery, loadNearbyTopRated, loadPersonalizedRecommendations]);

  const onResetFilters = useCallback(() => {
    setSearchQuery('');
    setSubmittedSearchQuery('');
    setSearchNonce((prev) => prev + 1);
    setSmartSearchLocalizationSource('default');
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

  const onSelectCategory = useCallback((value: ExploreCategoryValue) => {
    if (value === selectedCategory) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hasLoadedInitialRef.current = false;
    setAttractions([]);
    setEvents([]);
    setDistanceByKey({});
    setPage(0);
    setHasMore(true);
    setEventOffset(0);
    setSelectedCategory(value);
    if (value !== 'all') {
      setEventDateFilter('all');
      setEventStatusFilter('all');
    }
  }, [selectedCategory]);

  const onMaybePreloadNextPage = useCallback(() => {
    if (!hasLoadedInitialRef.current) return;
    if (loading || loadingMore) return;
    if (errorMessage) return;
    if (aiSmartSearchEnabled && !!submittedSearchQuery.trim()) return; //Nếu có đk, nâng cấp lên realtime nếu thoải mái được request từ model
    if (!hasMore) return;

    void loadDiscovery({
      showSpinner: false,
      append: true,
      page: page + 1,
      eventOffset,
    });
  }, [aiSmartSearchEnabled, errorMessage, eventOffset, hasMore, loadDiscovery, loading, loadingMore, page, submittedSearchQuery]);

  const onEndReachedDiscovery = useCallback(() => {
    const nextOffset = (page + 1) * DISCOVERY_PAGE_SIZE;
    console.log('[Explore][InfiniteScroll] onEndReached', {
      offset: nextOffset,
      dataLength: attractions.length,
      page,
      hasMore,
      loading,
      loadingMore,
    });

    onMaybePreloadNextPage();
  }, [attractions.length, hasMore, loading, loadingMore, onMaybePreloadNextPage, page]);

  const onDiscoveryListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const nearListEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 280;
    if (nearListEnd) {
      onMaybePreloadNextPage();
    }
  }, [onMaybePreloadNextPage]);

  const executeSmartSearch = useCallback((eventOrText?: NativeSyntheticEvent<TextInputSubmitEditingEventData> | string) => {
    if (isLoading) return;

    const nextText =
      typeof eventOrText === 'string'
        ? eventOrText
        : (eventOrText?.nativeEvent?.text ?? searchQuery);
    const nextQuery = nextText.trim();

    setSearchQuery(nextText);
    setSubmittedSearchQuery(nextQuery);
    setSmartSearchLocalizationSource('default');
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
        Alert.alert(t('events.form.error.invalidDateTimeTitle'), 'Ngày kết thúc phải sau ngày bắt đầu');
        throw new Error('end_time must be greater than start_time');
      }

      const price = Number(form.price || '0');
      if (Number.isNaN(price) || price < 0) {
        Alert.alert(t('events.form.error.invalidPriceTitle'), t('events.form.error.invalidPriceMessage'));
        throw new Error('Invalid price');
      }

      try {
        let uploadedImageUrl: string | null = null;
        if (form.imageUri.trim()) {
          const uploaded = await storageService.uploadEventImage({
            uri: form.imageUri.trim(),
            fileName: form.imageFileName || undefined,
            contentType: form.imageMimeType || undefined,
          });
          uploadedImageUrl = uploaded.publicUrl;
        }

        await eventService.createEventForCurrentUser({
          title: form.title,
          category: form.category,
          location: form.location,
          start_time: start,
          end_time: end,
          price,
          image_url: uploadedImageUrl,
          description: form.description.trim() ? form.description.trim() : null,
        });

        setShowCreateModal(false);
        addNotification({
          message: t('events.form.createdSuccess'),
          type: 'success',
        });
        hasLoadedInitialRef.current = false;
        setAttractions([]);
        setEvents([]);
        setDistanceByKey({});
        setPage(0);
        setHasMore(true);
        setEventOffset(0);
        await loadDiscovery({
          showSpinner: false,
          append: false,
          page: 0,
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

  const renderRecommendationCard = useCallback(
    (item: DestinationDiscoveryRow, options?: { showReason?: boolean; showDistance?: boolean }) => {
      const reasonText = options?.showReason
        ? String((item as PersonalizedRecommendationRow).reason ?? '').trim()
        : '';
      const rawDistanceKm = (item as NearbyTopRatedRow).distance_km;
      const distanceKm =
        typeof rawDistanceKm === 'number' && Number.isFinite(rawDistanceKm)
          ? rawDistanceKm
          : null;
      const distanceText =
        options?.showDistance && distanceKm !== null
          ? formatDistance(distanceKm * 1000)
          : '';

      return (
        <Pressable
          onPress={() => onOpenDestination(item)}
          style={({ pressed }) => [
            styles.personalizedCard,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
            pressed ? { opacity: 0.86 } : null,
          ]}
          accessibilityRole="button"
        >
          <ImageBackground
            source={{ uri: item.image_url || FALLBACK_DESTINATION_IMAGE }}
            style={styles.personalizedImage}
            imageStyle={styles.personalizedImageStyle}
            resizeMode="cover"
          >
            <View style={styles.personalizedImageOverlay} />
            <View style={styles.personalizedImageInner}>
              <Text style={styles.personalizedTag}>{toCategoryName(item)}</Text>
            </View>
          </ImageBackground>

          <View style={styles.personalizedBody}>
            <Text style={[styles.personalizedTitle, { color: colors.title }]} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={[styles.personalizedMeta, { color: colors.muted }]} numberOfLines={1}>
              {item.location || t('common.unknownLocation')}
            </Text>

            {!!reasonText ? (
              <View
                style={[
                  styles.personalizedReasonBadge,
                  {
                    borderColor: isDark ? 'rgba(34,211,238,0.34)' : 'rgba(8,145,178,0.32)',
                    backgroundColor: isDark ? 'rgba(34,211,238,0.16)' : 'rgba(34,211,238,0.12)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.personalizedReasonText,
                    { color: isDark ? '#67e8f9' : '#0e7490' },
                  ]}
                  numberOfLines={2}
                >
                  {reasonText}
                </Text>
              </View>
            ) : null}

            <View style={styles.personalizedBottomRow}>
              <Text style={[styles.personalizedPrice, { color: ExploreEaseColors.primary }]}>
                {formatDestinationPriceText(item.price)}
              </Text>
              <View style={styles.inlineMetaRow}>
                {typeof item.rating === 'number' ? (
                  <Text style={[styles.personalizedMeta, { color: colors.muted }]}>
                    {t('explore.meta.ratingWithStar', { rating: item.rating.toFixed(1) })}
                  </Text>
                ) : null}
                {!!distanceText ? (
                  <Text style={[styles.personalizedMeta, { color: colors.muted }]}>
                    {distanceText}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [
      colors.border,
      colors.inputBg,
      colors.muted,
      colors.title,
      formatDestinationPriceText,
      isDark,
      onOpenDestination,
      t,
      toCategoryName,
    ]
  );

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

  const smartSearchLocalizationHint = useMemo(() => {
    if (!isAiSearchActive) return '';

    if (isLoading) {
      return smartSearchT('translatingResults');
    }

    if (smartSearchLocalizationSource === 'localized_columns') {
      return smartSearchT('usingLocalizedColumns');
    }

    if (smartSearchLocalizationSource === 'ai_fallback_translation') {
      return smartSearchT('fallbackTranslation');
    }

    return '';
  }, [isAiSearchActive, isLoading, smartSearchLocalizationSource, smartSearchT]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={['explore-root']}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={PRELOAD_SCROLL_THRESHOLD}
        onEndReached={onEndReachedDiscovery}
        onScroll={onDiscoveryListScroll}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooterLoading}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
            </View>
          ) : null
        }
        renderItem={() => (
          <>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.title }]}>{t('explore.title')}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{t('explore.subtitle')}</Text>
          </View>

          <Pressable
            onPress={() => {
              releaseOverlayTriggerFocus();
              setShowCreateModal(true);
            }}
            style={({ pressed }) => [styles.createBtn, pressed ? { opacity: 0.84 } : null]}
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color="#001018" />
            <Text style={styles.createBtnText}>{t('explore.createEvent')}</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.title }]}>{smartSearchT('searchLabel')}</Text>
          <View style={styles.smartSearchLanguageRow}>
            <Text style={[styles.smartSearchLanguageLabel, { color: colors.muted }]}>
              {smartSearchT('languageLabel')}: {language === 'en' ? smartSearchT('languageEn') : smartSearchT('languageVi')}
            </Text>
            <View style={styles.smartSearchLanguagePills}>
              <Pressable
                onPress={() => setLanguage('vi')}
                disabled={isLoading || language === 'vi'}
                style={({ pressed }) => [
                  styles.smartSearchLanguagePill,
                  language === 'vi' ? styles.smartSearchLanguagePillActive : null,
                  (isLoading || language === 'vi') ? { opacity: 0.6 } : null,
                  pressed ? { opacity: 0.84 } : null,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.smartSearchLanguagePillText,
                    { color: language === 'vi' ? '#001018' : colors.text },
                  ]}
                >
                  {smartSearchT('languageVi')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage('en')}
                disabled={isLoading || language === 'en'}
                style={({ pressed }) => [
                  styles.smartSearchLanguagePill,
                  language === 'en' ? styles.smartSearchLanguagePillActive : null,
                  (isLoading || language === 'en') ? { opacity: 0.6 } : null,
                  pressed ? { opacity: 0.84 } : null,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.smartSearchLanguagePillText,
                    { color: language === 'en' ? '#001018' : colors.text },
                  ]}
                >
                  {smartSearchT('languageEn')}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
            <Feather name="search" size={16} color={colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={executeSmartSearch}
              placeholder={smartSearchT('searchPlaceholder')}
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
                  setSmartSearchLocalizationSource('default');
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
              accessibilityLabel={smartSearchT('submit')}
            >
              <Feather name="arrow-right" size={16} color="#001018" />
            </TouchableOpacity>
          </View>

          <View style={styles.aiToggleRow}>
            <Pressable
              onPress={() => {
                setAiSmartSearchEnabled((prev) => {
                  const next = !prev;
                  if (!next) {
                    setSmartSearchLocalizationSource('default');
                  }
                  return next;
                });
              }}
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

            {isAiSearchActive && !!smartSearchLocalizationHint ? (
              <Text style={[styles.aiToggleHint, { color: colors.muted }]}>{smartSearchLocalizationHint}</Text>
            ) : null}
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

        {showDefaultExploreSections ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={styles.personalizedHeaderRow}>
                <Text style={[styles.label, { color: colors.title }]}>Dành riêng cho bạn</Text>
                {loadingPersonalizedRecommendations ? (
                  <ActivityIndicator color={ExploreEaseColors.primary} size="small" />
                ) : null}
              </View>

              {loadingPersonalizedRecommendations ? (
                <View style={styles.personalizedSkeletonRow}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={`personalized-skeleton-${index}`}
                      style={[
                        styles.personalizedSkeletonCard,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.personalizedSkeletonImage,
                          { backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)' },
                        ]}
                      />
                      <View
                        style={[
                          styles.personalizedSkeletonLine,
                          { backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)' },
                        ]}
                      />
                      <View
                        style={[
                          styles.personalizedSkeletonLineShort,
                          { backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)' },
                        ]}
                      />
                    </View>
                  ))}
                </View>
              ) : personalizedErrorMessage ? (
                <View style={styles.personalizedStateWrap}>
                  <Text style={[styles.helperErrorText, { color: '#ef4444' }]} numberOfLines={2}>
                    {personalizedErrorMessage}
                  </Text>
                  <Pressable
                    onPress={() => void loadPersonalizedRecommendations()}
                    style={styles.retryBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
                  </Pressable>
                </View>
              ) : personalizedRecommendations.length > 0 ? (
                <FlatList
                  data={personalizedRecommendations}
                  horizontal
                  nestedScrollEnabled
                  keyExtractor={(item) => `personalized:${String(item.id)}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.personalizedList}
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                  renderItem={({ item }) => renderRecommendationCard(item, { showReason: true })}
                />
              ) : loadingFallbackRecommendations ? (
                <View style={styles.personalizedStateWrap}>
                  <ActivityIndicator color={ExploreEaseColors.primary} size="small" />
                  <Text style={[styles.targetInfoText, { color: colors.muted }]}>Đang tìm gợi ý theo sở thích của bạn...</Text>
                </View>
              ) : fallbackInterestRecommendations.length > 0 ? (
                <View style={styles.personalizedFallbackWrap}>
                  <Text style={[styles.personalizedFallbackTitle, { color: colors.title }]}>Dựa trên sở thích của bạn</Text>
                  <FlatList
                    data={fallbackInterestRecommendations}
                    horizontal
                    nestedScrollEnabled
                    keyExtractor={(item) => `fallback-interest:${String(item.id)}`}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.personalizedList}
                    ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                    renderItem={({ item }) => renderRecommendationCard(item)}
                  />
                </View>
              ) : (
                <Text style={[styles.targetInfoText, { color: colors.muted }]}>
                  {personalizedRequiresLogin
                    ? 'Đăng nhập để xem gợi ý dành riêng cho bạn.'
                    : 'Chưa có gợi ý phù hợp lúc này.'}
                </Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={styles.personalizedHeaderRow}>
                <Text style={[styles.label, { color: colors.title }]}>Gần bạn & Đánh giá cao</Text>
                {loadingNearbyTopRated ? (
                  <ActivityIndicator color={ExploreEaseColors.primary} size="small" />
                ) : null}
              </View>

              {loadingNearbyTopRated ? (
                <View style={styles.personalizedSkeletonRow}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={`nearby-top-rated-skeleton-${index}`}
                      style={[
                        styles.personalizedSkeletonCard,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.personalizedSkeletonImage,
                          { backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)' },
                        ]}
                      />
                      <View
                        style={[
                          styles.personalizedSkeletonLine,
                          { backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)' },
                        ]}
                      />
                      <View
                        style={[
                          styles.personalizedSkeletonLineShort,
                          { backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.28)' },
                        ]}
                      />
                    </View>
                  ))}
                </View>
              ) : nearbyTopRatedPermissionDenied ? (
                <Text style={[styles.targetInfoText, { color: colors.muted }]}>Bật quyền vị trí trong cài đặt để xem các địa điểm gần bạn.</Text>
              ) : nearbyTopRatedErrorMessage ? (
                <View style={styles.personalizedStateWrap}>
                  <Text style={[styles.helperErrorText, { color: '#ef4444' }]} numberOfLines={2}>
                    {nearbyTopRatedErrorMessage}
                  </Text>
                  <Pressable
                    onPress={() => void loadNearbyTopRated()}
                    style={styles.retryBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
                  </Pressable>
                </View>
              ) : nearbyTopRatedRows.length > 0 ? (
                <FlatList
                  data={nearbyTopRatedRows}
                  horizontal
                  nestedScrollEnabled
                  keyExtractor={(item) => `nearby-top-rated:${String(item.id)}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.personalizedList}
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                  renderItem={({ item }) => renderRecommendationCard(item, { showDistance: true })}
                />
              ) : (
                <Text style={[styles.targetInfoText, { color: colors.muted }]}>
                  {gpsLocation
                    ? 'Chưa có địa điểm gần bạn trong phạm vi hiện tại.'
                    : 'Bật vị trí để khám phá địa điểm gần bạn.'}
                </Text>
              )}
            </View>
          </>
        ) : null}

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

          <FilterSection label={t('explore.filter.category')} color={colors.title} horizontal>
            {EXPLORE_CATEGORY_CHIPS.map((item) => (
              <FilterChip
                key={item.value}
                selected={selectedCategory === item.value}
                label={item.label}
                onPress={() => onSelectCategory(item.value)}
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

          {showDefaultExploreSections ? (
            <>
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
            </>
          ) : null}

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

            {showDefaultExploreSections ? (
              <>
                <View style={styles.sectionHead}>
                  <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('explore.events', { count: events.length })}</Text>
                  <Pressable
                    onPress={() => {
                      releaseOverlayTriggerFocus();
                      setShowCreateModal(true);
                    }}
                    accessibilityRole="button"
                  >
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
                    const creatorId = String(item.creator_id ?? '').trim();
                    const creatorPreview = creatorId ? eventCreatorProfiles[creatorId] : undefined;
                    const creatorName = String(creatorPreview?.fullName ?? '').trim() || t('social.feed.someone');

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
                          {creatorId ? (
                            <Pressable
                              onPress={() => router.push(`/user/${creatorId}` as any)}
                              style={({ pressed }) => [styles.eventAuthorRow, pressed ? { opacity: 0.82 } : null]}
                              accessibilityRole="button"
                              accessibilityLabel={t('home.openProfile')}
                            >
                              {creatorPreview?.avatarUrl ? (
                                <Image source={{ uri: creatorPreview.avatarUrl }} style={styles.eventAuthorAvatar} />
                              ) : (
                                <View style={[styles.eventAuthorAvatarFallback, { borderColor: colors.border }]}>
                                  <Feather name="user" size={12} color={ExploreEaseColors.primary} />
                                </View>
                              )}
                              <Text style={[styles.eventAuthorName, { color: colors.muted }]} numberOfLines={1}>
                                {creatorName}
                              </Text>
                            </Pressable>
                          ) : null}
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
              </>
            ) : null}

            {!loadingMore && hasLoadedInitialRef.current && !hasMore ? (
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
        horizontal?: boolean;
        children: React.ReactNode;
      };

      function FilterSection({ label, color, horizontal = false, children }: FilterSectionProps) {
        return (
          <View style={{ marginTop: 2 }}>
            <Text style={{ color, fontSize: 12, fontWeight: '800', marginBottom: 8 }}>{label}</Text>
            {horizontal ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                directionalLockEnabled
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chipRowHorizontal}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={styles.chipRow}>{children}</View>
            )}
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
        smartSearchLanguageRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        smartSearchLanguageLabel: {
          flex: 1,
          fontSize: 11,
          fontWeight: '700',
        },
        smartSearchLanguagePills: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        smartSearchLanguagePill: {
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 5,
          backgroundColor: 'rgba(148,163,184,0.18)',
        },
        smartSearchLanguagePillActive: {
          backgroundColor: ExploreEaseColors.primary,
        },
        smartSearchLanguagePillText: {
          fontSize: 11,
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
        personalizedHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        personalizedStateWrap: {
          gap: 8,
        },
        personalizedSkeletonRow: {
          flexDirection: 'row',
          gap: 10,
        },
        personalizedSkeletonCard: {
          width: 210,
          borderWidth: 1,
          borderRadius: 12,
          padding: 10,
          gap: 8,
        },
        personalizedSkeletonImage: {
          height: 88,
          borderRadius: 10,
        },
        personalizedSkeletonLine: {
          width: '76%',
          height: 10,
          borderRadius: 999,
        },
        personalizedSkeletonLineShort: {
          width: '46%',
          height: 10,
          borderRadius: 999,
        },
        personalizedList: {
          paddingVertical: 2,
          paddingRight: 2,
        },
        personalizedCard: {
          width: 232,
          borderWidth: 1,
          borderRadius: 14,
          overflow: 'hidden',
        },
        personalizedImage: {
          height: 112,
          justifyContent: 'space-between',
        },
        personalizedImageStyle: {
          width: '100%',
          height: '100%',
        },
        personalizedImageOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.18)',
        },
        personalizedImageInner: {
          padding: 10,
        },
        personalizedTag: {
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
        personalizedBody: {
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 4,
        },
        personalizedTitle: {
          fontSize: 14,
          lineHeight: 19,
          fontWeight: '900',
        },
        personalizedMeta: {
          fontSize: 12,
          fontWeight: '600',
        },
        personalizedReasonBadge: {
          marginTop: 2,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
        },
        personalizedReasonText: {
          fontSize: 11,
          fontWeight: '700',
          lineHeight: 15,
        },
        personalizedBottomRow: {
          marginTop: 2,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        personalizedPrice: {
          fontSize: 13,
          fontWeight: '900',
        },
        personalizedFallbackWrap: {
          gap: 8,
        },
        personalizedFallbackTitle: {
          fontSize: 13,
          fontWeight: '800',
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
        chipRowHorizontal: {
          flexDirection: 'row',
          gap: 8,
          paddingRight: 2,
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
        listFooterLoading: {
          paddingVertical: 12,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
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
        eventAuthorRow: {
          marginTop: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          alignSelf: 'flex-start',
          maxWidth: '100%',
        },
        eventAuthorAvatar: {
          width: 22,
          height: 22,
          borderRadius: 11,
        },
        eventAuthorAvatarFallback: {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        eventAuthorName: {
          fontSize: 12,
          fontWeight: '700',
          flexShrink: 1,
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
