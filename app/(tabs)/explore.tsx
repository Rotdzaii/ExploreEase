import { CreateEventForm, type EventFormData } from '@/components/events/CreateEventForm';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/src/context/theme';
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
    isWithinRadiusKm,
    resolveEntityCoords,
    useLocationOverrideStore,
} from '@/utils/location';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ImageBackground,
    Modal,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
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

const STATIC_EVENT_CATEGORIES = [
  'Music',
  'Food',
  'Wellness',
  'Art',
  'Sports',
  'Tech',
  'Education',
  'Entertainment',
  'Networking',
  'Charity',
];

const FALLBACK_DESTINATION_IMAGE =
  'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=80';

const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

type EventDateFilter = 'all' | 'today' | 'next-7-days' | 'this-month';

const DISCOVERY_PAGE_SIZE = 20;
const PRELOAD_SCROLL_THRESHOLD = 0.5;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN');
};

const getEventStatusLabel = (status: EventStatus) => {
  if (status === 'ongoing') return 'Ongoing';
  if (status === 'completed') return 'Completed';
  return 'Incoming';
};

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

const formatEventPrice = (value: number | null | undefined) => {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (num <= 0) return 'FREE';
  return `${num.toLocaleString('vi-VN')} đ`;
};

const formatDestinationPrice = (value: unknown) => {
  const amount = parseMoneyToNumber(value);
  if (amount === null) return 'N/A';
  if (amount <= 0) return 'FREE';
  return `${amount.toLocaleString('vi-VN')} đ`;
};

const toCategoryName = (item: DestinationDiscoveryRow) => {
  const rel = item.categories as any;
  const fromRelation = typeof rel?.name === 'string' ? rel.name.trim() : '';
  if (fromRelation) return fromRelation;
  return 'General';
};

export default function ExploreScreen() {
  const { isDark } = useTheme();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { location: gpsLocation, errorMsg: gpsErrorMsg, isLoading: isLoadingGps } = useLocation();

  const isManualLocationEnabled = useLocationOverrideStore((s) => s.useManualLocation);
  const manualLocationText = useLocationOverrideStore((s) => s.manualLocationText);
  const manualLocationCoords = useLocationOverrideStore((s) => s.manualLocationCoords);
  const setManualLocation = useLocationOverrideStore((s) => s.setManualLocation);
  const clearManualLocation = useLocationOverrideStore((s) => s.clearManualLocation);
  const setUseManualLocation = useLocationOverrideStore((s) => s.setUseManualLocation);

  const [manualInput, setManualInput] = useState(manualLocationText);
  const [resolvingManualLocation, setResolvingManualLocation] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DiscoverySearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
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

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);

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

    const merged = ['all', ...STATIC_EVENT_CATEGORIES, ...fromDestinations, ...fromEvents];
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of merged) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }

    return result;
  }, [categories, events]);

  const selectedCategoryId = useMemo(() => {
    if (selectedCategory === 'all') return null;
    const hit = categories.find((c) => c.name.toLowerCase() === selectedCategory.toLowerCase());
    return hit?.id ?? null;
  }, [categories, selectedCategory]);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const rows = await destinationService.getCategories();
        if (cancelled) return;

        const mapped: CategoryRow[] = (rows ?? [])
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
    const timer = setTimeout(() => {
      setSearchQuery(searchText.trim());
    }, 220);

    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;

    if (!searchText.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(async () => {
      try {
        const rows = await destinationService.getAutocompleteSuggestions(searchText.trim(), 5);
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
  }, [searchText]);

  const loadDiscovery = useCallback(
    async (input: {
      showSpinner: boolean;
      append: boolean;
      destinationOffset: number;
      eventOffset: number;
    }) => {
      const { showSpinner, append, destinationOffset: nextDestinationOffset, eventOffset: nextEventOffset } = input;

      if (showSpinner) setLoading(true);
      if (append) setLoadingMore(true);
      setErrorMessage(null);

      try {
        const destinationFilters: DiscoveryQueryFilters = {
          search: searchQuery || undefined,
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
          sortBy === 'a-z' ? 'title' : sortBy === 'top-rated' ? 'start_time' : (searchQuery ? 'start_time' : 'created_at');
        const eventAscending: boolean = sortBy === 'a-z' || sortBy === 'top-rated' || !!searchQuery;

        const [destinationRows, eventRows] = await Promise.all([
          destinationService.getDestinationsForDiscovery(destinationFilters),
          eventService.getEvents({
            search: searchQuery || undefined,
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

        let nextAttractions = destinationRows;
        let nextEvents = eventRows;
        const nextDistanceByKey: Record<string, number> = {};

        if (nearbyOnly) {
          if (!effectiveTargetLocation) {
            if (!append) {
              setAttractions([]);
              setEvents([]);
              setDistanceByKey({});
            }
            setErrorMessage('Nearby filter requires GPS or a manual target location.');
            return;
          }

          const filteredAttractions = await Promise.all(
            destinationRows.map(async (row) => {
              const coords = await resolveEntityCoords(row);
              if (!isWithinRadiusKm(effectiveTargetLocation, coords, 5)) return null;
              if (!coords) return null;

              const meters = getHaversineDistance(
                effectiveTargetLocation.latitude,
                effectiveTargetLocation.longitude,
                coords.latitude,
                coords.longitude
              );

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
              if (!isWithinRadiusKm(effectiveTargetLocation, coords, 5)) return null;
              if (!coords) return null;

              const meters = getHaversineDistance(
                effectiveTargetLocation.latitude,
                effectiveTargetLocation.longitude,
                coords.latitude,
                coords.longitude
              );

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

        setDestinationOffset(nextDestinationOffset + loadedDestinationCount);
        setEventOffset(nextEventOffset + loadedEventCount);
        setHasMoreAttractions(loadedDestinationCount >= DISCOVERY_PAGE_SIZE);
        setHasMoreEvents(loadedEventCount >= DISCOVERY_PAGE_SIZE);

        hasLoadedInitialRef.current = true;
      } catch (err: any) {
        const msg = err?.message ?? 'Unable to load discovery results.';
        setErrorMessage(msg);
      } finally {
        if (showSpinner) setLoading(false);
        if (append) setLoadingMore(false);
      }
    },
    [
      effectiveTargetLocation,
      eventDateFilter,
      eventStatusFilter,
      nearbyOnly,
      priceFilter,
      ratingFilter,
      searchQuery,
      selectedCategory,
      selectedCategoryId,
      sortBy,
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
  }, [loadDiscovery]);

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
    setSearchText('');
    setSearchQuery('');
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
    if (!hasMoreAttractions && !hasMoreEvents) return;

    void loadDiscovery({
      showSpinner: false,
      append: true,
      destinationOffset,
      eventOffset,
    });
  }, [destinationOffset, errorMessage, eventOffset, hasMoreAttractions, hasMoreEvents, loadDiscovery, loading, loadingMore]);

  const onPickSuggestion = useCallback((item: DiscoverySearchSuggestion) => {
    setSearchText(item.label);
    setSearchQuery(item.label);
    setShowSuggestions(false);
  }, []);

  const applyManualLocation = useCallback(async () => {
    const text = manualInput.trim();
    if (!text) {
      addNotification({
        message: 'Please enter a location to override GPS.',
        type: 'warning',
      });
      return;
    }

    setResolvingManualLocation(true);
    try {
      const coords = await geocodeLocationText(text);
      if (!coords) {
        addNotification({
          message: 'Could not resolve this location. Try a more specific address.',
          type: 'error',
        });
        return;
      }

      setManualLocation({ text, coords });
      setUseManualLocation(true);
      addNotification({
        message: 'Manual target location updated.',
        type: 'success',
      });
    } finally {
      setResolvingManualLocation(false);
    }
  }, [addNotification, manualInput, setManualLocation, setUseManualLocation]);

  const useGpsLocation = useCallback(() => {
    setUseManualLocation(false);
    addNotification({
      message: 'Switched to GPS location.',
      type: 'info',
    });
  }, [addNotification, setUseManualLocation]);

  const clearManual = useCallback(() => {
    clearManualLocation();
    setManualInput('');
    addNotification({
      message: 'Manual location cleared.',
      type: 'info',
    });
  }, [addNotification, clearManualLocation]);

  const onCreateEvent = useCallback(
    async (form: EventFormData) => {
      const start = combineLocalDateTime(form.startDate, form.startTime);
      const end = combineLocalDateTime(form.endDate, form.endTime);

      if (!start || !end) {
        Alert.alert('Dữ liệu thời gian chưa đúng', 'Vui lòng nhập đúng định dạng ngày giờ.');
        throw new Error('Invalid datetime format');
      }

      if (end <= start) {
        Alert.alert('Dữ liệu thời gian chưa đúng', 'Thời gian kết thúc phải sau thời gian bắt đầu.');
        throw new Error('end_time must be greater than start_time');
      }

      const price = Number(form.price || '0');
      if (Number.isNaN(price) || price < 0) {
        Alert.alert('Giá không hợp lệ', 'Giá phải là số lớn hơn hoặc bằng 0.');
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
          message: 'Event created successfully.',
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
        const message = String(err?.message ?? 'Không thể tạo sự kiện.');
        const lower = message.toLowerCase();

        if (lower.includes('not authenticated')) {
          Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập để tạo sự kiện.', [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Đăng nhập', onPress: () => router.push('/login' as any) },
          ]);
          throw err;
        }

        Alert.alert('Không thể tạo sự kiện', message);
        throw err;
      }
    },
    [addNotification, loadDiscovery]
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
    !!searchQuery ||
    selectedCategory !== 'all' ||
    eventDateFilter !== 'all' ||
    eventStatusFilter !== 'all' ||
    ratingFilter !== null ||
    priceFilter !== 'all' ||
    sortBy !== 'relevance' ||
    nearbyOnly;

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
            <Text style={[styles.headerTitle, { color: colors.title }]}>Discover</Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>Attractions and events around you</Text>
          </View>

          <Pressable
            onPress={() => setShowCreateModal(true)}
            style={({ pressed }) => [styles.createBtn, pressed ? { opacity: 0.84 } : null]}
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color="#001018" />
            <Text style={styles.createBtnText}>Event</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.title }]}>Search</Text>
          <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
            <Feather name="search" size={16} color={colors.muted} />
            <TextInput
              value={searchText}
              onChangeText={(value) => {
                setSearchText(value);
                setShowSuggestions(true);
              }}
              placeholder="Search by attraction or event name"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text }]}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!searchText ? (
              <Pressable
                onPress={() => {
                  setSearchText('');
                  setSearchQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
                accessibilityRole="button"
              >
                <Feather name="x" size={16} color={colors.muted} />
              </Pressable>
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
                    {item.type === 'destination' ? 'Attraction' : 'Event'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.label, { color: colors.title }]}>Target Location</Text>

          <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
            <Feather name="map-pin" size={16} color={colors.muted} />
            <TextInput
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="Manual location (e.g. District 1, Ho Chi Minh City)"
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
                <Text style={[styles.outlineBtnText, { color: colors.text }]}>Set Manual</Text>
              )}
            </Pressable>

            <Pressable
              onPress={useGpsLocation}
              style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Text style={[styles.outlineBtnText, { color: colors.text }]}>Use GPS</Text>
            </Pressable>

            <Pressable
              onPress={clearManual}
              style={({ pressed }) => [styles.outlineBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
            >
              <Text style={[styles.outlineBtnText, { color: colors.text }]}>Clear</Text>
            </Pressable>
          </View>

          <View style={styles.targetInfoRow}>
            <Feather name={isManualLocationEnabled ? 'crosshair' : 'navigation'} size={14} color={ExploreEaseColors.primary} />
            <Text style={[styles.targetInfoText, { color: colors.muted }]}>
              {isManualLocationEnabled
                ? `Manual: ${manualLocationText || 'Not set'}`
                : (gpsLocation ? 'Using current GPS location' : (isLoadingGps ? 'Detecting GPS location...' : 'GPS unavailable'))}
            </Text>
          </View>

          {!isManualLocationEnabled && !!gpsErrorMsg ? (
            <Text style={[styles.helperErrorText, { color: '#ef4444' }]}>{gpsErrorMsg}</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.filterHeaderRow}>
            <Text style={[styles.label, { color: colors.title }]}>Filters & Sorting</Text>
            {isFiltered ? (
              <Pressable onPress={onResetFilters} accessibilityRole="button">
                <Text style={[styles.resetText, { color: ExploreEaseColors.primary }]}>Reset</Text>
              </Pressable>
            ) : null}
          </View>

          <FilterSection label="Category" color={colors.title}>
            {categoryOptions.map((value) => (
              <FilterChip
                key={value}
                selected={selectedCategory.toLowerCase() === value.toLowerCase()}
                label={value === 'all' ? 'All' : value}
                onPress={() => setSelectedCategory(value)}
              />
            ))}
          </FilterSection>

          <FilterSection label="Rating" color={colors.title}>
            <FilterChip selected={ratingFilter === null} label="All" onPress={() => setRatingFilter(null)} />
            <FilterChip selected={ratingFilter === 4} label="4.0+" onPress={() => setRatingFilter(4)} />
            <FilterChip selected={ratingFilter === 4.5} label="4.5+" onPress={() => setRatingFilter(4.5)} />
          </FilterSection>

          <FilterSection label="Price" color={colors.title}>
            <FilterChip selected={priceFilter === 'all'} label="All" onPress={() => setPriceFilter('all')} />
            <FilterChip selected={priceFilter === 'free'} label="Free" onPress={() => setPriceFilter('free')} />
            <FilterChip selected={priceFilter === 'paid'} label="Paid" onPress={() => setPriceFilter('paid')} />
          </FilterSection>

          <FilterSection label="Event Date" color={colors.title}>
            <FilterChip selected={eventDateFilter === 'all'} label="All" onPress={() => setEventDateFilter('all')} />
            <FilterChip selected={eventDateFilter === 'today'} label="Today" onPress={() => setEventDateFilter('today')} />
            <FilterChip
              selected={eventDateFilter === 'next-7-days'}
              label="Next 7 Days"
              onPress={() => setEventDateFilter('next-7-days')}
            />
            <FilterChip
              selected={eventDateFilter === 'this-month'}
              label="This Month"
              onPress={() => setEventDateFilter('this-month')}
            />
          </FilterSection>

          <FilterSection label="Event Status" color={colors.title}>
            <FilterChip selected={eventStatusFilter === 'all'} label="All" onPress={() => setEventStatusFilter('all')} />
            <FilterChip
              selected={eventStatusFilter === 'incoming'}
              label="Incoming"
              onPress={() => setEventStatusFilter('incoming')}
            />
            <FilterChip
              selected={eventStatusFilter === 'ongoing'}
              label="Ongoing"
              onPress={() => setEventStatusFilter('ongoing')}
            />
            <FilterChip
              selected={eventStatusFilter === 'completed'}
              label="Completed"
              onPress={() => setEventStatusFilter('completed')}
            />
          </FilterSection>

          <FilterSection label="Sort" color={colors.title}>
            <FilterChip selected={sortBy === 'relevance'} label="Relevance" onPress={() => setSortBy('relevance')} />
            <FilterChip selected={sortBy === 'top-rated'} label="Top-rated" onPress={() => setSortBy('top-rated')} />
            <FilterChip selected={sortBy === 'a-z'} label="A-Z" onPress={() => setSortBy('a-z')} />
          </FilterSection>

          <View style={styles.nearbyToggleRow}>
            <Text style={[styles.nearbyText, { color: colors.title }]}>Nearby radius &lt; 5 km</Text>
            <Pressable
              onPress={() => setNearbyOnly((prev) => !prev)}
              style={({ pressed }) => [
                styles.toggleBtn,
                nearbyOnly ? styles.toggleBtnOn : styles.toggleBtnOff,
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.toggleBtnText}>{nearbyOnly ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={ExploreEaseColors.primary} />
            <Text style={[styles.stateText, { color: colors.muted }]}>Loading discovery results...</Text>
          </View>
        ) : null}

        {!loading && !!errorMessage ? (
          <View style={styles.stateWrap}>
            <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage}</Text>
            <Pressable onPress={onRefresh} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>Attractions ({attractions.length})</Text>
            </View>

            {attractions.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No attractions matched your filters.</Text>
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
                          <Text style={{ color: '#001018', fontWeight: '900', fontSize: 11 }}>Attraction</Text>
                        </View>
                      </ImageBackground>
                    </View>

                    <View style={styles.resultBody}>
                      <Text style={[styles.resultTitle, { color: colors.title }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
                        {item.location || 'Unknown location'}
                      </Text>
                      <View style={styles.resultBottomRow}>
                        <Text style={[styles.resultPrice, { color: ExploreEaseColors.primary }]}>{formatDestinationPrice(item.price)}</Text>
                        <View style={styles.inlineMetaRow}>
                          {typeof item.rating === 'number' ? (
                            <Text style={[styles.resultMeta, { color: colors.muted }]}>⭐ {item.rating.toFixed(1)}</Text>
                          ) : null}
                          {typeof distanceMeters === 'number' ? (
                            <Text style={[styles.resultMeta, { color: colors.muted }]}>• {formatDistance(distanceMeters)}</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}

            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>Events ({events.length})</Text>
              <Pressable onPress={() => setShowCreateModal(true)} accessibilityRole="button">
                <Text style={{ color: ExploreEaseColors.primary, fontWeight: '800', fontSize: 12 }}>Create Event</Text>
              </Pressable>
            </View>

            {events.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>No events matched your filters.</Text>
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
                          <Text style={styles.resultTag}>{item.category || 'Event'}</Text>
                        </View>
                        <View style={[styles.resultImageBase, { backgroundColor: 'rgba(34, 211, 238, 0.18)' }]}>
                          <Text style={{ color: '#001018', fontWeight: '900', fontSize: 11 }}>Event</Text>
                        </View>
                      </ImageBackground>
                    </View>

                    <View style={styles.resultBody}>
                      <Text style={[styles.resultTitle, { color: colors.title }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
                        {item.location || 'Unknown location'}
                      </Text>
                      <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
                        {formatDateTime(item.start_time)}
                      </Text>
                      <View style={styles.resultBottomRow}>
                        <Text style={[styles.resultPrice, { color: ExploreEaseColors.primary }]}>{formatEventPrice(item.price)}</Text>
                        <View style={styles.inlineMetaRow}>
                          <Text style={[styles.resultMeta, { color: colors.muted }]}>
                            {getEventStatusLabel(item.status)}
                          </Text>
                          {typeof distanceMeters === 'number' ? (
                            <Text style={[styles.resultMeta, { color: colors.muted }]}>• {formatDistance(distanceMeters)}</Text>
                          ) : null}
                          <Pressable onPress={() => onOpenEvent(item)} style={styles.viewBtn} accessibilityRole="button">
                            <Text style={styles.viewBtnText}>View</Text>
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
                <Text style={[styles.resultMeta, { color: colors.muted }]}>Loading more results...</Text>
              </View>
            ) : null}

            {!loadingMore && hasLoadedInitialRef.current && !hasMoreAttractions && !hasMoreEvents ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>You reached the end of discovery results.</Text>
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
        nearbyToggleRow: {
          marginTop: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        nearbyText: {
          fontSize: 13,
          fontWeight: '800',
        },
        toggleBtn: {
          minWidth: 58,
          minHeight: 30,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 10,
        },
        toggleBtnOn: {
          backgroundColor: ExploreEaseColors.primary,
        },
        toggleBtnOff: {
          backgroundColor: 'rgba(148,163,184,0.28)',
        },
        toggleBtnText: {
          color: '#001018',
          fontSize: 11,
          fontWeight: '900',
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
