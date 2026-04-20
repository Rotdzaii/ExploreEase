import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import {
    destinationService,
    type SearchFilterCategory,
    type SearchFilterDestinationRow,
    type SearchFilterSort,
} from '@/src/services/destinationService';
import { parseMoneyToNumber } from '@/utils/format';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
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

const FALLBACK_DESTINATION_IMAGE =
  'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80';

const SEARCH_DEBOUNCE_MS = 300;
const MAX_PRICE_CAP = 5_000_000;

const CATEGORY_OPTIONS: { value: SearchFilterCategory; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'attractions', label: 'Attractions' },
  { value: 'cuisines', label: 'Cuisines' },
  { value: 'activities', label: 'Activities' },
];

const SORT_OPTIONS: { value: SearchFilterSort; label: string }[] = [
  { value: 'relevance', label: 'Liên quan' },
  { value: 'top-rated', label: 'Đánh giá cao' },
  { value: 'price-asc', label: 'Giá tăng dần' },
  { value: 'price-desc', label: 'Giá giảm dần' },
  { value: 'a-z', label: 'A-Z' },
];

const formatCurrencyVnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} VND`;

const toPriceText = (value: unknown) => {
  const amount = parseMoneyToNumber(value);
  if (amount === null) return 'N/A';
  if (amount <= 0) return 'Miễn phí';
  return formatCurrencyVnd(amount);
};

const toCategoryName = (item: SearchFilterDestinationRow) => {
  const relation = item.categories as { name?: string | null } | null | undefined;
  const categoryName = typeof relation?.name === 'string' ? relation.name.trim() : '';
  return categoryName || 'Điểm đến';
};

export default function SearchFilterScreen() {
  const { isDark } = useTheme();

  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  const [category, setCategory] = useState<SearchFilterCategory>('all');
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE_CAP);
  const [sortBy, setSortBy] = useState<SearchFilterSort>('relevance');

  const [draftCategory, setDraftCategory] = useState<SearchFilterCategory>('all');
  const [draftMinRating, setDraftMinRating] = useState(0);
  const [draftMaxPrice, setDraftMaxPrice] = useState(MAX_PRICE_CAP);
  const [draftSortBy, setDraftSortBy] = useState<SearchFilterSort>('relevance');

  const [showFiltersModal, setShowFiltersModal] = useState(false);

  const [rows, setRows] = useState<SearchFilterDestinationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const requestSeqRef = useRef(0);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      inputBg: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
      modalBackdrop: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(15,23,42,0.45)',
    }),
    [isDark]
  );

  const maxPriceLabel = useMemo(() => {
    if (maxPrice >= MAX_PRICE_CAP) return 'Không giới hạn';
    return formatCurrencyVnd(maxPrice);
  }, [maxPrice]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [searchText]);

  const loadResults = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;

    setLoading(true);
    setErrorMessage(null);

    try {
      const results = await destinationService.searchAndFilterDestinations({
        searchText: debouncedSearchText,
        category,
        minRating,
        maxPrice: maxPrice >= MAX_PRICE_CAP ? null : maxPrice,
        sortBy,
        limit: 60,
      });

      if (requestSeq !== requestSeqRef.current) return;
      setRows(results);
      setHasLoadedOnce(true);
    } catch (error: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setRows([]);
      setHasLoadedOnce(true);
      setErrorMessage(String(error?.message ?? 'Không thể tải kết quả tìm kiếm.'));
    } finally {
      if (requestSeq !== requestSeqRef.current) return;
      setLoading(false);
    }
  }, [category, debouncedSearchText, maxPrice, minRating, sortBy]);

  useEffect(() => {
    void loadResults();

    return () => {
      requestSeqRef.current += 1;
    };
  }, [loadResults]);

  const openFiltersModal = useCallback(() => {
    setDraftCategory(category);
    setDraftMinRating(minRating);
    setDraftMaxPrice(maxPrice);
    setDraftSortBy(sortBy);
    setShowFiltersModal(true);
  }, [category, maxPrice, minRating, sortBy]);

  const applyFilters = useCallback(() => {
    setCategory(draftCategory);
    setMinRating(draftMinRating);
    setMaxPrice(draftMaxPrice);
    setSortBy(draftSortBy);
    setShowFiltersModal(false);
  }, [draftCategory, draftMaxPrice, draftMinRating, draftSortBy]);

  const resetFilters = useCallback(() => {
    setDraftCategory('all');
    setDraftMinRating(0);
    setDraftMaxPrice(MAX_PRICE_CAP);
    setDraftSortBy('relevance');
  }, []);

  const refreshResults = useCallback(() => {
    void loadResults();
  }, [loadResults]);

  const renderItem = useCallback(
    ({ item }: { item: SearchFilterDestinationRow }) => (
      <Pressable
        onPress={() => {
          router.push({
            pathname: '/destination/[id]' as any,
            params: {
              id: String(item.id),
              name: item.name,
              location: item.location ?? '',
              price: String(item.price ?? ''),
              rating: typeof item.rating === 'number' ? String(item.rating) : '',
              imageUrl: item.image_url ?? FALLBACK_DESTINATION_IMAGE,
            },
          } as any);
        }}
        style={({ pressed }) => [
          styles.resultCard,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed ? { opacity: 0.86 } : null,
        ]}
      >
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
        </ImageBackground>

        <View style={styles.resultBody}>
          <Text style={[styles.resultTitle, { color: colors.title }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.resultMeta, { color: colors.muted }]} numberOfLines={1}>
            {item.location || 'Không rõ vị trí'}
          </Text>
          <View style={styles.resultBottomRow}>
            <Text style={[styles.resultPrice, { color: ExploreEaseColors.primary }]}>
              {toPriceText(item.price)}
            </Text>
            {typeof item.rating === 'number' ? (
              <Text style={[styles.resultMeta, { color: colors.muted }]}>★ {item.rating.toFixed(1)}</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    ),
    [colors.border, colors.card, colors.muted, colors.title]
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerIconBtn, pressed ? { opacity: 0.82 } : null]}
        >
          <Feather name="chevron-left" size={18} color={colors.title} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.title }]}>Content Browsing</Text>

        <Pressable
          onPress={openFiltersModal}
          style={({ pressed }) => [styles.headerIconBtn, pressed ? { opacity: 0.82 } : null]}
        >
          <Feather name="sliders" size={16} color={colors.title} />
        </Pressable>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
        <Feather name="search" size={16} color={colors.muted} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Tìm điểm đến, món ăn, hoạt động..."
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {!!searchText ? (
          <Pressable onPress={() => setSearchText('')}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.appliedFilterRow, { borderColor: colors.border }]}> 
        <Text style={[styles.appliedFilterText, { color: colors.muted }]}>Danh mục: {CATEGORY_OPTIONS.find((c) => c.value === category)?.label}</Text>
        <Text style={[styles.appliedFilterText, { color: colors.muted }]}>Min ★ {minRating.toFixed(1)}</Text>
        <Text style={[styles.appliedFilterText, { color: colors.muted }]}>Max {maxPriceLabel}</Text>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: colors.muted }]}>Đang tải kết quả...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: '#ef4444' }]}>{errorMessage}</Text>
          <Pressable onPress={refreshResults} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 && hasLoadedOnce ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: colors.muted }]}>No destinations found matching your criteria</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => `search-filter:${String(item.id)}`}
          renderItem={renderItem}
          contentContainerStyle={styles.resultList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showFiltersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFiltersModal(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.modalBackdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFiltersModal(false)} />

          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.title }]}>Bộ lọc tìm kiếm</Text>

            <Text style={[styles.filterLabel, { color: colors.title }]}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setDraftCategory(option.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    draftCategory === option.value ? styles.chipActive : styles.chipIdle,
                    pressed ? { opacity: 0.84 } : null,
                  ]}
                >
                  <Text style={[styles.chipText, draftCategory === option.value ? styles.chipTextActive : styles.chipTextIdle]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.filterLabel, { color: colors.title }]}>Min Rating: {draftMinRating.toFixed(1)}</Text>
            <Slider
              minimumValue={0}
              maximumValue={5}
              step={0.5}
              value={draftMinRating}
              minimumTrackTintColor={ExploreEaseColors.primary}
              maximumTrackTintColor={isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.36)'}
              thumbTintColor={ExploreEaseColors.primary}
              onValueChange={setDraftMinRating}
            />

            <Text style={[styles.filterLabel, { color: colors.title }]}>Max Price: {draftMaxPrice >= MAX_PRICE_CAP ? 'Không giới hạn' : formatCurrencyVnd(draftMaxPrice)}</Text>
            <Slider
              minimumValue={0}
              maximumValue={MAX_PRICE_CAP}
              step={50_000}
              value={draftMaxPrice}
              minimumTrackTintColor={ExploreEaseColors.primary}
              maximumTrackTintColor={isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.36)'}
              thumbTintColor={ExploreEaseColors.primary}
              onValueChange={setDraftMaxPrice}
            />

            <Text style={[styles.filterLabel, { color: colors.title }]}>Sorting</Text>
            <View style={styles.chipRow}>
              {SORT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setDraftSortBy(option.value)}
                  style={({ pressed }) => [
                    styles.chip,
                    draftSortBy === option.value ? styles.chipActive : styles.chipIdle,
                    pressed ? { opacity: 0.84 } : null,
                  ]}
                >
                  <Text style={[styles.chipText, draftSortBy === option.value ? styles.chipTextActive : styles.chipTextIdle]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActionRow}>
              <Pressable onPress={resetFilters} style={({ pressed }) => [styles.outlineBtn, pressed ? { opacity: 0.84 } : null]}>
                <Text style={styles.outlineBtnText}>Đặt lại</Text>
              </Pressable>

              <Pressable onPress={applyFilters} style={({ pressed }) => [styles.applyBtn, pressed ? { opacity: 0.84 } : null]}>
                <Text style={styles.applyBtnText}>Áp dụng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.16)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  searchWrap: {
    marginHorizontal: 14,
    marginTop: 4,
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
  appliedFilterRow: {
    marginHorizontal: 14,
    marginTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appliedFilterText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 4,
    minHeight: 34,
    minWidth: 90,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 12,
  },
  retryBtnText: {
    color: '#001018',
    fontSize: 12,
    fontWeight: '900',
  },
  resultList: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  resultCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  resultImage: {
    height: 110,
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
  resultBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resultPrice: {
    fontSize: 13,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  filterLabel: {
    marginTop: 4,
    fontSize: 13,
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
  chipActive: {
    backgroundColor: ExploreEaseColors.primary,
    borderColor: ExploreEaseColors.primary,
  },
  chipIdle: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderColor: 'rgba(148,163,184,0.30)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#001018',
  },
  chipTextIdle: {
    color: '#64748b',
  },
  modalActionRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 10,
  },
  outlineBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
  },
  applyBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ExploreEaseColors.primary,
  },
  applyBtnText: {
    color: '#001018',
    fontSize: 12,
    fontWeight: '900',
  },
});