import { supabase } from './supabase';

export type ReviewRow = {
  id: string;
  user_id: string;
  destination_id: string | number;
  rating: number;
  comment?: string | null;
  helpful_count?: number | null;
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
  price?: number | string | null;
  rating?: number | null;
  image_url?: string | null;
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

  async searchDestinations(query: string) {
    const trimmed = query.trim();
    const { data, error } = await supabase
      .from('destinations')
      .select('*, categories(name)')
      .ilike('name', `%${trimmed}%`)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
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
      .select('id, name, location, price, rating, image_url, category_id, latitude, longitude, lat, lng, created_at, categories(name)');

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
    const runQuery = (withImageUrlsColumn: boolean) => {
      const selectColumns = withImageUrlsColumn
        ? 'id, user_id, destination_id, rating, comment, helpful_count, reply_text, replied_at, replied_by, review_image_urls, created_at'
        : 'id, user_id, destination_id, rating, comment, helpful_count, reply_text, replied_at, replied_by, created_at';

      return supabase
        .from('reviews')
        .select(selectColumns, { count: 'exact' })
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false })
        .range(from, to);
    };

    let reviewsRes = await runQuery(true);
    if (reviewsRes.error) {
      const errorMessage = String((reviewsRes.error as any)?.message ?? '').toLowerCase();
      const shouldRetryWithoutImageUrls = errorMessage.includes('review_image_urls') && errorMessage.includes('does not exist');
      if (shouldRetryWithoutImageUrls) {
        reviewsRes = await runQuery(false);
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
    const runQuery = (withImageUrlsColumn: boolean) => {
      const selectColumns = withImageUrlsColumn
        ? 'id, user_id, destination_id, rating, comment, helpful_count, reply_text, replied_at, replied_by, review_image_urls, created_at'
        : 'id, user_id, destination_id, rating, comment, helpful_count, reply_text, replied_at, replied_by, created_at';

      return supabase
        .from('reviews')
        .select(selectColumns)
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false });
    };

    let reviewsRes = await runQuery(true);
    if (reviewsRes.error) {
      const errorMessage = String((reviewsRes.error as any)?.message ?? '').toLowerCase();
      const shouldRetryWithoutImageUrls = errorMessage.includes('review_image_urls') && errorMessage.includes('does not exist');
      if (shouldRetryWithoutImageUrls) {
        reviewsRes = await runQuery(false);
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
