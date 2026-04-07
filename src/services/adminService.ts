import { supabase } from './supabase';

export type AdminEventStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'incoming'
  | 'ongoing'
  | 'completed'
  | string;

export type AdminEventRow = {
  id: string;
  title: string;
  category: string;
  location: string;
  start_time: string;
  end_time: string;
  price: number;
  image_url?: string | null;
  status?: AdminEventStatus;
  approval_status: 'pending' | 'approved' | 'rejected' | string;
  creator_id: string;
  creator_name?: string | null;
  created_at?: string | null;
};

export type AdminReviewReportRow = {
  id: string;
  review_id: string;
  reporter_id: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'resolved' | string;
  created_at: string;
  reporter_name?: string | null;
  review: {
    id: string;
    user_id: string;
    rating: number;
    comment?: string | null;
    destination_id?: string | number | null;
    created_at?: string | null;
    reviewer_name?: string | null;
  } | null;
};

export type AdminAnalyticsCounts = {
  usersCount: number;
  eventsCount: number;
  reviewsCount: number;
  pendingEventsCount: number;
  approvedEventsCount: number;
  rejectedEventsCount: number;
};

const normalizeRole = (role: unknown) => String(role ?? '').trim().toLowerCase();

const safeCount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const isMissingRelationError = (error: unknown): boolean => {
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('table') && message.includes('does not exist'))
  );
};

const unique = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  return out;
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');

  return userId;
};

const ensureAdmin = async (): Promise<string> => {
  const userId = await ensureAuthenticatedUserId();

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  const role = normalizeRole((data as { role?: unknown } | null)?.role);
  if (role !== 'admin') throw new Error('Admin privileges required');

  return userId;
};

export const adminService = {
  async getCurrentUserRole(): Promise<string | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    const userId = data.user?.id;
    if (!userId) return null;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr) throw profileErr;

    const role = normalizeRole((profile as { role?: unknown } | null)?.role);
    return role || null;
  },

  async isCurrentUserAdmin(): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'admin';
  },

  async getAnalyticsCounts(): Promise<AdminAnalyticsCounts> {
    await ensureAdmin();

    const usersPromise = supabase
      .from('profiles')
      .select('id', { head: true, count: 'exact' });

    const eventsPromise = supabase
      .from('events')
      .select('id', { head: true, count: 'exact' });

    const pendingEventsPromise = supabase
      .from('events')
      .select('id', { head: true, count: 'exact' })
      .eq('approval_status', 'pending');

    const approvedEventsPromise = supabase
      .from('events')
      .select('id', { head: true, count: 'exact' })
      .eq('approval_status', 'approved');

    const rejectedEventsPromise = supabase
      .from('events')
      .select('id', { head: true, count: 'exact' })
      .eq('approval_status', 'rejected');

    const destinationReviewsPromise = supabase
      .from('reviews')
      .select('id', { head: true, count: 'exact' });

    const eventReviewsPromise = supabase
      .from('event_reviews')
      .select('id', { head: true, count: 'exact' });

    const [
      usersRes,
      eventsRes,
      pendingEventsRes,
      approvedEventsRes,
      rejectedEventsRes,
      destinationReviewsRes,
      eventReviewsRes,
    ] = await Promise.all([
      usersPromise,
      eventsPromise,
      pendingEventsPromise,
      approvedEventsPromise,
      rejectedEventsPromise,
      destinationReviewsPromise,
      eventReviewsPromise,
    ]);

    if (usersRes.error) throw usersRes.error;
    if (eventsRes.error) throw eventsRes.error;
    if (pendingEventsRes.error) throw pendingEventsRes.error;
    if (approvedEventsRes.error) throw approvedEventsRes.error;
    if (rejectedEventsRes.error) throw rejectedEventsRes.error;
    if (destinationReviewsRes.error) throw destinationReviewsRes.error;

    if (eventReviewsRes.error && !isMissingRelationError(eventReviewsRes.error)) {
      throw eventReviewsRes.error;
    }

    const destinationReviewCount = safeCount(destinationReviewsRes.count);
    const eventReviewCount = safeCount(eventReviewsRes.count);

    return {
      usersCount: safeCount(usersRes.count),
      eventsCount: safeCount(eventsRes.count),
      reviewsCount: destinationReviewCount + eventReviewCount,
      pendingEventsCount: safeCount(pendingEventsRes.count),
      approvedEventsCount: safeCount(approvedEventsRes.count),
      rejectedEventsCount: safeCount(rejectedEventsRes.count),
    };
  },

  async getEventsForApproval(): Promise<AdminEventRow[]> {
    await ensureAdmin();

    const { data: events, error } = await supabase
      .from('events')
      .select('id, title, category, location, start_time, end_time, price, image_url, status, approval_status, creator_id, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(400);

    if (error) throw error;

    const rows = (events ?? []) as AdminEventRow[];
    const creatorIds = unique(rows.map((row) => String(row.creator_id ?? '')).filter(Boolean));

    if (creatorIds.length === 0) return rows;

    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds);

    if (profileErr) {
      return rows;
    }

    const profileNameById = new Map<string, string>();
    for (const profile of profiles ?? []) {
      const id = String((profile as { id?: unknown })?.id ?? '').trim();
      const fullName = String((profile as { full_name?: unknown })?.full_name ?? '').trim();
      if (!id) continue;
      if (!fullName) continue;
      profileNameById.set(id, fullName);
    }

    return rows.map((row) => ({
      ...row,
      creator_name: profileNameById.get(String(row.creator_id ?? '')) ?? null,
    }));
  },

  async updateEventApprovalStatus(eventId: string, nextStatus: 'approved' | 'rejected'): Promise<AdminEventRow> {
    await ensureAdmin();

    const id = eventId.trim();
    if (!id) throw new Error('Event ID is required');

    const { data, error } = await supabase
      .from('events')
      .update({ approval_status: nextStatus })
      .eq('id', id)
      .select('id, title, category, location, start_time, end_time, price, image_url, status, approval_status, creator_id, created_at')
      .single();

    if (error) throw error;
    return data as AdminEventRow;
  },

  async getPendingReviewReports(): Promise<AdminReviewReportRow[]> {
    await ensureAdmin();

    const { data: reports, error: reportsErr } = await supabase
      .from('review_reports')
      .select('id, review_id, reporter_id, reason, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(400);

    if (reportsErr) throw reportsErr;

    const reportRows = (reports ?? []) as {
      id: string;
      review_id: string;
      reporter_id: string;
      reason: string;
      status: string;
      created_at: string;
    }[];

    const reviewIds = unique(reportRows.map((row) => String(row.review_id ?? '')).filter(Boolean));

    const reviewsById = new Map<string, AdminReviewReportRow['review']>();
    if (reviewIds.length > 0) {
      const { data: reviews } = await supabase
        .from('reviews')
        .select('id, user_id, rating, comment, destination_id, created_at')
        .in('id', reviewIds);

      const reviewRows = (reviews ?? []) as {
        id: string;
        user_id: string;
        rating: number;
        comment?: string | null;
        destination_id?: string | number | null;
        created_at?: string | null;
      }[];

      for (const review of reviewRows) {
        reviewsById.set(String(review.id), {
          id: String(review.id),
          user_id: String(review.user_id),
          rating: Number(review.rating ?? 0),
          comment: review.comment ?? null,
          destination_id: review.destination_id ?? null,
          created_at: review.created_at ?? null,
          reviewer_name: null,
        });
      }
    }

    const reporterIds = reportRows.map((row) => String(row.reporter_id ?? ''));
    const reviewerIds = Array.from(reviewsById.values())
      .map((review) => String(review?.user_id ?? ''));

    const profileIds = unique([...reporterIds, ...reviewerIds].filter(Boolean));
    const profileNameById = new Map<string, string>();

    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds);

      for (const profile of profiles ?? []) {
        const id = String((profile as { id?: unknown })?.id ?? '').trim();
        const fullName = String((profile as { full_name?: unknown })?.full_name ?? '').trim();
        if (!id || !fullName) continue;
        profileNameById.set(id, fullName);
      }
    }

    for (const review of reviewsById.values()) {
      if (!review) continue;
      review.reviewer_name = profileNameById.get(review.user_id) ?? null;
    }

    return reportRows.map((report) => ({
      id: report.id,
      review_id: String(report.review_id),
      reporter_id: String(report.reporter_id),
      reason: report.reason,
      status: report.status,
      created_at: report.created_at,
      reporter_name: profileNameById.get(String(report.reporter_id)) ?? null,
      review: reviewsById.get(String(report.review_id)) ?? null,
    }));
  },

  async dismissReviewReport(reportId: string): Promise<void> {
    await ensureAdmin();

    const id = reportId.trim();
    if (!id) throw new Error('Report ID is required');

    const { error } = await supabase
      .from('review_reports')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('status', 'pending');

    if (error) throw error;
  },

  async deleteReviewAndResolveReport(reportId: string, reviewId: string): Promise<void> {
    await ensureAdmin();

    const resolvedReportId = reportId.trim();
    const resolvedReviewId = reviewId.trim();

    if (!resolvedReportId) throw new Error('Report ID is required');
    if (!resolvedReviewId) throw new Error('Review ID is required');

    const { error: deleteVotesErr } = await supabase
      .from('review_helpful_votes')
      .delete()
      .eq('review_id', resolvedReviewId);

    if (deleteVotesErr) throw deleteVotesErr;

    const { error: deleteReviewErr } = await supabase
      .from('reviews')
      .delete()
      .eq('id', resolvedReviewId);

    if (deleteReviewErr) throw deleteReviewErr;

    const { error: resolveOneErr } = await supabase
      .from('review_reports')
      .update({ status: 'resolved' })
      .eq('id', resolvedReportId);

    if (resolveOneErr) throw resolveOneErr;

    const { error: resolveRelatedErr } = await supabase
      .from('review_reports')
      .update({ status: 'resolved' })
      .eq('review_id', resolvedReviewId)
      .eq('status', 'pending');

    if (resolveRelatedErr) throw resolveRelatedErr;
  },
};
