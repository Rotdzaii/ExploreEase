import AsyncStorage from '@react-native-async-storage/async-storage';

import { destinationService, type SubmitReviewInput } from './destinationService';
import { supabase } from './supabase';

const PENDING_REVIEWS_STORAGE_KEY = '@exploreease/offline-sync/pending-reviews:v1';

export type PendingReviewInput = {
  user_id: string;
  destination_id: string | number;
  rating: number;
  comment?: string | null;
  imageUrls?: string[] | null;
};

export type PendingReviewQueueItem = PendingReviewInput & {
  queue_id: string;
  enqueued_at: string;
  retry_count: number;
  last_error?: string | null;
};

export type PendingReviewSyncResult = {
  attemptedCount: number;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  remainingCount: number;
};

const sanitizeComment = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const sanitizeImageUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

const sanitizeDestinationId = (value: unknown): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && String(numeric) === trimmed) {
      return numeric;
    }

    return trimmed;
  }

  return null;
};

const toQueueItem = (value: any): PendingReviewQueueItem | null => {
  if (!value || typeof value !== 'object') return null;

  const queueId = typeof value.queue_id === 'string' ? value.queue_id.trim() : '';
  const userId = typeof value.user_id === 'string' ? value.user_id.trim() : '';
  const destinationId = sanitizeDestinationId(value.destination_id);
  const rating = Number(value.rating);

  if (!queueId || !userId || destinationId === null || !Number.isFinite(rating)) {
    return null;
  }

  return {
    queue_id: queueId,
    user_id: userId,
    destination_id: destinationId,
    rating,
    comment: sanitizeComment(value.comment),
    imageUrls: sanitizeImageUrls(value.imageUrls),
    enqueued_at:
      typeof value.enqueued_at === 'string' && value.enqueued_at.trim()
        ? value.enqueued_at
        : new Date().toISOString(),
    retry_count: Number.isFinite(Number(value.retry_count)) ? Math.max(0, Number(value.retry_count)) : 0,
    last_error:
      typeof value.last_error === 'string' && value.last_error.trim()
        ? value.last_error
        : null,
  };
};

const readQueue = async (): Promise<PendingReviewQueueItem[]> => {
  const raw = await AsyncStorage.getItem(PENDING_REVIEWS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => toQueueItem(item)).filter(Boolean) as PendingReviewQueueItem[];
  } catch {
    return [];
  }
};

const writeQueue = async (items: PendingReviewQueueItem[]) => {
  if (!items.length) {
    await AsyncStorage.removeItem(PENDING_REVIEWS_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(PENDING_REVIEWS_STORAGE_KEY, JSON.stringify(items));
};

const createQueueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

let activeSyncPromise: Promise<PendingReviewSyncResult> | null = null;

const emptySyncResult: PendingReviewSyncResult = {
  attemptedCount: 0,
  syncedCount: 0,
  failedCount: 0,
  skippedCount: 0,
  remainingCount: 0,
};

export const offlineSyncService = {
  async getPendingReviewQueue(): Promise<PendingReviewQueueItem[]> {
    return readQueue();
  },

  async getPendingReviewCount(): Promise<number> {
    const items = await readQueue();
    return items.length;
  },

  async enqueuePendingReview(input: PendingReviewInput): Promise<PendingReviewQueueItem> {
    const userId = String(input.user_id ?? '').trim();
    const destinationId = sanitizeDestinationId(input.destination_id);
    const rating = Number(input.rating);

    if (!userId) {
      throw new Error('Missing user_id for queued review.');
    }

    if (destinationId === null) {
      throw new Error('Missing destination_id for queued review.');
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('Invalid rating for queued review.');
    }

    const nextItem: PendingReviewQueueItem = {
      queue_id: createQueueId(),
      user_id: userId,
      destination_id: destinationId,
      rating,
      comment: sanitizeComment(input.comment),
      imageUrls: sanitizeImageUrls(input.imageUrls),
      enqueued_at: new Date().toISOString(),
      retry_count: 0,
      last_error: null,
    };

    const queue = await readQueue();
    queue.push(nextItem);
    await writeQueue(queue);

    return nextItem;
  },

  async syncPendingReviews(): Promise<PendingReviewSyncResult> {
    if (activeSyncPromise) {
      return activeSyncPromise;
    }

    activeSyncPromise = (async () => {
      const queue = await readQueue();
      if (!queue.length) {
        return { ...emptySyncResult, remainingCount: 0 };
      }

      let attemptedCount = 0;
      let syncedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const remaining: PendingReviewQueueItem[] = [];

      let activeUserId: string | null = null;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        activeUserId = data.user?.id ?? null;
      } catch {
        activeUserId = null;
      }

      if (!activeUserId) {
        return {
          ...emptySyncResult,
          skippedCount: queue.length,
          remainingCount: queue.length,
        };
      }

      for (const item of queue) {
        if (item.user_id !== activeUserId) {
          skippedCount += 1;
          remaining.push(item);
          continue;
        }

        attemptedCount += 1;
        try {
          const payload: SubmitReviewInput = {
            user_id: item.user_id,
            destination_id: item.destination_id,
            rating: item.rating,
            comment: item.comment ?? null,
            imageUrls: item.imageUrls ?? [],
          };

          await destinationService.submitReview(payload);
          syncedCount += 1;
        } catch (error: any) {
          failedCount += 1;
          remaining.push({
            ...item,
            retry_count: item.retry_count + 1,
            last_error: String(error?.message ?? error ?? 'Unknown sync error'),
          });
        }
      }

      await writeQueue(remaining);

      return {
        attemptedCount,
        syncedCount,
        failedCount,
        skippedCount,
        remainingCount: remaining.length,
      };
    })();

    try {
      return await activeSyncPromise;
    } finally {
      activeSyncPromise = null;
    }
  },
};
