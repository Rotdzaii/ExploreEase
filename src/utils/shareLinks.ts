const PUBLIC_WEB_BASE_URL = 'https://openbeta.exploreease.app';

const sanitizeId = (value: string | number | null | undefined) => encodeURIComponent(String(value ?? '').trim());

const slugify = (value: string | null | undefined) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

export const buildDestinationShareUrl = (destination: { id: string | number; name?: string | null }) => {
  const safeId = sanitizeId(destination.id);
  const slug = slugify(destination.name);
  return slug ? `${PUBLIC_WEB_BASE_URL}/destination/${safeId}-${slug}` : `${PUBLIC_WEB_BASE_URL}/destination/${safeId}`;
};

export const buildEventShareUrl = (event: { id: string | number; title?: string | null }) => {
  const safeId = sanitizeId(event.id);
  const slug = slugify(event.title);
  return slug ? `${PUBLIC_WEB_BASE_URL}/festivals/${safeId}-${slug}` : `${PUBLIC_WEB_BASE_URL}/festivals/${safeId}`;
};

export const buildTripShareUrl = (trip: { id: string | number; name?: string | null }) => {
  const safeId = sanitizeId(trip.id);
  const slug = slugify(trip.name);
  return slug ? `${PUBLIC_WEB_BASE_URL}/trips/${safeId}-${slug}` : `${PUBLIC_WEB_BASE_URL}/trips/${safeId}`;
};
