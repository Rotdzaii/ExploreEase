import * as ExpoLocation from 'expo-location';
import { create } from 'zustand';

export type GeoCoords = {
  latitude: number;
  longitude: number;
};

export function getHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;

  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export function isWithinRadiusKm(source: GeoCoords | null, target: GeoCoords | null, radiusKm: number): boolean {
  if (!source || !target) return false;
  const meters = getHaversineDistance(source.latitude, source.longitude, target.latitude, target.longitude);
  return meters <= radiusKm * 1000;
}

const toNumberOrNull = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  return Number.isFinite(n) ? n : null;
};

export function extractCoordsFromEntity(row: any): GeoCoords | null {
  if (!row) return null;

  const latitude =
    toNumberOrNull(row.latitude) ??
    toNumberOrNull(row.lat) ??
    toNumberOrNull(row.Latitude) ??
    toNumberOrNull(row.Lat);

  const longitude =
    toNumberOrNull(row.longitude) ??
    toNumberOrNull(row.lng) ??
    toNumberOrNull(row.long) ??
    toNumberOrNull(row.Longitude) ??
    toNumberOrNull(row.Lng);

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

const geocodeCache = new Map<string, GeoCoords | null>();

export async function geocodeLocationText(query: string): Promise<GeoCoords | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized) ?? null;
  }

  try {
    const rows = await ExpoLocation.geocodeAsync(query.trim());
    const first = rows?.[0];
    if (!first) {
      geocodeCache.set(normalized, null);
      return null;
    }

    const coords: GeoCoords = {
      latitude: first.latitude,
      longitude: first.longitude,
    };

    geocodeCache.set(normalized, coords);
    return coords;
  } catch {
    geocodeCache.set(normalized, null);
    return null;
  }
}

export async function resolveEntityCoords(row: any): Promise<GeoCoords | null> {
  const direct = extractCoordsFromEntity(row);
  if (direct) return direct;

  const text =
    (typeof row?.location === 'string' && row.location.trim()) ||
    (typeof row?.address === 'string' && row.address.trim()) ||
    (typeof row?.city === 'string' && row.city.trim()) ||
    '';

  if (!text) return null;
  return geocodeLocationText(text);
}

type LocationOverrideState = {
  useManualLocation: boolean;
  manualLocationText: string;
  manualLocationCoords: GeoCoords | null;
  setManualLocation: (input: { text: string; coords: GeoCoords }) => void;
  clearManualLocation: () => void;
  setUseManualLocation: (value: boolean) => void;
};

export const useLocationOverrideStore = create<LocationOverrideState>((set) => ({
  useManualLocation: false,
  manualLocationText: '',
  manualLocationCoords: null,

  setManualLocation: ({ text, coords }) =>
    set({
      useManualLocation: true,
      manualLocationText: text.trim(),
      manualLocationCoords: coords,
    }),

  clearManualLocation: () =>
    set({
      useManualLocation: false,
      manualLocationText: '',
      manualLocationCoords: null,
    }),

  setUseManualLocation: (value) => set({ useManualLocation: value }),
}));

export function getEffectiveTargetLocation(input: {
  gpsLocation: GeoCoords | null;
  useManualLocation: boolean;
  manualLocationCoords: GeoCoords | null;
}): GeoCoords | null {
  if (input.useManualLocation && input.manualLocationCoords) {
    return input.manualLocationCoords;
  }
  return input.gpsLocation;
}
