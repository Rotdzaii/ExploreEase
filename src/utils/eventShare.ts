import type { EventRow } from '@/src/services/eventService';

export type EventSharePlatform = 'facebook' | 'tiktok' | 'x' | 'instagram';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type BuildEventShareBodyInput = {
  event: Pick<EventRow, 'id' | 'title' | 'location' | 'start_time' | 'description'>;
  locale: string;
  t: TranslateFn;
  includePublicUrl?: boolean;
};

type BuildSocialShareUrlInput = {
  platform: EventSharePlatform;
  shareText: string;
  publicUrl: string;
};

const EVENT_SHARE_BASE_URL = 'https://openbeta.exploreease.app/festivals';

const toSafeDateText = (isoValue: string, locale: string, fallbackText: string) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return fallbackText;
  return date.toLocaleString(locale);
};

const toSlugPart = (title: string) => {
  const normalized = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);

  return normalized;
};

export const buildEventPublicUrl = (event: Pick<EventRow, 'id' | 'title'>) => {
  const safeId = encodeURIComponent(String(event.id ?? '').trim());
  const slug = toSlugPart(event.title ?? 'event');

  if (!slug) return `${EVENT_SHARE_BASE_URL}/${safeId}`;
  return `${EVENT_SHARE_BASE_URL}/${safeId}-${slug}`;
};

export const buildEventShareBody = ({
  event,
  locale,
  t,
  includePublicUrl = true,
}: BuildEventShareBodyInput) => {
  const publicUrl = buildEventPublicUrl(event);
  const startText = toSafeDateText(event.start_time, locale, t('events.discovery.unknownTime'));
  const description = String(event.description ?? '').trim() || t('event.detail.noDescription');

  const baseMessage = t('event.detail.shareMessage', {
    title: event.title,
    location: event.location,
    start: startText,
    description,
  });

  if (!includePublicUrl) return baseMessage;
  return `${baseMessage}\n\n${publicUrl}`;
};

export const buildSocialShareUrl = ({
  platform,
  shareText,
  publicUrl,
}: BuildSocialShareUrlInput) => {
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(publicUrl);

  if (platform === 'facebook') {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
  }

  if (platform === 'x') {
    return `https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`;
  }

  if (platform === 'instagram') {
    return `https://www.instagram.com/?url=${encodedUrl}&caption=${encodedText}`;
  }

  return `https://www.tiktok.com/upload?caption=${encodedText}%20${encodedUrl}`;
};
