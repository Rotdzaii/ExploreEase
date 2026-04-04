import { supabase } from './supabase';

export type EventReviewRow = {
  id: string;
  event_id: string;
  user_id: string;
  rating: number;
  comment?: string | null;
  review_image_urls?: string[] | null;
  reply_text?: string | null;
  replied_at?: string | null;
  replied_by?: string | null;
  helpful_count?: number;
  viewer_has_helpful_vote?: boolean;
  created_at?: string | null;
  profiles?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type SubmitEventReviewInput = {
  event_id: string;
  rating: number;
  comment?: string | null;
  imageUrls?: string[] | null;
  user_id?: string;
};

export type ToggleHelpfulResult = {
  isHelpful: boolean;
  helpfulCount: number;
};

export type ReportEventReviewInput = {
  reviewId: string;
  reason: string;
};

export type ReplyToEventReviewInput = {
  reviewId: string;
  replyText: string;
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');

  return userId;
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

export const eventReviewService = {
  async getEventReviewsPage(eventId: string, input?: { from?: number; limit?: number }) {
    const from = Math.max(0, Number(input?.from ?? 0));
    const limit = Math.min(50, Math.max(1, Number(input?.limit ?? 10)));
    const to = from + limit - 1;

    const reviewsRes = await supabase
      .from('event_reviews')
      .select('id, event_id, user_id, rating, comment, review_image_urls, reply_text, replied_at, replied_by, created_at', { count: 'exact' })
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (reviewsRes.error) throw reviewsRes.error;

    const rows = (reviewsRes.data ?? []) as EventReviewRow[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const reviewIds = rows.map((r) => r.id).filter(Boolean);

    const helpfulCountMap = new Map<string, number>();
    if (reviewIds.length > 0) {
      const { data: allVotes, error: allVotesErr } = await supabase
        .from('event_review_helpful_votes')
        .select('review_id')
        .in('review_id', reviewIds);

      if (!allVotesErr) {
        for (const vote of allVotes ?? []) {
          const reviewId = String((vote as any)?.review_id ?? '').trim();
          if (!reviewId) continue;
          helpfulCountMap.set(reviewId, (helpfulCountMap.get(reviewId) ?? 0) + 1);
        }
      }
    }

    let currentUserId: string | null = null;
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!userErr) currentUserId = userRes.user?.id ?? null;
    } catch {
      currentUserId = null;
    }

    let viewerHelpfulVoteSet = new Set<string>();
    if (currentUserId && reviewIds.length > 0) {
      const { data: votes, error: votesErr } = await supabase
        .from('event_review_helpful_votes')
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

    const attachHelpful = (row: EventReviewRow): EventReviewRow => {
      const reviewId = String(row.id);
      return {
        ...row,
        helpful_count: helpfulCountMap.get(reviewId) ?? 0,
        viewer_has_helpful_vote: viewerHelpfulVoteSet.has(reviewId),
      };
    };

    if (userIds.length === 0) {
      return {
        rows: rows.map(attachHelpful),
        totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
      };
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (profilesErr) {
      return {
        rows: rows.map(attachHelpful),
        totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
      };
    }

    const profileById = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
    for (const profile of profiles ?? []) {
      const id = (profile as any)?.id as string | undefined;
      if (!id) continue;
      profileById.set(id, {
        full_name: (profile as any)?.full_name ?? null,
        avatar_url: (profile as any)?.avatar_url ?? null,
      });
    }

    return {
      rows: rows.map((row) => ({
        ...attachHelpful(row),
        profiles: profileById.get(row.user_id) ?? null,
      })),
      totalCount: typeof reviewsRes.count === 'number' ? reviewsRes.count : null,
    };
  },

  async submitEventReview(input: SubmitEventReviewInput) {
    const rating = Number(input.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('Invalid rating');
    }

    const userId = input.user_id ?? await ensureAuthenticatedUserId();

    const payload = {
      event_id: input.event_id,
      user_id: userId,
      rating,
      comment: input.comment ?? null,
      review_image_urls: (input.imageUrls ?? []).filter((url) => typeof url === 'string' && url.trim()),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('event_reviews')
      .upsert(payload, { onConflict: 'event_id,user_id' })
      .select('id, event_id, user_id, rating, comment, review_image_urls, reply_text, replied_at, replied_by, created_at')
      .single();

    if (error) throw error;
    return data as EventReviewRow;
  },

  async toggleHelpful(reviewId: string): Promise<ToggleHelpfulResult> {
    const trimmedReviewId = reviewId?.trim();
    if (!trimmedReviewId) throw new Error('Review ID is required');

    const userId = await ensureAuthenticatedUserId();

    const { data: existingVote, error: voteErr } = await supabase
      .from('event_review_helpful_votes')
      .select('id')
      .eq('review_id', trimmedReviewId)
      .eq('user_id', userId)
      .maybeSingle();

    if (voteErr) throw voteErr;

    if (existingVote?.id) {
      const { error: deleteErr } = await supabase
        .from('event_review_helpful_votes')
        .delete()
        .eq('id', existingVote.id)
        .eq('user_id', userId);

      if (deleteErr) throw deleteErr;
    } else {
      const { error: insertErr } = await supabase
        .from('event_review_helpful_votes')
        .insert({
          review_id: trimmedReviewId,
          user_id: userId,
        });

      if (insertErr) throw insertErr;
    }

    const { count, error: countErr } = await supabase
      .from('event_review_helpful_votes')
      .select('*', { count: 'exact', head: true })
      .eq('review_id', trimmedReviewId);

    if (countErr) throw countErr;

    return {
      isHelpful: !existingVote?.id,
      helpfulCount: typeof count === 'number' ? count : 0,
    };
  },

  async reportReview(input: ReportEventReviewInput) {
    const reviewId = input.reviewId?.trim();
    const reason = input.reason?.trim();

    if (!reviewId) throw new Error('Review ID is required');
    if (!reason) throw new Error('Report reason is required');

    const reporterId = await ensureAuthenticatedUserId();

    const { data, error } = await supabase
      .from('event_review_reports')
      .upsert(
        {
          review_id: reviewId,
          reporter_id: reporterId,
          reason,
          status: 'pending',
        },
        { onConflict: 'review_id,reporter_id' }
      )
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async replyToReview(input: ReplyToEventReviewInput) {
    const reviewId = input.reviewId?.trim();
    const replyText = input.replyText?.trim();

    if (!reviewId) throw new Error('Review ID is required');
    if (!replyText) throw new Error('Reply text is required');

    const userId = await ensureAuthenticatedUserId();

    const { data, error } = await supabase
      .from('event_reviews')
      .update({
        reply_text: replyText,
        replied_at: new Date().toISOString(),
        replied_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select('id, reply_text, replied_at, replied_by')
      .single();

    if (error) throw error;
    return data;
  },
};
