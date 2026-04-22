import type { PersonalizedSuggestionItem, TimeOfDay } from '@/src/services/recommendationService';

export type MultiFactorBudget = 'any' | 'free' | 'budget' | 'mid' | 'premium';
export type MultiFactorMood = 'any' | 'chill' | 'food' | 'culture' | 'adventure' | 'romantic';
export type MultiFactorAvailableTime = 'any' | '2h' | '4h' | '6h' | 'full-day';
export type MultiFactorDistance = 'any' | 'near' | 'city' | 'roadtrip';

export type ExploreMultiFactorCandidate = PersonalizedSuggestionItem & {
  distanceKm?: number | null;
};

export type ExplorePromptInsight = {
  durationHours: number | null;
  timeOfDay: TimeOfDay | null;
  normalizedQuery: string;
};

export type MicroItineraryStop = {
  id: string;
  title: string;
  kind: 'destination' | 'event';
  timeLabel: string;
  durationMinutes: number;
  location: string;
  note: string;
};

const START_HOUR_BY_TIME: Record<TimeOfDay, number> = {
  morning: 8,
  afternoon: 13,
  evening: 18,
  night: 20,
};

const MOOD_KEYWORDS: Record<Exclude<MultiFactorMood, 'any'>, string[]> = {
  chill: ['cafe', 'spa', 'wellness', 'garden', 'park', 'retreat', 'resort', 'relax', 'chill'],
  food: ['food', 'cuisine', 'restaurant', 'market', 'coffee', 'ẩm thực', 'đặc sản'],
  culture: ['museum', 'heritage', 'culture', 'temple', 'historic', 'art', 'văn hóa', 'lịch sử'],
  adventure: ['adventure', 'trek', 'hiking', 'kayak', 'climb', 'zipline', 'phiêu lưu'],
  romantic: ['sunset', 'river', 'beach', 'fine dining', 'view', 'romantic', 'hoàng hôn'],
};

const normalize = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toTimeLabel = (hour: number, minute: number) => {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
};

const defaultDurationByCandidate = (candidate: ExploreMultiFactorCandidate) => {
  const text = normalize(`${candidate.title} ${candidate.category ?? ''} ${candidate.location ?? ''}`);
  if (candidate.kind === 'event') return 120;
  if (text.includes('food') || text.includes('restaurant') || text.includes('coffee') || text.includes('ẩm thực')) return 75;
  if (text.includes('museum') || text.includes('culture') || text.includes('heritage')) return 90;
  if (text.includes('adventure') || text.includes('trek') || text.includes('hiking')) return 120;
  return 90;
};

const availableTimeToHours = (value: MultiFactorAvailableTime) => {
  if (value === '2h') return 2;
  if (value === '4h') return 4;
  if (value === '6h') return 6;
  if (value === 'full-day') return 8;
  return null;
};

const maxDistanceByPreference = (value: MultiFactorDistance) => {
  if (value === 'near') return 5;
  if (value === 'city') return 15;
  if (value === 'roadtrip') return 80;
  return null;
};

export const parseExplorePrompt = (prompt: string): ExplorePromptInsight => {
  const normalizedQuery = normalize(prompt);

  let durationHours: number | null = null;
  const hourMatch = normalizedQuery.match(/(\d+(?:[.,]\d+)?)\s*gio/);
  if (hourMatch) {
    durationHours = Number(hourMatch[1].replace(',', '.'));
  } else if (normalizedQuery.includes('nua ngay')) {
    durationHours = 4;
  } else if (normalizedQuery.includes('1 ngay') || normalizedQuery.includes('ca ngay')) {
    durationHours = 8;
  }

  let timeOfDay: TimeOfDay | null = null;
  if (normalizedQuery.includes('buoi sang') || normalizedQuery.includes('sang')) {
    timeOfDay = 'morning';
  } else if (normalizedQuery.includes('buoi chieu') || normalizedQuery.includes('chieu')) {
    timeOfDay = 'afternoon';
  } else if (normalizedQuery.includes('buoi toi') || normalizedQuery.includes('toi')) {
    timeOfDay = 'evening';
  } else if (normalizedQuery.includes('ban dem') || normalizedQuery.includes('dem')) {
    timeOfDay = 'night';
  }

  return {
    durationHours: durationHours && Number.isFinite(durationHours) ? clamp(durationHours, 1, 12) : null,
    timeOfDay,
    normalizedQuery,
  };
};

const priceScore = (priceValue: number | null, budget: MultiFactorBudget) => {
  const safePrice = typeof priceValue === 'number' && Number.isFinite(priceValue) ? priceValue : 0;

  if (budget === 'free') return safePrice <= 0 ? 3.2 : -10;
  if (budget === 'budget') return safePrice <= 200_000 ? 2.6 : safePrice <= 350_000 ? 1 : -3;
  if (budget === 'mid') return safePrice <= 500_000 ? 2.2 : safePrice <= 900_000 ? 1.2 : -1.5;
  if (budget === 'premium') return safePrice >= 400_000 ? 2.4 : 0.8;
  return safePrice <= 300_000 ? 1.2 : 0.4;
};

const moodScore = (candidate: ExploreMultiFactorCandidate, mood: MultiFactorMood, queryText: string) => {
  if (mood === 'any' && !queryText) return 0;

  const haystack = normalize(`${candidate.title} ${candidate.category ?? ''} ${candidate.location ?? ''} ${(candidate.recommendationReasons ?? []).join(' ')}`);
  let score = 0;

  if (mood !== 'any') {
    const keywords = MOOD_KEYWORDS[mood] ?? [];
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) score += 1.4;
    }
  }

  if (queryText) {
    for (const token of queryText.split(/\s+/).filter((item) => item.length >= 3)) {
      if (haystack.includes(token)) score += 0.8;
    }
  }

  return score;
};

const distanceScore = (candidate: ExploreMultiFactorCandidate, distancePref: MultiFactorDistance) => {
  const maxDistance = maxDistanceByPreference(distancePref);
  const distanceKm = typeof candidate.distanceKm === 'number' && Number.isFinite(candidate.distanceKm)
    ? candidate.distanceKm
    : null;

  if (distancePref === 'any' || maxDistance === null || distanceKm === null) return 0;
  if (distanceKm > maxDistance) return -5;
  return Math.max(0.4, (maxDistance - distanceKm) / Math.max(maxDistance, 1)) * 2.8;
};

export const rankMultiFactorCandidates = (input: {
  candidates: ExploreMultiFactorCandidate[];
  budget: MultiFactorBudget;
  mood: MultiFactorMood;
  distancePref: MultiFactorDistance;
  queryText?: string;
}) => {
  const normalizedQuery = normalize(input.queryText);

  return [...input.candidates]
    .map((candidate) => {
      const score =
        candidate.recommendationScore +
        (candidate.rating ?? 0) * 0.8 +
        priceScore(candidate.priceValue ?? null, input.budget) +
        moodScore(candidate, input.mood, normalizedQuery) +
        distanceScore(candidate, input.distancePref);

      return {
        ...candidate,
        weightedScore: score,
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);
};

export const buildMicroItinerary = (input: {
  candidates: ExploreMultiFactorCandidate[];
  budget: MultiFactorBudget;
  mood: MultiFactorMood;
  distancePref: MultiFactorDistance;
  availableTime: MultiFactorAvailableTime;
  prompt: string;
  fallbackTimeOfDay: TimeOfDay;
}) => {
  const insight = parseExplorePrompt(input.prompt);
  const totalHours = insight.durationHours ?? availableTimeToHours(input.availableTime) ?? 4;
  const totalMinutes = clamp(Math.round(totalHours * 60), 90, 10 * 60);
  const timeOfDay = insight.timeOfDay ?? input.fallbackTimeOfDay;

  const ranked = rankMultiFactorCandidates({
    candidates: input.candidates,
    budget: input.budget,
    mood: input.mood,
    distancePref: input.distancePref,
    queryText: insight.normalizedQuery,
  });

  const selected: MicroItineraryStop[] = [];
  let usedMinutes = 0;
  let cursorMinutes = START_HOUR_BY_TIME[timeOfDay] * 60;

  for (const candidate of ranked) {
    const durationMinutes = defaultDurationByCandidate(candidate);
    if (usedMinutes + durationMinutes > totalMinutes + 30) continue;
    if (selected.some((item) => item.id === candidate.id && item.kind === candidate.kind)) continue;

    const startHour = Math.floor(cursorMinutes / 60);
    const startMinute = cursorMinutes % 60;
    const endMinutes = cursorMinutes + durationMinutes;
    const endHour = Math.floor(endMinutes / 60);
    const endMinute = endMinutes % 60;

    selected.push({
      id: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      location: candidate.location,
      durationMinutes,
      timeLabel: `${toTimeLabel(startHour, startMinute)} - ${toTimeLabel(endHour, endMinute)}`,
      note: candidate.recommendationReasons?.[0] ?? 'Phù hợp với nhu cầu hiện tại của bạn',
    });

    usedMinutes += durationMinutes;
    cursorMinutes = endMinutes + 20;

    if (usedMinutes >= totalMinutes || selected.length >= 4) break;
  }

  return {
    insight,
    totalHours,
    timeOfDay,
    ranked,
    itinerary: selected,
  };
};
