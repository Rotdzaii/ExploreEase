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
  created_at?: string | null;
};

export type ToggleHelpfulResult = {
  isHelpful: boolean;
  helpfulCount: number;
};

export type ReportReviewInput = {
  reviewId: string;
  reason: string;
};

export type ReviewReportRow = {
  id: string;
  review_id: string;
  reporter_id: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'resolved';
  created_at: string;
};

export type ReplyToReviewInput = {
  reviewId: string;
  replyText: string;
};

export type ReviewReplyResult = {
  reviewId: string;
  replyText: string;
  adminReply: string | null;
  repliedAt: string | null;
  repliedBy: string | null;
};

export type ModerationReviewRow = {
  id: string;
  user_id: string;
  destination_id: string | number | null;
  rating: number;
  comment?: string | null;
  helpful_count: number;
  created_at?: string | null;
  reviewer_name?: string | null;
};

export type UploadReviewImageInput = {
  file: Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  contentType?: string;
  reviewId?: string;
};

export type UploadReviewImageResult = {
  path: string;
  publicUrl: string;
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');

  return userId;
};

const ensureAdminUserId = async (): Promise<string> => {
  const userId = await ensureAuthenticatedUserId();

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  const role = String((data as { role?: unknown } | null)?.role ?? '').trim().toLowerCase();
  if (role !== 'admin') {
    throw new Error('Admin privileges required');
  }

  return userId;
};

const safeCount = (value: unknown, fallback: number = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
};

const isMissingTableError = (error: unknown, tableName: string) => {
  const code = String((error as any)?.code ?? '').trim().toUpperCase();
  const message = String((error as any)?.message ?? '').toLowerCase();
  if (code === 'PGRST205' && message.includes(`public.${tableName}`)) {
    return true;
  }

  return message.includes('relation') && message.includes(tableName.toLowerCase()) && message.includes('does not exist');
};

const getFileExtension = (fileName?: string, contentType?: string): string => {
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.trim().toLowerCase();
    if (ext) return ext;
  }

  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
};

const randomSuffix = () => Math.random().toString(36).slice(2, 10);

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const isMissingRelationError = (error: unknown): boolean => {
  const message = String((error as any)?.message ?? '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('table') && message.includes('does not exist'))
  );
};

export const reviewService = {
  async countReviewsForCurrentUser(): Promise<number> {
    const userId = await ensureAuthenticatedUserId();

    const destinationCountRequest = supabase
      .from('reviews')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', userId);

    const eventCountRequest = supabase
      .from('event_reviews')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', userId);

    const [destinationResult, eventResult] = await Promise.all([
      destinationCountRequest,
      eventCountRequest,
    ]);

    if (destinationResult.error) throw destinationResult.error;

    if (eventResult.error && !isMissingRelationError(eventResult.error)) {
      throw eventResult.error;
    }

    const destinationCount = typeof destinationResult.count === 'number' ? destinationResult.count : 0;
    const eventCount = typeof eventResult.count === 'number' ? eventResult.count : 0;

    return destinationCount + eventCount;
  },

  async toggleHelpful(reviewId: string): Promise<ToggleHelpfulResult> {
    const trimmedReviewId = reviewId?.trim();
    if (!trimmedReviewId) throw new Error('Review ID is required');

    const userId = await ensureAuthenticatedUserId();

    const { data: reviewRow, error: reviewErr } = await supabase
      .from('reviews')
      .select('id, helpful_count')
      .eq('id', trimmedReviewId)
      .maybeSingle();

    if (reviewErr) throw reviewErr;
    if (!reviewRow) throw new Error('Review not found');

    const { data: existingVote, error: voteErr } = await supabase
      .from('review_helpful_votes')
      .select('id')
      .eq('review_id', trimmedReviewId)
      .eq('user_id', userId)
      .maybeSingle();

    if (voteErr) throw voteErr;

    const currentCount = safeCount((reviewRow as any).helpful_count, 0);

    if (existingVote?.id) {
      const { error: deleteVoteErr } = await supabase
        .from('review_helpful_votes')
        .delete()
        .eq('id', existingVote.id)
        .eq('user_id', userId);

      if (deleteVoteErr) throw deleteVoteErr;

      const nextCount = Math.max(0, currentCount - 1);
      const { data: updatedReview, error: updateErr } = await supabase
        .from('reviews')
        .update({ helpful_count: nextCount })
        .eq('id', trimmedReviewId)
        .select('helpful_count')
        .single();

      if (updateErr) throw updateErr;

      return {
        isHelpful: false,
        helpfulCount: safeCount((updatedReview as any)?.helpful_count, nextCount),
      };
    }

    const { error: insertVoteErr } = await supabase
      .from('review_helpful_votes')
      .insert({
        review_id: trimmedReviewId,
        user_id: userId,
      });

    if (insertVoteErr) throw insertVoteErr;

    const nextCount = currentCount + 1;
    const { data: updatedReview, error: updateErr } = await supabase
      .from('reviews')
      .update({ helpful_count: nextCount })
      .eq('id', trimmedReviewId)
      .select('helpful_count')
      .single();

    if (updateErr) throw updateErr;

    return {
      isHelpful: true,
      helpfulCount: safeCount((updatedReview as any)?.helpful_count, nextCount),
    };
  },

  async reportReview(input: ReportReviewInput): Promise<ReviewReportRow> {
    const reviewId = input.reviewId?.trim();
    const reason = input.reason?.trim();

    if (!reviewId) throw new Error('Review ID is required');
    if (!reason) throw new Error('Report reason is required');

    const userId = await ensureAuthenticatedUserId();

    const payload = {
      review_id: reviewId,
      reporter_id: userId,
      reason,
      status: 'pending' as const,
    };

    const { data, error } = await supabase
      .from('review_reports')
      .upsert(payload, { onConflict: 'review_id,reporter_id' })
      .select('*')
      .single();

    if (!error) {
      return data as ReviewReportRow;
    }

    // Some environments only migrated event review reporting schema.
    if (isMissingTableError(error, 'review_reports')) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('event_review_reports')
        .upsert(payload, { onConflict: 'review_id,reporter_id' })
        .select('*')
        .single();

      if (!fallbackError) {
        return {
          id: String((fallbackData as any)?.id ?? ''),
          review_id: String((fallbackData as any)?.review_id ?? reviewId),
          reporter_id: String((fallbackData as any)?.reporter_id ?? userId),
          reason: String((fallbackData as any)?.reason ?? reason),
          status: String((fallbackData as any)?.status ?? 'pending') as ReviewReportRow['status'],
          created_at: String((fallbackData as any)?.created_at ?? new Date().toISOString()),
        };
      }

      const fallbackReason = String((fallbackError as any)?.message ?? '').trim();
      throw new Error(
        `Table review_reports is missing in the active Supabase schema. Run migration 20260403_reviews_upgrade.sql. ${fallbackReason}`.trim()
      );
    }

    throw error;
  },

  async replyToReview(input: ReplyToReviewInput): Promise<ReviewReplyResult> {
    const reviewId = input.reviewId?.trim();
    const replyText = input.replyText?.trim();

    if (!reviewId) throw new Error('Review ID is required');
    if (!replyText) throw new Error('Reply text is required');

    const userId = await ensureAuthenticatedUserId();

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    const role = String((profile as any)?.role ?? '').trim().toLowerCase();
    const isAdmin = role === 'admin';

    const payload: Record<string, any> = {
      reply_text: replyText,
      replied_at: new Date().toISOString(),
      replied_by: userId,
    };

    if (isAdmin) {
      payload.admin_reply = replyText;
    }

    const { data, error } = await supabase
      .from('reviews')
      .update(payload)
      .eq('id', reviewId)
      .select('id, reply_text, admin_reply, replied_at, replied_by')
      .single();

    if (error) throw error;

    return {
      reviewId: String((data as any).id),
      replyText: String((data as any).reply_text ?? ''),
      adminReply: typeof (data as any).admin_reply === 'string' ? (data as any).admin_reply : null,
      repliedAt: (data as any).replied_at ?? null,
      repliedBy: (data as any).replied_by ?? null,
    };
  },

  async getRecentReviewsForModeration(limit: number = 200): Promise<ModerationReviewRow[]> {
    await ensureAdminUserId();

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200;

    const { data, error } = await supabase
      .from('reviews')
      .select('id, user_id, destination_id, rating, comment, helpful_count, created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) throw error;

    const rows = (data ?? []) as {
      id: string;
      user_id: string;
      destination_id?: string | number | null;
      rating: number;
      comment?: string | null;
      helpful_count?: number | null;
      created_at?: string | null;
    }[];

    const userIds = unique(rows.map((row) => String(row.user_id ?? '')).filter(Boolean));
    const profileNameById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profilesErr) throw profilesErr;

      for (const profile of profiles ?? []) {
        const id = String((profile as { id?: unknown })?.id ?? '').trim();
        const fullName = String((profile as { full_name?: unknown })?.full_name ?? '').trim();
        if (!id || !fullName) continue;
        profileNameById.set(id, fullName);
      }
    }

    return rows.map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      destination_id: row.destination_id ?? null,
      rating: Number(row.rating ?? 0),
      comment: row.comment ?? null,
      helpful_count: safeCount(row.helpful_count, 0),
      created_at: row.created_at ?? null,
      reviewer_name: profileNameById.get(String(row.user_id)) ?? null,
    }));
  },

  async deleteReviewAsAdmin(reviewId: string): Promise<void> {
    await ensureAdminUserId();

    const id = reviewId?.trim();
    if (!id) throw new Error('Review ID is required');

    const { error: voteDeleteErr } = await supabase
      .from('review_helpful_votes')
      .delete()
      .eq('review_id', id);

    if (voteDeleteErr && !isMissingRelationError(voteDeleteErr)) {
      throw voteDeleteErr;
    }

    const { error: reportDeleteErr } = await supabase
      .from('review_reports')
      .delete()
      .eq('review_id', id);

    if (reportDeleteErr && !isMissingRelationError(reportDeleteErr)) {
      throw reportDeleteErr;
    }

    const { error: reviewDeleteErr } = await supabase
      .from('reviews')
      .delete()
      .eq('id', id);

    if (reviewDeleteErr) throw reviewDeleteErr;
  },

  async uploadReviewImage(input: UploadReviewImageInput): Promise<UploadReviewImageResult> {
    const userId = await ensureAuthenticatedUserId();

    const ext = getFileExtension(input.fileName, input.contentType);
    const reviewSegment = input.reviewId?.trim() ? input.reviewId.trim() : 'general';
    const filePath = `${userId}/${reviewSegment}/${Date.now()}-${randomSuffix()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('review_images')
      .upload(filePath, input.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: input.contentType,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('review_images').getPublicUrl(filePath);

    return {
      path: filePath,
      publicUrl: data.publicUrl,
    };
  },
};
