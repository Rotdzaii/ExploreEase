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
  repliedAt: string | null;
  repliedBy: string | null;
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

const safeCount = (value: unknown, fallback: number = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
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

export const reviewService = {
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

    if (error) throw error;
    return data as ReviewReportRow;
  },

  async replyToReview(input: ReplyToReviewInput): Promise<ReviewReplyResult> {
    const reviewId = input.reviewId?.trim();
    const replyText = input.replyText?.trim();

    if (!reviewId) throw new Error('Review ID is required');
    if (!replyText) throw new Error('Reply text is required');

    const userId = await ensureAuthenticatedUserId();

    const { data, error } = await supabase
      .from('reviews')
      .update({
        reply_text: replyText,
        replied_at: new Date().toISOString(),
        replied_by: userId,
      })
      .eq('id', reviewId)
      .select('id, reply_text, replied_at, replied_by')
      .single();

    if (error) throw error;

    return {
      reviewId: String((data as any).id),
      replyText: String((data as any).reply_text ?? ''),
      repliedAt: (data as any).replied_at ?? null,
      repliedBy: (data as any).replied_by ?? null,
    };
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
