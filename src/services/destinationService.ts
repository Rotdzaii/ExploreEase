import {
    extractTravelSearchIntent,
    generateEmbedding,
    translateSmartSearchTexts,
    type SmartSearchLanguageCode,
    type TravelCategoryHint,
    type TravelIntentType,
} from './aiService';
import { secureCacheService } from './secureCacheService';
import { supabase } from './supabase';

export type ReviewRow = {
  id: string;
  user_id: string;
  destination_id: string | number;
  rating: number;
  comment?: string | null;
  helpful_count?: number | null;
  admin_reply?: string | null;
  reply_text?: string | null;
  replied_at?: string | null;
  replied_by?: string | null;
  review_image_urls?: string[] | null;
  viewer_has_helpful_vote?: boolean;
  created_at?: string | null;
  profiles?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type SubmitReviewInput = {
  destination_id: string | number;
  rating: number;
  comment?: string | null;
  imageUrls?: string[] | null;
  user_id?: string;
};

export type DiscoverySortOption = 'relevance' | 'top-rated' | 'a-z';
export type DiscoveryPriceFilter = 'all' | 'free' | 'paid';

export type DestinationDiscoveryRow = {
  id: string | number;
  name: string;
  name_vi?: string | null;
  name_en?: string | null;
  location?: string | null;
  description?: string | null;
  description_vi?: string | null;
  description_en?: string | null;
  price?: number | string | null;
  rating?: number | null;
  image_url?: string | null;
  similarity?: number | null;
  category_id?: string | number | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string | null;
  categories?: {
    name?: string | null;
  } | null;
};

export type PersonalizedRecommendationRow = DestinationDiscoveryRow & {
  recommendation_score?: number | null;
  reason?: string | null;
};

export type NearbyTopRatedRow = DestinationDiscoveryRow & {
  distance_km?: number | null;
  recommendation_score?: number | null;
};

export type SearchFilterCategory = 'all' | 'attractions' | 'cuisines' | 'activities';
export type SearchFilterSort = 'relevance' | 'top-rated' | 'price-asc' | 'price-desc' | 'a-z';

export type SearchFilterDestinationsInput = {
  searchText?: string | null;
  category?: SearchFilterCategory;
  minRating?: number | null;
  maxPrice?: number | null;
  sortBy?: SearchFilterSort;
  limit?: number;
  offset?: number;
};

export type SearchFilterDestinationRow = DestinationDiscoveryRow;

export type EventDiscoveryRow = {
  id: string;
  title: string;
  category: string;
  location?: string | null;
  start_time: string;
  end_time: string;
  price?: number | null;
  image_url?: string | null;
  description?: string | null;
  status?: string | null;
  creator_id?: string | null;
  created_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
};

export type DiscoverySearchSuggestion = {
  id: string;
  label: string;
  type: 'destination' | 'event';
  subtitle?: string;
};

export type DiscoveryQueryFilters = {
  search?: string;
  categoryId?: string | number | null;
  categoryName?: string | null;
  ratingMin?: number | null;
  priceFilter?: DiscoveryPriceFilter;
  sort?: DiscoverySortOption;
  limit?: number;
  offset?: number;
};

export type SmartSearchLocalizationSource = 'default' | 'localized_columns' | 'ai_fallback_translation';

export type DestinationSmartSearchResult = {
  rows: DestinationDiscoveryRow[];
  localizationSource: SmartSearchLocalizationSource;
  targetLanguage: SmartSearchLanguageCode;
};

type DestinationSearchLanguageOptions = {
  currentLanguage?: string | null;
};

type DestinationVectorMatchRow = {
  id: string;
  similarity?: number | null;
};

type CachedDestinationDetailPayload = {
  destination: Record<string, any>;
  cachedAt: string;
};

export type DestinationDetailLookupResult = {
  data: Record<string, any> | null;
  source: 'remote' | 'cache';
  cachedAt: string | null;
};

const buildDestinationCacheKey = (destinationId: string) => `destination-detail:${destinationId}`;

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizePersonalizedRecommendationRow = (
  row: Record<string, unknown>
): PersonalizedRecommendationRow | null => {
  const idCandidate = row.id ?? row.destination_id ?? row.destinationId;
  if (typeof idCandidate !== 'string' && typeof idCandidate !== 'number') return null;

  const name =
    toNullableString(row.name) ??
    toNullableString(row.destination_name) ??
    toNullableString(row.title) ??
    '';

  if (!name) return null;

  const categoryName =
    toNullableString((row.categories as { name?: unknown } | null | undefined)?.name) ??
    toNullableString(row.category_name);

  const normalizedRating = toNullableNumber(row.rating ?? row.destination_rating);
  const recommendationScore = toNullableNumber(row.recommendation_score ?? row.match_score ?? row.score);

  const categoryIdCandidate = row.category_id ?? row.destination_category_id;
  const normalizedCategoryId =
    typeof categoryIdCandidate === 'string' || typeof categoryIdCandidate === 'number'
      ? categoryIdCandidate
      : null;

  return {
    id: idCandidate,
    name,
    location: toNullableString(row.location) ?? toNullableString(row.destination_location),
    description: toNullableString(row.description) ?? toNullableString(row.destination_description),
    price: (row.price ?? row.destination_price ?? null) as number | string | null,
    rating: normalizedRating,
    image_url: toNullableString(row.image_url) ?? toNullableString(row.destination_image_url),
    category_id: normalizedCategoryId,
    latitude: toNullableNumber(row.latitude ?? row.destination_latitude ?? row.lat),
    longitude: toNullableNumber(row.longitude ?? row.destination_longitude ?? row.lng),
    lat: toNullableNumber(row.lat ?? row.destination_lat),
    lng: toNullableNumber(row.lng ?? row.destination_lng),
    categories: categoryName ? { name: categoryName } : null,
    similarity: recommendationScore,
    recommendation_score: recommendationScore,
    reason:
      toNullableString(row.reason) ??
      toNullableString(row.match_reason) ??
      toNullableString(row.recommendation_reason),
  };
};

const normalizeNearbyTopRatedRow = (
  row: Record<string, unknown>
): NearbyTopRatedRow | null => {
  const base = normalizePersonalizedRecommendationRow(row);
  if (!base) return null;

  const distanceKm = toNullableNumber(row.distance_km ?? row.distance);

  return {
    ...base,
    distance_km: distanceKm,
  };
};

const normalizeSmartSearchLanguage = (value?: string | null): SmartSearchLanguageCode => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'en') return 'en';
  if (normalized === 'ja') return 'ja';
  return 'vi';
};

const getCurrentUserIdSafe = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
};

const isMissingColumnError = (error: unknown, columnName: string) => {
  const message = String((error as any)?.message ?? '').toLowerCase();
  return message.includes('does not exist') && message.includes(columnName.toLowerCase());
};

const DESTINATION_BASE_SELECT =
  'id, name, location, description, price, rating, image_url, category_id, latitude, longitude, created_at, categories(name)';

const DESTINATION_LOCALIZED_SELECT =
  'id, name, name_vi, name_en, location, description, description_vi, description_en, price, rating, image_url, category_id, latitude, longitude, created_at, categories(name)';

let destinationLocalizedColumnsSupported: 'unknown' | 'yes' | 'no' = 'unknown';

const isMissingLocalizedColumnError = (error: unknown) => {
  const message = String((error as any)?.message ?? '').toLowerCase();
  if (!message.includes('does not exist')) return false;

  return (
    message.includes('name_vi') ||
    message.includes('name_en') ||
    message.includes('description_vi') ||
    message.includes('description_en')
  );
};

const runDestinationQueryWithLocalizedFallback = async <TRow>(
  runQuery: (input: {
    selectColumns: string;
    supportsLocalizedColumns: boolean;
  }) => Promise<{ data: unknown[] | null; error: any }>
): Promise<{ rows: TRow[]; usedLocalizedColumns: boolean }> => {
  if (destinationLocalizedColumnsSupported === 'no') {
    const baseResult = await runQuery({
      selectColumns: DESTINATION_BASE_SELECT,
      supportsLocalizedColumns: false,
    });
    if (baseResult.error) throw baseResult.error;
    return { rows: (baseResult.data ?? []) as TRow[], usedLocalizedColumns: false };
  }

  const localizedResult = await runQuery({
    selectColumns: DESTINATION_LOCALIZED_SELECT,
    supportsLocalizedColumns: true,
  });

  if (!localizedResult.error) {
    destinationLocalizedColumnsSupported = 'yes';
    return { rows: (localizedResult.data ?? []) as TRow[], usedLocalizedColumns: true };
  }

  if (!isMissingLocalizedColumnError(localizedResult.error)) {
    throw localizedResult.error;
  }

  destinationLocalizedColumnsSupported = 'no';

  const baseResult = await runQuery({
    selectColumns: DESTINATION_BASE_SELECT,
    supportsLocalizedColumns: false,
  });

  if (baseResult.error) throw baseResult.error;
  return { rows: (baseResult.data ?? []) as TRow[], usedLocalizedColumns: false };
};

const mapRowsByLocalizedColumns = (
  rows: DestinationDiscoveryRow[],
  targetLanguage: SmartSearchLanguageCode,
  canUseLocalizedColumns: boolean
): { rows: DestinationDiscoveryRow[]; usedLocalizedField: boolean } => {
  if (!canUseLocalizedColumns) {
    return { rows, usedLocalizedField: false };
  }

  let usedLocalizedField = false;

  const mappedRows = rows.map((row) => {
    const localizedName =
      targetLanguage === 'en'
        ? String((row as any).name_en ?? '').trim()
        : targetLanguage === 'vi'
          ? String((row as any).name_vi ?? '').trim()
          : '';

    const localizedDescription =
      targetLanguage === 'en'
        ? String((row as any).description_en ?? '').trim()
        : targetLanguage === 'vi'
          ? String((row as any).description_vi ?? '').trim()
          : '';

    if (localizedName || localizedDescription) {
      usedLocalizedField = true;
    }

    return {
      ...row,
      name: localizedName || row.name,
      description: localizedDescription || row.description,
    };
  });

  return {
    rows: mappedRows,
    usedLocalizedField,
  };
};

const applyAiFallbackTranslation = async (
  rows: DestinationDiscoveryRow[],
  targetLanguage: SmartSearchLanguageCode
): Promise<{ rows: DestinationDiscoveryRow[]; didTranslate: boolean }> => {
  if (rows.length === 0 || targetLanguage === 'vi') {
    return { rows, didTranslate: false };
  }

  const maxRows = Math.min(rows.length, 20);
  const textsToTranslate: string[] = [];
  const translationTargets: { rowIndex: number; field: 'name' | 'description' }[] = [];

  for (let index = 0; index < maxRows; index += 1) {
    const row = rows[index];
    const nameText = String(row.name ?? '').trim();
    const descriptionText = String(row.description ?? '').trim();

    if (nameText) {
      translationTargets.push({ rowIndex: index, field: 'name' });
      textsToTranslate.push(nameText);
    }

    if (descriptionText) {
      translationTargets.push({ rowIndex: index, field: 'description' });
      textsToTranslate.push(descriptionText);
    }
  }

  if (textsToTranslate.length === 0) {
    return { rows, didTranslate: false };
  }

  try {
    const translatedTexts = await translateSmartSearchTexts(textsToTranslate, {
      fromLanguage: 'vi',
      toLanguage: targetLanguage,
    });

    if (translatedTexts.length !== textsToTranslate.length) {
      return { rows, didTranslate: false };
    }

    const nextRows = rows.map((row) => ({ ...row }));
    let didTranslate = false;

    for (let index = 0; index < translationTargets.length; index += 1) {
      const target = translationTargets[index];
      const translated = String(translatedTexts[index] ?? '').trim();
      if (!translated) continue;

      const row = nextRows[target.rowIndex];
      if (!row) continue;

      row[target.field] = translated;
      didTranslate = true;
    }

    return { rows: nextRows, didTranslate };
  } catch (error: any) {
    console.warn('applyAiFallbackTranslation failed:', error?.message ?? error);
    return { rows, didTranslate: false };
  }
};

const buildSmartSearchResult = async (
  rows: DestinationDiscoveryRow[],
  targetLanguage: SmartSearchLanguageCode,
  usedLocalizedColumns: boolean
): Promise<DestinationSmartSearchResult> => {
  const localizedMapping = mapRowsByLocalizedColumns(rows, targetLanguage, usedLocalizedColumns);

  if (localizedMapping.usedLocalizedField) {
    return {
      rows: localizedMapping.rows,
      localizationSource: 'localized_columns',
      targetLanguage,
    };
  }

  const translated = await applyAiFallbackTranslation(localizedMapping.rows, targetLanguage);

  if (translated.didTranslate) {
    return {
      rows: translated.rows,
      localizationSource: 'ai_fallback_translation',
      targetLanguage,
    };
  }

  return {
    rows: localizedMapping.rows,
    localizationSource: 'default',
    targetLanguage,
  };
};

type SearchIntentProfile = {
  key: 'spiritual' | 'beach' | 'mountain' | 'relax';
  queryTerms: string[];
  semanticHints: string[];
  keywordTerms: string[];
  entityTerms: string[];
  categoryTerms: string[];
  boost: number;
  categoryBoost: number;
  penaltyTerms?: string[];
  penalty?: number;
};

const INTENT_PROFILES: SearchIntentProfile[] = [
  {
    key: 'spiritual',
    queryTerms: [
      'chua',
      'den',
      'tam linh',
      'cau an',
      'phat',
      'pagoda',
      'temple',
      'shrine',
      'worship',
      'religion',
      'spiritual',
      'meditation',
    ],
    semanticHints: [
      'spiritual place',
      'temple',
      'pagoda',
      'shrine',
      'meditation',
      'religious heritage',
      'place of worship',
    ],
    keywordTerms: ['pagoda', 'temple', 'shrine', 'spiritual', 'religion', 'worship'],
    entityTerms: [
      'pagoda',
      'temple',
      'shrine',
      'chua',
      'den',
      'thu vien',
      'religious',
      'worship',
      'spiritual',
      'phat',
      'meditation',
      'prayer',
    ],
    categoryTerms: ['culture', 'heritage', 'history', 'religion', 'spiritual', 'cities'],
    boost: 0.35,
    categoryBoost: 0.2,
    penaltyTerms: ['beach', 'waterfall', 'promontory', 'market'],
    penalty: 0.08,
  },
  {
    key: 'beach',
    queryTerms: ['bien', 'dao', 'bo bien', 'beach', 'sea', 'ocean', 'coastal'],
    semanticHints: ['beach', 'coastal scenery', 'ocean view', 'island', 'seaside sunset'],
    keywordTerms: ['beach', 'sea', 'ocean', 'coast', 'island', 'coastal', 'my khe'],
    entityTerms: [
      'beach',
      'sea',
      'ocean',
      'coast',
      'island',
      'shore',
      'my khe',
      'nha trang beach',
      'peninsula',
    ],
    categoryTerms: ['nature', 'adventure', 'beach', 'beaches'],
    boost: 0.24,
    categoryBoost: 0.12,
    penaltyTerms: ['temple', 'pagoda', 'shrine'],
    penalty: 0.05,
  },
  {
    key: 'mountain',
    queryTerms: [
      'nui',
      'leo nui',
      'trek',
      'trekking',
      'hiking',
      'mountain',
      'hill',
      'waterfall',
      'adventure',
      'phieu luu',
    ],
    semanticHints: ['mountain', 'hiking', 'waterfall', 'outdoor adventure', 'scenic hill viewpoint'],
    keywordTerms: ['mountain', 'hill', 'waterfall', 'trek', 'hiking', 'adventure', 'ba na'],
    entityTerms: [
      'mountain',
      'hill',
      'waterfall',
      'trek',
      'hiking',
      'adventure',
      'cable car',
      'promontory',
      'peninsula',
      'ba na',
    ],
    categoryTerms: ['adventure', 'nature', 'mountain', 'mountains'],
    boost: 0.24,
    categoryBoost: 0.14,
    penaltyTerms: ['market'],
    penalty: 0.04,
  },
  {
    key: 'relax',
    queryTerms: ['chill', 'thu gian', 'nghi ngoi', 'relax', 'calm', 'yen binh', 'healing', 'sunset'],
    semanticHints: ['relaxing place', 'quiet scenery', 'sunset walk', 'calm atmosphere', 'peaceful view'],
    keywordTerms: ['relax', 'calm', 'quiet', 'sunset', 'sunrise', 'peaceful', 'chill'],
    entityTerms: ['calm', 'quiet', 'sunrise', 'sunset', 'relax', 'chill', 'peaceful', 'gentle', 'viewpoint'],
    categoryTerms: ['nature', 'culture', 'beaches', 'mountains', 'cities'],
    boost: 0.2,
    categoryBoost: 0.08,
    penaltyTerms: ['crowd', 'busy', 'market'],
    penalty: 0.03,
  },
];

const removeDiacriticsForIntent = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeIntentText = (value: unknown) =>
  removeDiacriticsForIntent(String(value ?? '').trim().toLowerCase());

const hasAnyIntentTerm = (text: string, terms: string[]) =>
  terms.some((term) => text.includes(term));

const uniqueTerms = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const detectIntents = (rawQuery: string): SearchIntentProfile[] => {
  const normalizedQuery = normalizeIntentText(rawQuery);
  if (!normalizedQuery) return [];

  return INTENT_PROFILES.filter((profile) => hasAnyIntentTerm(normalizedQuery, profile.queryTerms));
};

const CATEGORY_HINT_DB_TERMS: Record<TravelCategoryHint, string[]> = {
  'Thiên nhiên': ['Thiên nhiên', 'Nature', 'Biển', 'Núi', 'Lake', 'Forest', 'Scenic'],
  'Văn hóa': ['Văn hóa', 'Culture', 'Heritage', 'History', 'Spiritual', 'Temple'],
  'Giải trí': ['Giải trí', 'Entertainment', 'Nightlife', 'Theme Park', 'Urban'],
  'Ẩm thực': ['Ẩm thực', 'Food', 'Cuisine', 'Market', 'Street Food'],
  'Nghỉ dưỡng': ['Nghỉ dưỡng', 'Resort', 'Wellness', 'Retreat', 'Relax'],
  'Mạo hiểm': ['Mạo hiểm', 'Adventure', 'Trekking', 'Hiking', 'Outdoor'],
};

const INTENT_TYPE_CATEGORY_TERMS: Record<TravelIntentType, string[]> = {
  spiritual: ['Chùa', 'Đền', 'Miếu', 'Di tích lịch sử', 'Tâm linh', 'Nghĩa trang liệt sĩ', 'Văn hóa'],
  nature: ['Thiên nhiên', 'Nature', 'Núi', 'Rừng', 'Lake', 'Scenic'],
  beach: ['Biển', 'Beach', 'Coastal', 'Island'],
  adventure: ['Mạo hiểm', 'Adventure', 'Trekking', 'Hiking', 'Outdoor'],
  food: ['Ẩm thực', 'Food', 'Cuisine', 'Market', 'Street Food'],
  unknown: [],
};

const sanitizeForIlikeValue = (value: string) =>
  String(value ?? '')
    .replace(/[,%()'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const QUERY_STOPWORDS = new Set([
  'di',
  'đi',
  'toi',
  'tới',
  'den',
  'đến',
  'du',
  'lich',
  'dulich',
  'cho',
  'tim',
  'kiem',
  'goi',
  'y',
]);

const extractQueryFallbackKeywords = (queryText: string) => {
  return uniqueTerms(
    String(queryText ?? '')
      .split(/\s+/)
      .map((item) => sanitizeForIlikeValue(item))
      .filter((item) => item.length > 1)
      .filter((item) => !QUERY_STOPWORDS.has(normalizeIntentText(item)))
  );
};

const resolveCategoryIdsByTerms = async (terms: string[]) => {
  const lookupTerms = uniqueTerms(
    (terms ?? [])
      .map((term) => sanitizeForIlikeValue(term))
      .filter(Boolean)
  );

  if (lookupTerms.length === 0) return [] as (string | number)[];

  const categoryOrClause = lookupTerms.map((term) => `name.ilike.%${term}%`).join(',');

  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .or(categoryOrClause);

  if (error) {
    console.warn('resolveCategoryIdsByTerms failed:', error.message);
    return [] as (string | number)[];
  }

  const ids: (string | number)[] = [];
  const seen = new Set<string>();

  for (const row of data ?? []) {
    const id = (row as any)?.id;
    if (typeof id !== 'string' && typeof id !== 'number') continue;

    const key = String(id);
    if (seen.has(key)) continue;

    seen.add(key);
    ids.push(id);
  }

  return ids;
};

const resolveCategoryIdsFromHints = async (hints: TravelCategoryHint[]) => {
  const normalizedHints = uniqueTerms((hints ?? []).map((item) => item.trim()).filter(Boolean)) as TravelCategoryHint[];
  if (normalizedHints.length === 0) return [];

  const hintTerms = uniqueTerms(
    normalizedHints
      .flatMap((hint) => CATEGORY_HINT_DB_TERMS[hint] ?? [hint])
      .filter(Boolean)
  );

  return resolveCategoryIdsByTerms(hintTerms);
};

const resolveCategoryIdsFromIntentType = async (intentType: TravelIntentType) => {
  const terms = INTENT_TYPE_CATEGORY_TERMS[intentType] ?? [];
  return resolveCategoryIdsByTerms(terms);
};

const formatCategoryIdForInOperator = (value: string | number) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }

  const sanitized = String(value ?? '')
    .replace(/"/g, '')
    .replace(/[(),]/g, ' ')
    .trim();

  return `"${sanitized}"`;
};

const buildAiGuidedOrClause = (input: {
  aiSuggestedPlaces: string[];
  categoryIds: (string | number)[];
  rawQuery: string;
  includeLocalizedColumns?: boolean;
}) => {
  const aiPlaceTerms = uniqueTerms(
    (input.aiSuggestedPlaces ?? [])
      .map((item) => sanitizeForIlikeValue(item))
      .filter((item) => item.length > 1)
  );

  const fallbackQueryTerms = extractQueryFallbackKeywords(input.rawQuery);

  const clauses: string[] = [];

  const tier1Terms = aiPlaceTerms.length > 0 ? aiPlaceTerms : fallbackQueryTerms;
  for (const term of tier1Terms) {
    clauses.push(`name.ilike.%${term}%`);
    clauses.push(`location.ilike.%${term}%`);
    clauses.push(`description.ilike.%${term}%`);

    if (input.includeLocalizedColumns) {
      clauses.push(`name_vi.ilike.%${term}%`);
      clauses.push(`name_en.ilike.%${term}%`);
      clauses.push(`description_vi.ilike.%${term}%`);
      clauses.push(`description_en.ilike.%${term}%`);
    }
  }

  if ((input.categoryIds ?? []).length > 0) {
    const formattedIds = input.categoryIds.map(formatCategoryIdForInOperator);
    clauses.push(`category_id.in.(${formattedIds.join(',')})`);
  }

  return uniqueTerms(clauses).join(',');
};

const getDestinationCategoryName = (row: DestinationDiscoveryRow): string => {
  const relation = row.categories as any;
  if (Array.isArray(relation)) {
    return String(relation[0]?.name ?? '').trim();
  }

  return String(relation?.name ?? '').trim();
};

const buildSemanticQueryText = (rawQuery: string) => {
  const intents = detectIntents(rawQuery);
  if (intents.length === 0) return rawQuery;

  const semanticHints = uniqueTerms(intents.flatMap((intent) => intent.semanticHints));
  return `${rawQuery}\nIntent hints: ${semanticHints.join(', ')}`;
};

const buildKeywordOrClause = (
  rawQuery: string,
  includeLocalizedColumns: boolean = destinationLocalizedColumnsSupported !== 'no'
) => {
  const trimmed = rawQuery.trim();
  const intents = detectIntents(trimmed);

  const clauses = [
    `name.ilike.%${trimmed}%`,
    `location.ilike.%${trimmed}%`,
    `description.ilike.%${trimmed}%`,
  ];

  if (includeLocalizedColumns) {
    clauses.push(`name_vi.ilike.%${trimmed}%`);
    clauses.push(`name_en.ilike.%${trimmed}%`);
    clauses.push(`description_vi.ilike.%${trimmed}%`);
    clauses.push(`description_en.ilike.%${trimmed}%`);
  }

  const keywordTerms = uniqueTerms(intents.flatMap((intent) => intent.keywordTerms));
  for (const term of keywordTerms) {
    clauses.push(`name.ilike.%${term}%`);
    clauses.push(`location.ilike.%${term}%`);
    clauses.push(`description.ilike.%${term}%`);

    if (includeLocalizedColumns) {
      clauses.push(`name_vi.ilike.%${term}%`);
      clauses.push(`name_en.ilike.%${term}%`);
      clauses.push(`description_vi.ilike.%${term}%`);
      clauses.push(`description_en.ilike.%${term}%`);
    }
  }

  return clauses.join(',');
};

const rerankByIntent = (rows: DestinationDiscoveryRow[], rawQuery: string): DestinationDiscoveryRow[] => {
  const activeIntents = detectIntents(rawQuery);
  if (activeIntents.length === 0) return rows;

  const scoreRow = (row: DestinationDiscoveryRow) => {
    const similarity = typeof row.similarity === 'number' && Number.isFinite(row.similarity)
      ? row.similarity
      : 0;
    const categoryName = normalizeIntentText(getDestinationCategoryName(row));
    const rowText = normalizeIntentText(
      `${row.name ?? ''} ${row.location ?? ''} ${row.description ?? ''} ${categoryName}`
    );

    let boost = 0;
    for (const intent of activeIntents) {
      if (hasAnyIntentTerm(rowText, intent.entityTerms)) {
        boost += intent.boost;
      }

      if (hasAnyIntentTerm(categoryName, intent.categoryTerms)) {
        boost += intent.categoryBoost;
      }

      if (
        intent.penaltyTerms &&
        intent.penaltyTerms.length > 0 &&
        hasAnyIntentTerm(rowText, intent.penaltyTerms) &&
        !hasAnyIntentTerm(rowText, intent.entityTerms)
      ) {
        boost -= intent.penalty ?? 0;
      }
    }

    return similarity + boost;
  };

  return [...rows].sort((a, b) => scoreRow(b) - scoreRow(a));
};

export const calculateAverageRating = (
  reviews: { rating: number | null | undefined }[] | null | undefined,
  decimals: number = 1
) => {
  const ratings = (reviews ?? [])
    .map((r) => (typeof r.rating === 'number' ? r.rating : NaN))
    .filter((n) => Number.isFinite(n));

  if (ratings.length === 0) return null;
  const avg = ratings.reduce((sum, n) => sum + n, 0) / ratings.length;
  const factor = Math.pow(10, decimals);
  return Math.round(avg * factor) / factor;
};

export const destinationService = {
  // Lấy danh sách Categories
  async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Lấy danh sách Destinations (kèm filter nếu cần)
  async getDestinations(input?: boolean | { isFeatured?: boolean; limit?: number; offset?: number }) {
    const options = typeof input === 'boolean' ? { isFeatured: input } : (input ?? {});
    const isFeatured = typeof options.isFeatured === 'boolean' ? options.isFeatured : undefined;
    const limit = typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(100, Math.floor(options.limit)))
      : null;
    const offset = typeof options.offset === 'number' && Number.isFinite(options.offset)
      ? Math.max(0, Math.floor(options.offset))
      : 0;

    let query = supabase.from('destinations').select('*, categories(name)');

    if (isFeatured !== undefined) {
      query = query.eq('is_featured', isFeatured);
    }

    query = query.order('created_at', { ascending: false });

    if (limit !== null) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 5
  ): Promise<PersonalizedRecommendationRow[]> {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) return [];

    const safeLimit = Math.max(1, Math.min(20, Math.floor(limit || 5)));

    const { data, error } = await supabase.rpc('get_personalized_recommendations', {
      p_user_id: normalizedUserId,
      p_limit: safeLimit,
    });

    if (error) throw error;

    const rowsRaw = Array.isArray(data) ? data : [];
    const seenIds = new Set<string>();
    const rows: PersonalizedRecommendationRow[] = [];

    for (const item of rowsRaw) {
      if (!item || typeof item !== 'object') continue;

      const normalized = normalizePersonalizedRecommendationRow(item as Record<string, unknown>);
      if (!normalized) continue;

      const dedupeKey = String(normalized.id);
      if (seenIds.has(dedupeKey)) continue;

      seenIds.add(dedupeKey);
      rows.push(normalized);
    }

    return rows;
  },

  async getNearbyTopRated(
    userLat: number,
    userLon: number,
    radiusKm: number = 5
  ): Promise<NearbyTopRatedRow[]> {
    const safeLat = Number(userLat);
    const safeLon = Number(userLon);
    if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) return [];

    const safeRadiusKm = Number.isFinite(Number(radiusKm))
      ? Math.max(0.5, Math.min(50, Number(radiusKm)))
      : 5;

    const { data, error } = await supabase.rpc('get_nearby_top_rated', {
      user_lat: safeLat,
      user_lon: safeLon,
      radius_km: safeRadiusKm,
    });

    if (error) throw error;

    const rowsRaw = Array.isArray(data) ? data : [];
    const seenIds = new Set<string>();
    const rows: NearbyTopRatedRow[] = [];

    for (const item of rowsRaw) {
      if (!item || typeof item !== 'object') continue;

      const normalized = normalizeNearbyTopRatedRow(item as Record<string, unknown>);
      if (!normalized) continue;

      const dedupeKey = String(normalized.id);
      if (seenIds.has(dedupeKey)) continue;

      seenIds.add(dedupeKey);
      rows.push(normalized);
    }

    rows.sort((a, b) => {
      const aDistance = typeof a.distance_km === 'number' && Number.isFinite(a.distance_km)
        ? a.distance_km
        : Number.POSITIVE_INFINITY;
      const bDistance = typeof b.distance_km === 'number' && Number.isFinite(b.distance_km)
        ? b.distance_km
        : Number.POSITIVE_INFINITY;

      if (aDistance !== bDistance) return aDistance - bDistance;

      const bRating = typeof b.rating === 'number' && Number.isFinite(b.rating) ? b.rating : 0;
      const aRating = typeof a.rating === 'number' && Number.isFinite(a.rating) ? a.rating : 0;
      return bRating - aRating;
    });

    return rows;
  },

  async searchAndFilterDestinations(
    input: SearchFilterDestinationsInput = {}
  ): Promise<SearchFilterDestinationRow[]> {
    const searchText = String(input.searchText ?? '').trim();
    const category = input.category && input.category !== 'all' ? input.category : null;
    const minRating = typeof input.minRating === 'number' && Number.isFinite(input.minRating)
      ? Math.max(0, Math.min(5, input.minRating))
      : 0;
    const maxPrice = typeof input.maxPrice === 'number' && Number.isFinite(input.maxPrice)
      ? Math.max(0, input.maxPrice)
      : null;
    const sortBy = input.sortBy ?? 'relevance';
    const limit = Number.isFinite(Number(input.limit))
      ? Math.max(1, Math.min(100, Number(input.limit)))
      : 40;
    const offset = Number.isFinite(Number(input.offset))
      ? Math.max(0, Number(input.offset))
      : 0;

    const payloadAttempts = [
      {
        query: searchText || null,
        category,
        min_rating: minRating,
        max_price: maxPrice,
        sort_by: sortBy,
        limit,
        offset,
      },
      {
        search_text: searchText || null,
        category_filter: category,
        min_rating: minRating,
        max_price: maxPrice,
        sort_by: sortBy,
        p_limit: limit,
        p_offset: offset,
      },
      {
        p_query: searchText || null,
        p_category: category,
        p_min_rating: minRating,
        p_max_price: maxPrice,
        p_sort_by: sortBy,
        p_limit: limit,
        p_offset: offset,
      },
    ];

    let rowsRaw: unknown[] | null = null;
    let lastError: any = null;

    for (const payload of payloadAttempts) {
      const { data, error } = await supabase.rpc('search_and_filter_destinations', payload as Record<string, unknown>);

      if (!error) {
        rowsRaw = Array.isArray(data) ? data : [];
        lastError = null;
        break;
      }

      lastError = error;
      const message = String((error as any)?.message ?? '').toLowerCase();
      const canRetryDifferentSignature =
        message.includes('search_and_filter_destinations') &&
        (message.includes('function') || message.includes('does not exist'));

      if (!canRetryDifferentSignature) {
        throw error;
      }
    }

    if (lastError) throw lastError;

    const seenIds = new Set<string>();
    const rows: SearchFilterDestinationRow[] = [];

    for (const item of rowsRaw ?? []) {
      if (!item || typeof item !== 'object') continue;

      const normalized = normalizePersonalizedRecommendationRow(item as Record<string, unknown>);
      if (!normalized) continue;

      const dedupeKey = String(normalized.id);
      if (seenIds.has(dedupeKey)) continue;

      seenIds.add(dedupeKey);
      rows.push(normalized);
    }

    return rows;
  },

  async getDestinationById(destinationId: string) {
    const { data, error } = await supabase
      .from('destinations')
      // explicit `address` to reflect newly-added DB field
      .select('*, address')
      .eq('id', destinationId)
      .single();

    if (error) throw error;
    return data;
  },

  async cacheDestinationDetail(destinationId: string, destinationRow: Record<string, any>) {
    if (!destinationId.trim()) return;
    if (!destinationRow || typeof destinationRow !== 'object') return;

    const payload: CachedDestinationDetailPayload = {
      destination: destinationRow,
      cachedAt: new Date().toISOString(),
    };

    try {
      await secureCacheService.setJson(buildDestinationCacheKey(destinationId), payload);
    } catch (error) {
      console.warn('cacheDestinationDetail failed:', error);
    }
  },

  async getCachedDestinationById(destinationId: string): Promise<CachedDestinationDetailPayload | null> {
    const normalizedId = destinationId.trim();
    if (!normalizedId) return null;

    try {
      const payload = await secureCacheService.getJson<CachedDestinationDetailPayload>(
        buildDestinationCacheKey(normalizedId)
      );
      if (!payload?.destination || typeof payload.destination !== 'object') return null;
      return payload;
    } catch (error) {
      console.warn('getCachedDestinationById failed:', error);
      return null;
    }
  },

  async getDestinationByIdWithOfflineCache(
    destinationId: string,
    options: { isOnline?: boolean } = {}
  ): Promise<DestinationDetailLookupResult> {
    const normalizedId = destinationId.trim();
    if (!normalizedId) {
      throw new Error('Missing destination id.');
    }

    const isOnline = options.isOnline !== false;
    if (!isOnline) {
      const cachedPayload = await this.getCachedDestinationById(normalizedId);
      if (!cachedPayload) {
        throw new Error('OFFLINE_CACHE_MISS');
      }

      return {
        data: cachedPayload.destination,
        source: 'cache',
        cachedAt: cachedPayload.cachedAt ?? null,
      };
    }

    try {
      const remoteRow = await this.getDestinationById(normalizedId);
      const normalizedRemoteRow =
        remoteRow && typeof remoteRow === 'object'
          ? (remoteRow as Record<string, any>)
          : null;

      if (normalizedRemoteRow) {
        await this.cacheDestinationDetail(normalizedId, normalizedRemoteRow);
      }

      return {
        data: normalizedRemoteRow,
        source: 'remote',
        cachedAt: null,
      };
    } catch (remoteError) {
      const cachedPayload = await this.getCachedDestinationById(normalizedId);
      if (cachedPayload) {
        return {
          data: cachedPayload.destination,
          source: 'cache',
          cachedAt: cachedPayload.cachedAt ?? null,
        };
      }

      throw remoteError;
    }
  },

  async searchDestinations(query: string) {
    const trimmed = query.trim();
    const result = await runDestinationQueryWithLocalizedFallback<DestinationDiscoveryRow>(
      async ({ selectColumns, supportsLocalizedColumns }) => {
        const orClause = buildKeywordOrClause(trimmed, supportsLocalizedColumns);

        return supabase
          .from('destinations')
          .select(selectColumns)
          .or(orClause)
          .order('name', { ascending: true });
      }
    );

    return result.rows;
  },

  async searchDestinationsByAI(
    queryText: string,
    options: DestinationSearchLanguageOptions = {}
  ): Promise<DestinationSmartSearchResult> {
    const trimmed = queryText.trim();
    const targetLanguage = normalizeSmartSearchLanguage(options.currentLanguage);

    if (!trimmed) {
      return {
        rows: [],
        localizationSource: 'default',
        targetLanguage,
      };
    }

    const finalizeRows = async (rows: DestinationDiscoveryRow[], usedLocalizedColumns: boolean) =>
      buildSmartSearchResult(rows, targetLanguage, usedLocalizedColumns);

    try {
      const intent = await extractTravelSearchIntent(trimmed, {
        currentLanguage: targetLanguage,
      });

      if (!intent.is_travel_related) {
        return {
          rows: [],
          localizationSource: 'default',
          targetLanguage,
        };
      }

      const hintCategoryIds = await resolveCategoryIdsFromHints(intent.category_hints);
      const intentCategoryIds = await resolveCategoryIdsFromIntentType(intent.intent_type);

      const mergedCategoryIds = uniqueTerms([
        ...intentCategoryIds.map((id) => String(id)),
        ...hintCategoryIds.map((id) => String(id)),
      ]);

      const categoryIds =
        intent.intent_type === 'spiritual' && intentCategoryIds.length > 0
          ? intentCategoryIds
          : mergedCategoryIds;

      const strictQueryResult = await runDestinationQueryWithLocalizedFallback<DestinationDiscoveryRow>(
        async ({ selectColumns, supportsLocalizedColumns }) => {
          const orClause = buildAiGuidedOrClause({
            aiSuggestedPlaces: intent.ai_suggested_places,
            categoryIds,
            rawQuery: trimmed,
            includeLocalizedColumns: supportsLocalizedColumns,
          });

          if (!orClause) {
            return { data: [], error: null };
          }

          let guidedQuery = supabase
            .from('destinations')
            .select(selectColumns)
            .or(orClause);

          if (intent.is_free === true) {
            guidedQuery = guidedQuery.eq('price', 0);
          } else if (intent.is_free === false) {
            guidedQuery = guidedQuery.gt('price', 0);
          }

          return guidedQuery
            .order('rating', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(80);
        }
      );

      const strictRows = strictQueryResult.rows;
      if (strictRows.length > 0) {
        return finalizeRows(rerankByIntent(strictRows, trimmed), strictQueryResult.usedLocalizedColumns);
      }

      const fallbackQueryResult = await runDestinationQueryWithLocalizedFallback<DestinationDiscoveryRow>(
        async ({ selectColumns, supportsLocalizedColumns }) => {
          const fallbackKeywordClause = buildKeywordOrClause(trimmed, supportsLocalizedColumns);
          if (!fallbackKeywordClause) {
            return { data: [], error: null };
          }

          let fallbackQuery = supabase
            .from('destinations')
            .select(selectColumns)
            .or(fallbackKeywordClause);

          if (intent.is_free === true) {
            fallbackQuery = fallbackQuery.eq('price', 0);
          } else if (intent.is_free === false) {
            fallbackQuery = fallbackQuery.gt('price', 0);
          }

          return fallbackQuery
            .order('rating', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(60);
        }
      );

      return finalizeRows(
        rerankByIntent(fallbackQueryResult.rows, trimmed),
        fallbackQueryResult.usedLocalizedColumns
      );
    } catch (intentErr: any) {
      console.warn('searchDestinationsByAI strict intent path failed, fallback to embeddings:', intentErr?.message ?? intentErr);

      try {
        const activeIntents = detectIntents(trimmed);
        const queryEmbedding = await generateEmbedding(buildSemanticQueryText(trimmed));

        const { data: matchRowsRaw, error: matchError } = await supabase.rpc('match_destinations', {
          query_embedding: queryEmbedding,
          match_threshold: 0.15,
          match_count: 40,
        });

        if (matchError) throw matchError;

        const matchRows = (matchRowsRaw ?? []) as DestinationVectorMatchRow[];
        const orderedIds = matchRows
          .map((row) => String(row.id ?? '').trim())
          .filter(Boolean);

        if (orderedIds.length === 0) {
          const fallback = await this.searchDestinations(trimmed);
          return finalizeRows((fallback ?? []) as DestinationDiscoveryRow[], false);
        }

        const similarityById = new Map<string, number | null>();
        for (const row of matchRows) {
          const id = String(row.id ?? '').trim();
          if (!id) continue;

          const similarity = typeof row.similarity === 'number' && Number.isFinite(row.similarity)
            ? row.similarity
            : null;
          similarityById.set(id, similarity);
        }

        const destinationLookup = await runDestinationQueryWithLocalizedFallback<DestinationDiscoveryRow>(
          async ({ selectColumns }) =>
            supabase
              .from('destinations')
              .select(selectColumns)
              .in('id', orderedIds)
        );

        const rowById = new Map<string, DestinationDiscoveryRow>();
        for (const row of destinationLookup.rows ?? []) {
          const id = String((row as any)?.id ?? '').trim();
          if (!id) continue;
          rowById.set(id, row as DestinationDiscoveryRow);
        }

        const orderedRows: DestinationDiscoveryRow[] = [];
        for (const id of orderedIds) {
          const row = rowById.get(id);
          if (!row) continue;

          orderedRows.push({
            ...row,
            similarity: similarityById.get(id) ?? null,
          });
        }

        let keywordRows: DestinationDiscoveryRow[] = [];
        if (activeIntents.length > 0) {
          const keywordFallback = await this.searchDestinations(trimmed);
          keywordRows = (keywordFallback ?? []) as DestinationDiscoveryRow[];
        }

        if (orderedRows.length === 0) {
          if (keywordRows.length > 0) {
            return finalizeRows(rerankByIntent(keywordRows, trimmed), false);
          }

          const fallback = await this.searchDestinations(trimmed);
          return finalizeRows((fallback ?? []) as DestinationDiscoveryRow[], false);
        }

        let blendedRows = orderedRows;
        if (keywordRows.length > 0) {
          const mergedById = new Map<string, DestinationDiscoveryRow>();

          for (const row of orderedRows) {
            const id = String(row.id ?? '').trim();
            if (!id) continue;
            mergedById.set(id, row);
          }

          for (const row of keywordRows) {
            const id = String(row.id ?? '').trim();
            if (!id || mergedById.has(id)) continue;

            mergedById.set(id, {
              ...row,
              similarity:
                typeof row.similarity === 'number' && Number.isFinite(row.similarity)
                  ? row.similarity
                  : 0.12,
            });
          }

          blendedRows = Array.from(mergedById.values());
        }

        return finalizeRows(
          rerankByIntent(blendedRows, trimmed),
          destinationLookup.usedLocalizedColumns
        );
      } catch (err: any) {
        console.warn('searchDestinationsByAI fallback to keyword search:', err?.message ?? err);
        const fallback = await this.searchDestinations(trimmed);
        return finalizeRows((fallback ?? []) as DestinationDiscoveryRow[], false);
      }
    }
  },

  async getAutocompleteSuggestions(rawQuery: string, limitPerType: number = 5): Promise<DiscoverySearchSuggestion[]> {
    const query = rawQuery.trim();
    if (!query) return [];

    const limit = Math.max(1, Math.min(10, limitPerType));

    const [destRes, eventRes] = await Promise.all([
      supabase
        .from('destinations')
        .select('id, name, location')
        .ilike('name', `%${query}%`)
        .order('name', { ascending: true })
        .limit(limit),
      supabase
        .from('events')
        .select('id, title, location')
        .eq('approval_status', 'approved')
        .ilike('title', `%${query}%`)
        .order('title', { ascending: true })
        .limit(limit),
    ]);

    if (destRes.error) throw destRes.error;
    if (eventRes.error) throw eventRes.error;

    const destinationItems: DiscoverySearchSuggestion[] = (destRes.data ?? []).map((row: any) => ({
      id: `destination:${String(row.id)}`,
      label: String(row.name ?? ''),
      type: 'destination' as const,
      subtitle: typeof row.location === 'string' ? row.location : undefined,
    }));

    const eventItems: DiscoverySearchSuggestion[] = (eventRes.data ?? []).map((row: any) => ({
      id: `event:${String(row.id)}`,
      label: String(row.title ?? ''),
      type: 'event' as const,
      subtitle: typeof row.location === 'string' ? row.location : undefined,
    }));

    const seen = new Set<string>();
    const merged: DiscoverySearchSuggestion[] = [];
    for (const item of [...destinationItems, ...eventItems]) {
      const key = `${item.type}:${item.label.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }

    return merged;
  },

  async getDestinationsForDiscovery(filters: DiscoveryQueryFilters = {}): Promise<DestinationDiscoveryRow[]> {
    const search = filters.search?.trim();
    const sort = filters.sort ?? 'relevance';
    const priceFilter = filters.priceFilter ?? 'all';
    const limit = Math.max(1, Math.min(100, filters.limit ?? 40));
    const offset = Math.max(0, filters.offset ?? 0);

    let query = supabase
      .from('destinations')
      .select('id, name, location, price, rating, image_url, category_id, latitude, longitude, created_at, categories(name)');

    if (search) {
      query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%`);
    }

    if (filters.categoryId !== null && typeof filters.categoryId !== 'undefined') {
      query = query.eq('category_id', filters.categoryId);
    } else if (filters.categoryName && filters.categoryName !== 'all') {
      query = query.eq('categories.name', filters.categoryName);
    }

    if (typeof filters.ratingMin === 'number' && Number.isFinite(filters.ratingMin)) {
      query = query.gte('rating', filters.ratingMin);
    }

    if (priceFilter === 'free') {
      query = query.eq('price', 0);
    } else if (priceFilter === 'paid') {
      query = query.gt('price', 0);
    }

    if (sort === 'top-rated') {
      query = query
        .order('rating', { ascending: false })
        .order('name', { ascending: true })
        .order('id', { ascending: true });
    } else if (sort === 'a-z') {
      query = query.order('name', { ascending: true }).order('id', { ascending: true });
    } else {
      query = query
        .order(search ? 'rating' : 'created_at', { ascending: false })
        .order('id', { ascending: true });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as DestinationDiscoveryRow[];
  },

  async getEventsForDiscovery(filters: DiscoveryQueryFilters = {}): Promise<EventDiscoveryRow[]> {
    const search = filters.search?.trim();
    const sort = filters.sort ?? 'relevance';
    const priceFilter = filters.priceFilter ?? 'all';
    const limit = Math.max(1, Math.min(100, filters.limit ?? 40));
    const offset = Math.max(0, filters.offset ?? 0);
    const currentUserId = await getCurrentUserIdSafe();

    const buildQuery = (useRatingColumn: boolean, useApprovalFilter: boolean) => {
      let query = supabase.from('events').select('*');

      if (useApprovalFilter && !currentUserId) {
        query = query.eq('approval_status', 'approved');
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`);
      }

      if (filters.categoryName && filters.categoryName !== 'all') {
        query = query.eq('category', filters.categoryName);
      }

      if (priceFilter === 'free') {
        query = query.eq('price', 0);
      } else if (priceFilter === 'paid') {
        query = query.gt('price', 0);
      }

      if (typeof filters.ratingMin === 'number' && Number.isFinite(filters.ratingMin) && useRatingColumn) {
        query = query.gte('rating', filters.ratingMin);
      }

      if (sort === 'a-z') {
        query = query.order('title', { ascending: true });
      } else if (sort === 'top-rated') {
        query = useRatingColumn
          ? query.order('rating', { ascending: false }).order('title', { ascending: true })
          : query.order('start_time', { ascending: true });
      } else {
        query = query.order(search ? 'start_time' : 'created_at', { ascending: search ? true : false });
      }

      return query.range(offset, offset + limit - 1);
    };

    let useRatingColumn = true;
    let useApprovalFilter = true;
    let result = await buildQuery(useRatingColumn, useApprovalFilter);

    for (let attempt = 0; result.error && attempt < 2; attempt += 1) {
      const missingRating = useRatingColumn && isMissingColumnError(result.error, 'rating');
      const missingApprovalStatus = useApprovalFilter && isMissingColumnError(result.error, 'approval_status');

      if (!missingRating && !missingApprovalStatus) {
        break;
      }

      if (missingRating) {
        useRatingColumn = false;
      }

      if (missingApprovalStatus) {
        useApprovalFilter = false;
      }

      result = await buildQuery(useRatingColumn, useApprovalFilter);
    }

    if (result.error) throw result.error;
    return (result.data ?? []) as EventDiscoveryRow[];
  },

  async getDestinationsByInterests(interests: string[], limit: number = 20) {
    const normalized = (interests ?? []).map((s) => s.trim()).filter(Boolean);
    if (normalized.length === 0) return [];

    const { data, error } = await supabase
      .from('destinations')
      .select('*, categories(name)')
      // requires: destinations.tags is a Postgres text[] column
      .overlaps('tags', normalized)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  async getDestinationsForCurrentUserInterests(limit: number = 20) {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = userRes.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', userId)
      .single();

    if (profileErr) throw profileErr;

    const interests = Array.isArray((profile as any)?.interests) ? ((profile as any).interests as string[]) : [];
    return this.getDestinationsByInterests(interests, limit);
  },

  async getReviewsPage(destinationId: string, input?: { from?: number; limit?: number }) {
    const from = Math.max(0, Number(input?.from ?? 0));
    const limit = Math.min(50, Math.max(1, Number(input?.limit ?? 10)));
    const to = from + limit - 1;

    // Fetch only snake_case columns from `reviews`, then fetch related `profiles` separately.
    // This avoids PostgREST 400 errors when the FK relationship name isn't exposed/recognized.
    const runQuery = (withImageUrlsColumn: boolean, withAdminReplyColumn: boolean) => {
      const columns = [
        'id',
        'user_id',
        'destination_id',
        'rating',
        'comment',
        'helpful_count',
        'reply_text',
        'replied_at',
        'replied_by',
      ];

      if (withAdminReplyColumn) columns.push('admin_reply');
      if (withImageUrlsColumn) columns.push('review_image_urls');
      columns.push('created_at');

      const selectColumns = columns.join(', ');

      return supabase
        .from('reviews')
        .select(selectColumns, { count: 'exact' })
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false })
        .range(from, to);
    };

    let includeImageUrls = true;
    let includeAdminReply = true;
    let reviewsRes = await runQuery(includeImageUrls, includeAdminReply);

    if (reviewsRes.error) {
      const errorMessage = String((reviewsRes.error as any)?.message ?? '').toLowerCase();
      const shouldRetryWithoutImageUrls = errorMessage.includes('review_image_urls') && errorMessage.includes('does not exist');
      const shouldRetryWithoutAdminReply = errorMessage.includes('admin_reply') && errorMessage.includes('does not exist');

      if (shouldRetryWithoutImageUrls || shouldRetryWithoutAdminReply) {
        includeImageUrls = !shouldRetryWithoutImageUrls;
        includeAdminReply = !shouldRetryWithoutAdminReply;
        reviewsRes = await runQuery(includeImageUrls, includeAdminReply);
      }
    }

    if (reviewsRes.error) throw reviewsRes.error;

    const rows = (reviewsRes.data ?? []) as unknown as ReviewRow[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const reviewIds = rows.map((r) => r.id).filter(Boolean);

    let currentUserId: string | null = null;
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!userErr) {
        currentUserId = userRes.user?.id ?? null;
      }
    } catch {
      currentUserId = null;
    }

    let viewerHelpfulVoteSet = new Set<string>();
    if (currentUserId && reviewIds.length > 0) {
      const { data: votes, error: votesErr } = await supabase
        .from('review_helpful_votes')
        .select('review_id')
        .eq('user_id', currentUserId)
        .in('review_id', reviewIds);

      if (!votesErr) {
        viewerHelpfulVoteSet = new Set(
          (votes ?? [])
            .map((row: any) => String(row?.review_id ?? '').trim())
            .filter(Boolean)
        );
      }
    }

    if (userIds.length === 0) {
      return {
        rows: rows.map((row) => ({
          ...row,
          viewer_has_helpful_vote: viewerHelpfulVoteSet.has(String(row.id)),
        })),
        totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
      };
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (profilesErr) {
      return {
        rows: rows.map((row) => ({
          ...row,
          viewer_has_helpful_vote: viewerHelpfulVoteSet.has(String(row.id)),
        })),
        totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
      };
    }

    const profileById = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
    for (const p of profiles ?? []) {
      const id = (p as any)?.id as string | undefined;
      if (!id) continue;
      profileById.set(id, {
        full_name: (p as any)?.full_name ?? null,
        avatar_url: (p as any)?.avatar_url ?? null,
      });
    }

    const merged = rows.map((r) => ({
      ...r,
      profiles: profileById.get(r.user_id) ?? null,
      viewer_has_helpful_vote: viewerHelpfulVoteSet.has(String(r.id)),
    }));

    return {
      rows: merged,
      totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
    };
  },

  async getReviews(destinationId: string) {
    const runQuery = (withImageUrlsColumn: boolean, withAdminReplyColumn: boolean) => {
      const columns = [
        'id',
        'user_id',
        'destination_id',
        'rating',
        'comment',
        'helpful_count',
        'reply_text',
        'replied_at',
        'replied_by',
      ];

      if (withAdminReplyColumn) columns.push('admin_reply');
      if (withImageUrlsColumn) columns.push('review_image_urls');
      columns.push('created_at');

      const selectColumns = columns.join(', ');

      return supabase
        .from('reviews')
        .select(selectColumns)
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false });
    };

    let includeImageUrls = true;
    let includeAdminReply = true;
    let reviewsRes = await runQuery(includeImageUrls, includeAdminReply);

    if (reviewsRes.error) {
      const errorMessage = String((reviewsRes.error as any)?.message ?? '').toLowerCase();
      const shouldRetryWithoutImageUrls = errorMessage.includes('review_image_urls') && errorMessage.includes('does not exist');
      const shouldRetryWithoutAdminReply = errorMessage.includes('admin_reply') && errorMessage.includes('does not exist');

      if (shouldRetryWithoutImageUrls || shouldRetryWithoutAdminReply) {
        includeImageUrls = !shouldRetryWithoutImageUrls;
        includeAdminReply = !shouldRetryWithoutAdminReply;
        reviewsRes = await runQuery(includeImageUrls, includeAdminReply);
      }
    }

    if (reviewsRes.error) throw reviewsRes.error;

    const rows = (reviewsRes.data ?? []) as unknown as ReviewRow[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const reviewIds = rows.map((r) => r.id).filter(Boolean);

    let currentUserId: string | null = null;
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!userErr) {
        currentUserId = userRes.user?.id ?? null;
      }
    } catch {
      currentUserId = null;
    }

    let viewerHelpfulVoteSet = new Set<string>();
    if (currentUserId && reviewIds.length > 0) {
      const { data: votes, error: votesErr } = await supabase
        .from('review_helpful_votes')
        .select('review_id')
        .eq('user_id', currentUserId)
        .in('review_id', reviewIds);

      if (!votesErr) {
        viewerHelpfulVoteSet = new Set(
          (votes ?? [])
            .map((row: any) => String(row?.review_id ?? '').trim())
            .filter(Boolean)
        );
      }
    }

    if (userIds.length === 0) {
      return rows.map((row) => ({
        ...row,
        viewer_has_helpful_vote: viewerHelpfulVoteSet.has(String(row.id)),
      }));
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (profilesErr) {
      return rows.map((row) => ({
        ...row,
        viewer_has_helpful_vote: viewerHelpfulVoteSet.has(String(row.id)),
      }));
    }

    const profileById = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
    for (const p of profiles ?? []) {
      const id = (p as any)?.id as string | undefined;
      if (!id) continue;
      profileById.set(id, {
        full_name: (p as any)?.full_name ?? null,
        avatar_url: (p as any)?.avatar_url ?? null,
      });
    }

    return rows.map((r) => ({
      ...r,
      profiles: profileById.get(r.user_id) ?? null,
      viewer_has_helpful_vote: viewerHelpfulVoteSet.has(String(r.id)),
    }));
  },

  async submitReview(reviewData: SubmitReviewInput) {
    const rating = Number(reviewData.rating);
    if (!Number.isFinite(rating)) {
      throw new Error('Invalid rating');
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = reviewData.user_id ?? userRes.user?.id;
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const payload = {
      user_id: userId,
      destination_id: reviewData.destination_id,
      rating,
      comment: reviewData.comment ?? null,
      review_image_urls: (reviewData.imageUrls ?? []).filter((url) => typeof url === 'string' && url.trim()),
    };

    let { data, error } = await supabase
      .from('reviews')
      .insert(payload)
      .select('id, user_id, destination_id, rating, comment, helpful_count, reply_text, replied_at, replied_by, review_image_urls, created_at')
      .single();

    if (error) {
      const errorMessage = String((error as any)?.message ?? '').toLowerCase();
      const shouldRetryWithoutImageUrls = errorMessage.includes('review_image_urls') && errorMessage.includes('does not exist');
      if (shouldRetryWithoutImageUrls) {
        const fallbackPayload = {
          user_id: userId,
          destination_id: reviewData.destination_id,
          rating,
          comment: reviewData.comment ?? null,
        };

        const fallbackRes = await supabase
          .from('reviews')
          .insert(fallbackPayload)
          .select('id, user_id, destination_id, rating, comment, helpful_count, reply_text, replied_at, replied_by, created_at')
          .single();

        data = fallbackRes.data as any;
        error = fallbackRes.error as any;
      }
    }

    if (error) throw error;
    return data as ReviewRow;
  },
};
