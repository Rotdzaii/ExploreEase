import type { ItineraryItemRow } from '@/src/services/itineraryService';

const hasCoords = (x: ItineraryItemRow) =>
  typeof x.latitude === 'number' &&
  Number.isFinite(x.latitude) &&
  typeof x.longitude === 'number' &&
  Number.isFinite(x.longitude);

const dist2 = (a: ItineraryItemRow, b: ItineraryItemRow) => {
  const dx = (a.latitude ?? 0) - (b.latitude ?? 0);
  const dy = (a.longitude ?? 0) - (b.longitude ?? 0);
  return dx * dx + dy * dy;
};

// Route strategy used here:
// 1) This is a greedy nearest-neighbor heuristic (an approximate TSP approach),
//    not an exact global shortest-path solver.
// 2) It starts at the earliest item, then repeatedly chooses the closest next stop
//    by squared Euclidean distance on latitude/longitude.
// 3) Items without coordinates cannot be distance-ranked, so they are appended later
//    using a stable sort by sort_order, then start_time, then name.
// Complexity: O(n^2) for coordinate-aware stops because each step scans remaining nodes.
export function optimizeDayRoute(items: ItineraryItemRow[]): ItineraryItemRow[] {
  const input = [...(items ?? [])];
  if (input.length <= 2) return input;

  const withCoords = input.filter(hasCoords);
  const withoutCoords = input.filter((x) => !hasCoords(x));

  // Deterministic base order for starting point
  withCoords.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' && Number.isFinite(a.sort_order) ? a.sort_order : Number.POSITIVE_INFINITY;
    const bo = typeof b.sort_order === 'number' && Number.isFinite(b.sort_order) ? b.sort_order : Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    const at = a.start_time ?? '';
    const bt = b.start_time ?? '';
    if (at !== bt) return at.localeCompare(bt);
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  if (withCoords.length <= 1) {
    return [...withCoords, ...withoutCoords];
  }

  const result: ItineraryItemRow[] = [];
  const remaining = [...withCoords];

  // Start from earliest
  let current = remaining.shift()!;
  result.push(current);

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    // Greedy step: choose nearest unvisited stop from current position.
    for (let i = 0; i < remaining.length; i++) {
      const d = dist2(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    current = remaining.splice(bestIdx, 1)[0];
    result.push(current);
  }

  // Append non-coordinate items at the end, stable by time
  withoutCoords.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' && Number.isFinite(a.sort_order) ? a.sort_order : Number.POSITIVE_INFINITY;
    const bo = typeof b.sort_order === 'number' && Number.isFinite(b.sort_order) ? b.sort_order : Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    const at = a.start_time ?? '';
    const bt = b.start_time ?? '';
    if (at !== bt) return at.localeCompare(bt);
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  return [...result, ...withoutCoords];
}
