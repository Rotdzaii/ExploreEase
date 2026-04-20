import { supabase } from './supabase';

const REVIEW_IMAGES_BUCKET = 'review_images';
const EVENT_IMAGES_BUCKET = 'event_images';

type ReviewImageScope = 'destination' | 'event' | 'general';

export type UploadReviewImageInput = {
  uri?: string;
  file?: Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  contentType?: string;
  reviewId?: string | number | null;
  scope?: ReviewImageScope;
};

export type UploadReviewImageResult = {
  path: string;
  publicUrl: string;
};

export type UploadEventImageInput = {
  uri?: string;
  file?: Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  contentType?: string;
};

export type UploadEventImageResult = {
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

const randomSuffix = () => Math.random().toString(36).slice(2, 10);

const getFileExtension = (fileName?: string, contentType?: string): string => {
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.trim().toLowerCase();
    if (ext) return ext;
  }

  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  return 'jpg';
};

const resolveUploadPayload = async (
  input: UploadReviewImageInput
): Promise<{ file: Blob | ArrayBuffer | Uint8Array; contentType?: string }> => {
  if (input.file) {
    return {
      file: input.file,
      contentType: input.contentType,
    };
  }

  const uri = String(input.uri ?? '').trim();
  if (!uri) {
    throw new Error('Review image source is required.');
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Unable to read selected image (status ${response.status}).`);
  }

  const blob = await response.blob();
  const contentType = input.contentType ?? response.headers.get('content-type') ?? undefined;

  return {
    file: blob,
    contentType,
  };
};

export const storageService = {
  async uploadReviewImage(input: UploadReviewImageInput): Promise<UploadReviewImageResult> {
    const userId = await ensureAuthenticatedUserId();
    const payload = await resolveUploadPayload(input);

    const scope = input.scope ?? 'general';
    const reviewSegment = input.reviewId ? String(input.reviewId).trim() : 'draft';
    const ext = getFileExtension(input.fileName, payload.contentType);
    const filePath = `${userId}/${scope}/${reviewSegment}/${Date.now()}-${randomSuffix()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(REVIEW_IMAGES_BUCKET)
      .upload(filePath, payload.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: payload.contentType,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(REVIEW_IMAGES_BUCKET).getPublicUrl(filePath);

    return {
      path: filePath,
      publicUrl: data.publicUrl,
    };
  },

  async uploadEventImage(input: UploadEventImageInput): Promise<UploadEventImageResult> {
    const userId = await ensureAuthenticatedUserId();
    const payload = await resolveUploadPayload(input);

    const ext = getFileExtension(input.fileName, payload.contentType);
    const filePath = `${userId}/events/${Date.now()}-${randomSuffix()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .upload(filePath, payload.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: payload.contentType,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(filePath);

    return {
      path: filePath,
      publicUrl: data.publicUrl,
    };
  },
};
