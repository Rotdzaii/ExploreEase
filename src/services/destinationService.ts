import { extractTravelSearchIntent, generateEmbedding, type TravelCategoryHint, type TravelIntentType } from './aiService';
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
  location?: string | null;
  description?: string | null;
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

const buildKeywordOrClause = (rawQuery: string) => {
  const trimmed = rawQuery.trim();
  const intents = detectIntents(trimmed);

  const clauses = [
    `name.ilike.%${trimmed}%`,
    `location.ilike.%${trimmed}%`,
    `description.ilike.%${trimmed}%`,
  ];

  const keywordTerms = uniqueTerms(intents.flatMap((intent) => intent.keywordTerms));
  for (const term of keywordTerms) {
    clauses.push(`name.ilike.%${term}%`);
    clauses.push(`location.ilike.%${term}%`);
    clauses.push(`description.ilike.%${term}%`);
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
  async getDestinations(isFeatured?: boolean) {
    let query = supabase.from('destinations').select('*, categories(name)');
    
    if (isFeatured !== undefined) {
      query = query.eq('is_featured', isFeatured);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
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
    const orClause = buildKeywordOrClause(trimmed);

    const { data, error } = await supabase
      .from('destinations')
      .select('*, categories(name)')
      .or(orClause)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  },

  async searchDestinationsByAI(queryText: string): Promise<DestinationDiscoveryRow[]> {
    const trimmed = queryText.trim();
    if (!trimmed) return [];

    const destinationSelect =
      'id, name, location, description, price, rating, image_url, category_id, latitude, longitude, created_at, categories(name)';

    try {
      const intent = await extractTravelSearchIntent(trimmed);

      if (!intent.is_travel_related) {
        return [];
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

      const orClause = buildAiGuidedOrClause({
        aiSuggestedPlaces: intent.ai_suggested_places,
        categoryIds,
        rawQuery: trimmed,
      });

      if (!orClause) {
        return [];
      }

      let guidedQuery = supabase
        .from('destinations')
        .select(destinationSelect)
        .or(orClause);

      if (intent.is_free === true) {
        guidedQuery = guidedQuery.eq('price', 0);
      } else if (intent.is_free === false) {
        guidedQuery = guidedQuery.gt('price', 0);
      }

      const { data: strictRowsRaw, error: strictError } = await guidedQuery
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(80);

      if (strictError) throw strictError;

      const strictRows = (strictRowsRaw ?? []) as DestinationDiscoveryRow[];
      if (strictRows.length > 0) {
        return rerankByIntent(strictRows, trimmed);
      }

      const fallbackKeywordClause = buildKeywordOrClause(trimmed);
      if (!fallbackKeywordClause) {
        return [];
      }

      let fallbackQuery = supabase
        .from('destinations')
        .select(destinationSelect)
        .or(fallbackKeywordClause);

      if (intent.is_free === true) {
        fallbackQuery = fallbackQuery.eq('price', 0);
      } else if (intent.is_free === false) {
        fallbackQuery = fallbackQuery.gt('price', 0);
      }

      const { data: fallbackRowsRaw, error: fallbackError } = await fallbackQuery
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);

      if (fallbackError) throw fallbackError;

      return rerankByIntent((fallbackRowsRaw ?? []) as DestinationDiscoveryRow[], trimmed);
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
          return (fallback ?? []) as DestinationDiscoveryRow[];
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

        const { data: destinationRows, error: destinationError } = await supabase
          .from('destinations')
          .select(destinationSelect)
          .in('id', orderedIds);

        if (destinationError) throw destinationError;

        const rowById = new Map<string, DestinationDiscoveryRow>();
        for (const row of destinationRows ?? []) {
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
            return rerankByIntent(keywordRows, trimmed);
          }

          const fallback = await this.searchDestinations(trimmed);
          return (fallback ?? []) as DestinationDiscoveryRow[];
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

        return rerankByIntent(blendedRows, trimmed);
      } catch (err: any) {
        console.warn('searchDestinationsByAI fallback to keyword search:', err?.message ?? err);
        const fallback = await this.searchDestinations(trimmed);
        return (fallback ?? []) as DestinationDiscoveryRow[];
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
      query = query.order('rating', { ascending: false }).order('name', { ascending: true });
    } else if (sort === 'a-z') {
      query = query.order('name', { ascending: true });
    } else {
      query = query.order(search ? 'rating' : 'created_at', { ascending: false });
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

    const buildQuery = (useRatingColumn: boolean) => {
      let query = supabase.from('events').select('*').eq('approval_status', 'approved');

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

    let result = await buildQuery(true);
    if (result.error) {
      const msg = String((result.error as any)?.message ?? '').toLowerCase();
      const shouldRetryWithoutRating = msg.includes('rating') && msg.includes('does not exist');

      if (!shouldRetryWithoutRating) {
        throw result.error;
      }

      result = await buildQuery(false);
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
