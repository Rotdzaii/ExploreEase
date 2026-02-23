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
      .select('*')
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

  async getReviews(destinationId: string) {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, user_id, destination_id, rating, comment, created_at, profiles(full_name, avatar_url)')
      .eq('destination_id', destinationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as ReviewRow[];
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
