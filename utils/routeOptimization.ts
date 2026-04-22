import type { ItineraryItemRow } from '@/src/services/itineraryService';

type RouteAnchor = {
  latitude: number;
  longitude: number;
};

const DEFAULT_ROUTE_ANCHOR: RouteAnchor = {
  latitude: 10.7769,
  longitude: 106.7009,
};

const hasCoords = (item: ItineraryItemRow) =>
  typeof item.latitude === 'number' &&
  Number.isFinite(item.latitude) &&
  typeof item.longitude === 'number' &&
  Number.isFinite(item.longitude);

const dist2 = (a: ItineraryItemRow, b: ItineraryItemRow) => {
  const dx = (a.latitude ?? 0) - (b.latitude ?? 0);
  const dy = (a.longitude ?? 0) - (b.longitude ?? 0);
  return dx * dx + dy * dy;
};

const dist2FromAnchor = (anchor: RouteAnchor, item: ItineraryItemRow) => {
  const dx = anchor.latitude - (item.latitude ?? 0);
  const dy = anchor.longitude - (item.longitude ?? 0);
  return dx * dx + dy * dy;
};

const hasExplicitOrder = (item: ItineraryItemRow) =>
  typeof item.sort_order === 'number' && Number.isFinite(item.sort_order);

const hasExplicitTime = (item: ItineraryItemRow) =>
  typeof item.start_time === 'string' && item.start_time.trim().length > 0;

const isScheduleLocked = (item: ItineraryItemRow) => hasExplicitOrder(item) || hasExplicitTime(item);

const compareByPlanOrder = (a: ItineraryItemRow, b: ItineraryItemRow) => {
  const ao = hasExplicitOrder(a) ? (a.sort_order as number) : Number.POSITIVE_INFINITY;
  const bo = hasExplicitOrder(b) ? (b.sort_order as number) : Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;

  const at = a.start_time ?? '';
  const bt = b.start_time ?? '';
  if (at !== bt) return at.localeCompare(bt);

  const aet = a.end_time ?? '';
  const bet = b.end_time ?? '';
  if (aet !== bet) return aet.localeCompare(bet);

  return (a.name ?? '').localeCompare(b.name ?? '');
};

export function optimizeDayRoute(
  items: ItineraryItemRow[],
  routeAnchor: RouteAnchor = DEFAULT_ROUTE_ANCHOR
): ItineraryItemRow[] {
  const input = [...(items ?? [])];
  if (input.length <= 2) return input;

  const lockedItems = input.filter(isScheduleLocked).sort(compareByPlanOrder);
  const flexibleItems = input.filter((item) => !isScheduleLocked(item));
  const flexibleWithCoords = flexibleItems.filter(hasCoords).sort(compareByPlanOrder);
  const flexibleWithoutCoords = flexibleItems.filter((item) => !hasCoords(item)).sort(compareByPlanOrder);

  const result: ItineraryItemRow[] = [...lockedItems];
  const remaining = [...flexibleWithCoords];

  if (remaining.length === 0) {
    return [...result, ...flexibleWithoutCoords];
  }

  const latestLockedWithCoords = [...lockedItems].reverse().find(hasCoords) ?? null;
  let startIdx = 0;
  let minStartDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < remaining.length; i += 1) {
    const distance = latestLockedWithCoords
      ? dist2(latestLockedWithCoords, remaining[i])
      : dist2FromAnchor(routeAnchor, remaining[i]);

    if (distance < minStartDistance) {
      minStartDistance = distance;
      startIdx = i;
    }
  }

  let current = remaining.splice(startIdx, 1)[0];
  result.push(current);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const distance = dist2(current, remaining[i]);
      if (distance < bestDist) {
        bestDist = distance;
        bestIdx = i;
      }
    }

    current = remaining.splice(bestIdx, 1)[0];
    result.push(current);
  }

  return [...result, ...flexibleWithoutCoords];
}
