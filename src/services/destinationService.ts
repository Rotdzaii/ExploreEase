import { supabase } from './supabase';

export type ReviewRow = {
  id: string;
  user_id: string;
  destination_id: string | number;
  rating: number;
  comment?: string | null;
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
  user_id?: string;
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
    const reviewsRes = await supabase
      .from('reviews')
      .select('id, user_id, destination_id, rating, comment, created_at', { count: 'exact' })
      .eq('destination_id', destinationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (reviewsRes.error) throw reviewsRes.error;

    const rows = (reviewsRes.data ?? []) as ReviewRow[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

    if (userIds.length === 0) {
      return {
        rows,
        totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
      };
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (profilesErr) {
      return {
        rows,
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
    }));

    return {
      rows: merged,
      totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
    };
  },

  async getReviews(destinationId: string) {
    const reviewsRes = await supabase
      .from('reviews')
      .select('id, user_id, destination_id, rating, comment, created_at')
      .eq('destination_id', destinationId)
      .order('created_at', { ascending: false });

    if (reviewsRes.error) throw reviewsRes.error;

    const rows = (reviewsRes.data ?? []) as ReviewRow[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    if (userIds.length === 0) return rows;

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (profilesErr) return rows;

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
    };

    const { data, error } = await supabase
      .from('reviews')
      .insert(payload)
      .select('id, user_id, destination_id, rating, comment, created_at')
      .single();

    if (error) throw error;
    return data as ReviewRow;
  },
};
