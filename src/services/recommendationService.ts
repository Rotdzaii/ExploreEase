import { destinationService, type DestinationDiscoveryRow, type EventDiscoveryRow } from './destinationService';
import { supabase } from './supabase';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type TimeOfDayPreference = 'auto' | TimeOfDay;

export type RecommendationContextItem = {
  kind: PersonalizedSuggestionKind;
  id?: string | number | null;
  title?: string | null;
  category?: string | null;
  location?: string | null;
};

export type UserPreferenceSnapshot = {
  userId: string | null;
  interests: string[];
  travelStyle: string | null;
};

export type PersonalizedSuggestionKind = 'destination' | 'event';

export type PersonalizedSuggestionItem = {
  id: string;
  kind: PersonalizedSuggestionKind;
  title: string;
  location: string;
  imageUrl: string | null;
  priceValue: number | null;
  rating: number | null;
  category: string | null;
  startTime: string | null;
  recommendationScore: number;
  recommendationReasons: string[];
};

export type PersonalizedRecommendationsResult = {
  timeOfDay: TimeOfDay;
  preferences: UserPreferenceSnapshot;
  destinations: PersonalizedSuggestionItem[];
  events: PersonalizedSuggestionItem[];
  combined: PersonalizedSuggestionItem[];
};

export type PersonalizedRecommendationsOptions = {
  limitDestinations?: number;
  limitEvents?: number;
  timeOfDay?: TimeOfDay;
  respectTimeOfDayWindow?: boolean;
  strictTimeOfDayFilter?: boolean;
  contextItem?: RecommendationContextItem | null;
};

type KnownTravelStyle = 'solo' | 'family' | 'group';

type WeatherContextSnapshot = {
  sourceLocation: string;
  isWetWeather: boolean;
  localHour: number | null;
};

const INTEREST_KEYWORDS: Record<string, string[]> = {
  food: ['restaurant', 'street food', 'cafe', 'coffee', 'dining', 'night market', 'bakery'],
  culture: ['museum', 'art', 'gallery', 'temple', 'cultural', 'heritage', 'craft'],
  shopping: ['shopping', 'mall', 'market', 'boutique', 'outlet', 'souvenir'],
  nature: ['nature', 'park', 'garden', 'lake', 'beach', 'mountain', 'waterfall'],
  adventure: ['adventure', 'hiking', 'trek', 'climbing', 'kayak', 'surf', 'zipline'],
  history: ['history', 'historic', 'fort', 'castle', 'ancient', 'war museum'],
};

const TRAVEL_STYLE_KEYWORDS: Record<KnownTravelStyle, string[]> = {
  solo: ['solo', 'backpacker', 'hostel', 'independent', 'self-guided', 'coworking', 'budget'],
  family: ['family', 'kid', 'kids', 'child', 'children', 'playground', 'zoo', 'safe'],
  group: ['group', 'team', 'friends', 'party', 'shared', 'large table', 'festival'],
};

const TIME_OF_DAY_KEYWORDS: Record<TimeOfDay, string[]> = {
  morning: ['breakfast', 'coffee', 'cafe', 'sunrise', 'park', 'brunch', 'market'],
  afternoon: ['lunch', 'museum', 'shopping', 'gallery', 'tour', 'cultural'],
  evening: ['sunset', 'dinner', 'show', 'night market', 'live music'],
  night: ['nightlife', 'bar', 'club', 'late night', 'cocktail', 'dj'],
};

const OPEN_WEATHER_API_KEY = String(process.env.EXPO_PUBLIC_OPENWEATHERMAP_API_KEY ?? '').trim();
const WEATHER_LOOKUP_CACHE_TTL_MS = 15 * 60 * 1000;

const weatherLookupCache = new Map<string, { expiresAt: number; value: WeatherContextSnapshot | null }>();

const OUTDOOR_ACTIVITY_KEYWORDS = [
  'outdoor',
  'outside',
  'open air',
  'park',
  'garden',
  'beach',
  'lake',
  'mountain',
  'waterfall',
  'trail',
  'hiking',
  'trek',
  'camping',
  'picnic',
  'zoo',
  'safari',
  'ngoai troi',
  'công viên',
  'cong vien',
  'bãi biển',
  'bai bien',
  'hồ',
  'ho ',
  'núi',
  'nui',
  'thác',
  'thac',
  'đường mòn',
  'duong mon',
  'cắm trại',
  'cam trai',
  'dã ngoại',
  'da ngoai',
  'vườn',
  'vuon',
];

const INDOOR_ACTIVITY_KEYWORDS = [
  'indoor',
  'inside',
  'museum',
  'gallery',
  'mall',
  'cinema',
  'theater',
  'cafe',
  'coffee',
  'restaurant',
  'spa',
  'karaoke',
  'bowling',
  'aquarium',
  'trong nha',
  'trong nhà',
  'bảo tàng',
  'bao tang',
  'trung tâm thương mại',
  'trung tam thuong mai',
  'rạp phim',
  'rap phim',
  'nhà hàng',
  'nha hang',
  'quán cà phê',
  'quan ca phe',
  'nhà hát',
  'nha hat',
];

const NIGHT_FRIENDLY_KEYWORDS = [
  'night market',
  'nightlife',
  'bar',
  'club',
  'pub',
  'cocktail',
  'dj',
  'rooftop',
  'live music',
  'chợ đêm',
  'cho dem',
  'phố đi bộ',
  'pho di bo',
  'khuya',
  'đêm',
  'dem',
  'karaoke',
];

const DAYTIME_ONLY_KEYWORDS = [
  'park',
  'garden',
  'beach',
  'lake',
  'mountain',
  'waterfall',
  'trail',
  'hiking',
  'trek',
  'camping',
  'picnic',
  'zoo',
  'safari',
  'sunrise',
  'ngoai troi',
  'công viên',
  'cong vien',
  'bãi biển',
  'bai bien',
  'núi',
  'nui',
  'thác',
  'thac',
  'đường mòn',
  'duong mon',
  'cắm trại',
  'cam trai',
  'vườn',
  'vuon',
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalize = (value: string) => value.trim().toLowerCase();

const includesAnyKeyword = (searchText: string, keywords: string[]) => {
  const text = normalize(searchText);
  if (!text) return false;

  for (const keyword of keywords) {
    const token = normalize(keyword);
    if (!token) continue;
    if (text.includes(token)) return true;
  }

  return false;
};

const normalizeTokens = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const unique = (values: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }

  return next;
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toTravelStyleKey = (input: string | null): KnownTravelStyle | null => {
  if (!input) return null;
  const value = normalize(input);

  if (value.includes('family')) return 'family';
  if (value.includes('group')) return 'group';
  if (value.includes('solo')) return 'solo';

  return null;
};

const getDestinationCategory = (row: DestinationDiscoveryRow): string | null => {
  const relation = row.categories as unknown;

  if (Array.isArray(relation)) {
    const first = relation[0] as { name?: string } | undefined;
    return typeof first?.name === 'string' && first.name.trim() ? first.name.trim() : null;
  }

  if (relation && typeof relation === 'object') {
    const one = relation as { name?: string };
    return typeof one.name === 'string' && one.name.trim() ? one.name.trim() : null;
  }

  return null;
};

const destinationSearchText = (row: DestinationDiscoveryRow): string => {
  const maybeRecord = row as Record<string, unknown>;
  const tags = asStringArray(maybeRecord.tags).join(' ');
  const description = typeof maybeRecord.description === 'string' ? maybeRecord.description : '';

  return [
    row.name,
    row.location ?? '',
    getDestinationCategory(row) ?? '',
    tags,
    description,
  ]
    .join(' ')
    .toLowerCase();
};

const eventSearchText = (row: EventDiscoveryRow): string => {
  return [
    row.title,
    row.category ?? '',
    row.location ?? '',
    row.description ?? '',
  ]
    .join(' ')
    .toLowerCase();
};

const matchedKeywords = (searchText: string, keywords: string[]) => {
  const hits: string[] = [];
  for (const keyword of keywords) {
    const token = normalize(keyword);
    if (!token) continue;
    if (searchText.includes(token)) hits.push(token);
  }
  return unique(hits);
};

const ratingValue = (value: unknown) => {
  const n = toNumber(value);
  return n === null ? 0 : clamp(n, 0, 5);
};

const dedupeById = <T extends { id: string | number }>(rows: T[]): T[] => {
  const bucket = new Map<string, T>();
  for (const row of rows) {
    const key = String(row.id);
    if (!bucket.has(key)) bucket.set(key, row);
  }
  return Array.from(bucket.values());
};

const resolveWeatherLookupCandidates = (location: string) => {
  const raw = String(location ?? '').trim();
  if (!raw) return [] as string[];

  const normalized = raw.replace(/\s+/g, ' ').trim();
  const segments = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const candidates: string[] = [normalized];

  if (segments.length >= 2) {
    candidates.push(`${segments[segments.length - 2]}, ${segments[segments.length - 1]}`);
  }

  if (segments.length >= 1) {
    candidates.push(segments[segments.length - 1]);
  }

  return unique(candidates);
};

const computeHourFromTimezoneOffset = (timezoneOffsetSeconds: number | null): number | null => {
  if (typeof timezoneOffsetSeconds !== 'number' || !Number.isFinite(timezoneOffsetSeconds)) return null;

  const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60 * 1000;
  const localMs = nowUtcMs + timezoneOffsetSeconds * 1000;
  const localDate = new Date(localMs);
  const hour = localDate.getHours();
  return Number.isFinite(hour) ? hour : null;
};

const isWetWeatherByCode = (weatherCode: number | null, weatherMain: string | null) => {
  if (typeof weatherCode === 'number' && Number.isFinite(weatherCode)) {
    if (weatherCode >= 200 && weatherCode < 700) return true;
  }

  const main = normalize(weatherMain ?? '');
  return main.includes('rain') || main.includes('drizzle') || main.includes('thunderstorm') || main.includes('snow');
};

const fetchWeatherContextByLocation = async (location: string): Promise<WeatherContextSnapshot | null> => {
  const trimmed = String(location ?? '').trim();
  if (!trimmed || !OPEN_WEATHER_API_KEY) return null;

  const cacheKey = normalize(trimmed);
  const now = Date.now();
  const cached = weatherLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const candidates = resolveWeatherLookupCandidates(trimmed);
  for (const candidate of candidates) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(candidate)}&appid=${encodeURIComponent(OPEN_WEATHER_API_KEY)}&units=metric`;
      const response = await fetch(url);
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        weather?: { id?: number; main?: string }[];
        timezone?: number;
      };

      const weatherCodeRaw = payload.weather?.[0]?.id;
      const weatherCode = typeof weatherCodeRaw === 'number' && Number.isFinite(weatherCodeRaw) ? weatherCodeRaw : null;
      const weatherMainRaw = payload.weather?.[0]?.main;
      const weatherMain = typeof weatherMainRaw === 'string' ? weatherMainRaw : null;
      const timezoneRaw = payload.timezone;
      const timezone = typeof timezoneRaw === 'number' && Number.isFinite(timezoneRaw) ? timezoneRaw : null;

      const resolved = {
        sourceLocation: candidate,
        isWetWeather: isWetWeatherByCode(weatherCode, weatherMain),
        localHour: computeHourFromTimezoneOffset(timezone),
      } as WeatherContextSnapshot;

      weatherLookupCache.set(cacheKey, {
        value: resolved,
        expiresAt: now + WEATHER_LOOKUP_CACHE_TTL_MS,
      });

      return resolved;
    } catch {
      // Ignore network/weather provider errors and continue with fallback candidates.
    }
  }

  weatherLookupCache.set(cacheKey, {
    value: null,
    expiresAt: now + 60 * 1000,
  });

  return null;
};

const resolveRecommendationWeatherContext = async (
  options: PersonalizedRecommendationsOptions,
  destinationPool: DestinationDiscoveryRow[],
  eventPool: EventDiscoveryRow[]
): Promise<WeatherContextSnapshot | null> => {
  if (!OPEN_WEATHER_API_KEY) return null;

  const locationCandidates = [
    options.contextItem?.location ?? '',
    destinationPool.find((row) => String(row.location ?? '').trim())?.location ?? '',
    eventPool.find((row) => String(row.location ?? '').trim())?.location ?? '',
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  for (const location of unique(locationCandidates)) {
    const weatherContext = await fetchWeatherContextByLocation(location);
    if (weatherContext) return weatherContext;
  }

  return null;
};

const isLateNightHour = (hour: number | null, timeOfDay: TimeOfDay) => {
  if (typeof hour === 'number' && Number.isFinite(hour)) {
    return hour >= 22 || hour < 5;
  }

  return timeOfDay === 'night';
};

const shouldExcludeSuggestionByWeatherAndTime = (input: {
  searchText: string;
  weatherContext: WeatherContextSnapshot | null;
  timeOfDay: TimeOfDay;
}) => {
  const text = normalize(input.searchText);
  if (!text) return false;

  const isOutdoor = includesAnyKeyword(text, OUTDOOR_ACTIVITY_KEYWORDS);
  const isIndoor = includesAnyKeyword(text, INDOOR_ACTIVITY_KEYWORDS);
  const isNightFriendly = includesAnyKeyword(text, NIGHT_FRIENDLY_KEYWORDS);
  const isDaytimeOnly = includesAnyKeyword(text, DAYTIME_ONLY_KEYWORDS);

  if (input.weatherContext?.isWetWeather && isOutdoor && !isIndoor) {
    return true;
  }

  if (isLateNightHour(input.weatherContext?.localHour ?? null, input.timeOfDay) && isDaytimeOnly && !isNightFriendly) {
    return true;
  }

  return false;
};

export const inferTimeOfDay = (date: Date = new Date()): TimeOfDay => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

export const resolveTimeOfDayPreference = (
  preference: TimeOfDayPreference,
  date: Date = new Date()
): TimeOfDay => {
  if (preference === 'auto') return inferTimeOfDay(date);
  return preference;
};

export const getTimeOfDayKeywords = (timeOfDay: TimeOfDay): string[] => {
  return TIME_OF_DAY_KEYWORDS[timeOfDay] ?? [];
};

export const getTimeOfDayLabel = (timeOfDay: TimeOfDay): string => {
  if (timeOfDay === 'morning') return 'morning';
  if (timeOfDay === 'afternoon') return 'afternoon';
  if (timeOfDay === 'evening') return 'evening';
  return 'night';
};

export const getTravelStyleLabel = (travelStyle: string | null): string => {
  const key = toTravelStyleKey(travelStyle);
  if (key === 'family') return 'family trips';
  if (key === 'group') return 'group trips';
  return 'solo trips';
};

const isEventInTimeWindow = (event: EventDiscoveryRow, timeOfDay: TimeOfDay): boolean => {
  const startDate = new Date(event.start_time);
  if (Number.isNaN(startDate.getTime())) return true;

  const hour = startDate.getHours();

  if (timeOfDay === 'morning') return hour >= 5 && hour < 11;
  if (timeOfDay === 'afternoon') return hour >= 11 && hour < 17;
  if (timeOfDay === 'evening') return hour >= 17 && hour < 21;
  return hour >= 21 || hour < 5;
};

export const filterEventsByTimeOfDay = (rows: EventDiscoveryRow[], timeOfDay: TimeOfDay) => {
  return rows.filter((row) => isEventInTimeWindow(row, timeOfDay));
};

const buildInterestKeywords = (interests: string[]) => {
  const normalizedInterests = unique(interests);
  const collected: string[] = [];

  for (const interest of normalizedInterests) {
    collected.push(interest);
    const mapped = INTEREST_KEYWORDS[interest] ?? [];
    collected.push(...mapped);
  }

  return unique(collected);
};

const buildContextKeywords = (contextItem: RecommendationContextItem | null | undefined): string[] => {
  if (!contextItem) return [];

  const parts = [
    contextItem.title ?? '',
    contextItem.category ?? '',
    contextItem.location ?? '',
  ]
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  const merged = parts.join(' ');

  return unique(normalizeTokens(merged));
};

const makeSuggestionKey = (kind: PersonalizedSuggestionKind, id: string | number | null | undefined) => {
  if (id === null || typeof id === 'undefined') return null;
  return `${kind}:${String(id)}`;
};

const destinationToSuggestion = (
  row: DestinationDiscoveryRow,
  score: number,
  reasons: string[]
): PersonalizedSuggestionItem => ({
  id: String(row.id),
  kind: 'destination',
  title: row.name,
  location: row.location ?? 'Unknown location',
  imageUrl: row.image_url ?? null,
  priceValue: toNumber(row.price),
  rating: toNumber(row.rating),
  category: getDestinationCategory(row),
  startTime: null,
  recommendationScore: Number(score.toFixed(2)),
  recommendationReasons: reasons,
});

const eventToSuggestion = (
  row: EventDiscoveryRow,
  score: number,
  reasons: string[]
): PersonalizedSuggestionItem => ({
  id: String(row.id),
  kind: 'event',
  title: row.title,
  location: row.location ?? 'Unknown location',
  imageUrl: row.image_url ?? null,
  priceValue: toNumber(row.price),
  rating: toNumber(row.rating),
  category: row.category ?? null,
  startTime: row.start_time,
  recommendationScore: Number(score.toFixed(2)),
  recommendationReasons: reasons,
});

const scoreDestination = (params: {
  row: DestinationDiscoveryRow;
  interestKeywords: string[];
  travelKeywords: string[];
  timeKeywords: string[];
  contextKeywords: string[];
  contextItem?: RecommendationContextItem | null;
  strictTimeOfDayFilter: boolean;
}) => {
  const text = destinationSearchText(params.row);
  const interestHits = matchedKeywords(text, params.interestKeywords);
  const travelHits = matchedKeywords(text, params.travelKeywords);
  const timeHits = matchedKeywords(text, params.timeKeywords);
  const contextHits = matchedKeywords(text, params.contextKeywords);

  if (params.strictTimeOfDayFilter && params.timeKeywords.length > 0 && timeHits.length === 0) {
    return null;
  }

  const base = ratingValue(params.row.rating);
  const destinationCategory = normalize(getDestinationCategory(params.row) ?? '');
  const contextCategory = normalize(params.contextItem?.category ?? '');
  const categoryBoost =
    params.contextItem?.kind === 'destination' && destinationCategory && contextCategory && destinationCategory === contextCategory
      ? 2.4
      : 0;

  const score =
    base +
    interestHits.length * 2.8 +
    travelHits.length * 1.8 +
    timeHits.length * 1.3 +
    contextHits.length * 2.2 +
    categoryBoost;

  const reasons: string[] = [];
  if (interestHits.length > 0) reasons.push('Matches your interests');
  if (travelHits.length > 0) reasons.push('Fits your travel style');
  if (timeHits.length > 0) reasons.push('Good for this time of day');
  if (contextHits.length > 0 || categoryBoost > 0) reasons.push('Similar to what you are viewing');
  if (reasons.length === 0 && base >= 4) reasons.push('Highly rated destination');
  if (reasons.length === 0) reasons.push('Popular destination');

  return destinationToSuggestion(params.row, score, reasons);
};

const scoreEvent = (params: {
  row: EventDiscoveryRow;
  interestKeywords: string[];
  travelKeywords: string[];
  timeKeywords: string[];
  contextKeywords: string[];
  contextItem?: RecommendationContextItem | null;
  timeOfDay: TimeOfDay;
  respectTimeOfDayWindow: boolean;
}) => {
  const text = eventSearchText(params.row);
  const interestHits = matchedKeywords(text, params.interestKeywords);
  const travelHits = matchedKeywords(text, params.travelKeywords);
  const timeHits = matchedKeywords(text, params.timeKeywords);
  const contextHits = matchedKeywords(text, params.contextKeywords);
  const inTimeWindow = isEventInTimeWindow(params.row, params.timeOfDay);

  if (params.respectTimeOfDayWindow && !inTimeWindow) {
    return null;
  }

  const base = ratingValue(params.row.rating);
  const eventCategory = normalize(params.row.category ?? '');
  const contextCategory = normalize(params.contextItem?.category ?? '');
  const categoryBoost =
    params.contextItem?.kind === 'event' && eventCategory && contextCategory && eventCategory === contextCategory
      ? 2.4
      : 0;

  const score =
    base +
    interestHits.length * 3.1 +
    travelHits.length * 1.7 +
    timeHits.length * 1.5 +
    contextHits.length * 2.2 +
    categoryBoost +
    (inTimeWindow ? 1.2 : 0);

  const reasons: string[] = [];
  if (interestHits.length > 0) reasons.push('Matches your interests');
  if (travelHits.length > 0) reasons.push('Fits your travel style');
  if (inTimeWindow) reasons.push('Timing fits your schedule');
  if (contextHits.length > 0 || categoryBoost > 0) reasons.push('Similar to what you are viewing');
  if (reasons.length === 0 && base >= 4) reasons.push('Highly rated event');
  if (reasons.length === 0) reasons.push('Trending event');

  return eventToSuggestion(params.row, score, reasons);
};

const sortByRecommendation = (a: PersonalizedSuggestionItem, b: PersonalizedSuggestionItem) => {
  if (b.recommendationScore !== a.recommendationScore) {
    return b.recommendationScore - a.recommendationScore;
  }

  const bRating = b.rating ?? 0;
  const aRating = a.rating ?? 0;
  if (bRating !== aRating) return bRating - aRating;

  return a.title.localeCompare(b.title);
};

export const recommendationService = {
  async getCurrentUserPreferences(): Promise<UserPreferenceSnapshot> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const userId = userData.user?.id ?? null;
    if (!userId) {
      return {
        userId: null,
        interests: [],
        travelStyle: null,
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('interests, travel_style')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;

    const profileRecord = (profile ?? {}) as Record<string, unknown>;

    return {
      userId,
      interests: unique(asStringArray(profileRecord.interests)),
      travelStyle: typeof profileRecord.travel_style === 'string' ? profileRecord.travel_style : null,
    };
  },

  async getPersonalizedRecommendationsForCurrentUser(
    options: PersonalizedRecommendationsOptions = {}
  ): Promise<PersonalizedRecommendationsResult> {
    const preferences = await this.getCurrentUserPreferences();
    const timeOfDay = options.timeOfDay ?? inferTimeOfDay();

    const limitDestinations = clamp(options.limitDestinations ?? 8, 1, 20);
    const limitEvents = clamp(options.limitEvents ?? 6, 1, 20);

    const interestKeywords = buildInterestKeywords(preferences.interests);

    const styleKey = toTravelStyleKey(preferences.travelStyle);
    const travelKeywords = styleKey ? TRAVEL_STYLE_KEYWORDS[styleKey] : [];

    const timeKeywords = getTimeOfDayKeywords(timeOfDay);
    const contextKeywords = buildContextKeywords(options.contextItem ?? null);

    const excludedKeys = new Set<string>();
    const contextKey = makeSuggestionKey(options.contextItem?.kind ?? 'destination', options.contextItem?.id);
    if (contextKey) excludedKeys.add(contextKey);

    const destinationPoolSize = Math.max(limitDestinations * 5, 40);
    const eventPoolSize = Math.max(limitEvents * 5, 40);

    const [interestDestinations, fallbackDestinations, baseEvents, hintEvents] = await Promise.all([
      preferences.interests.length > 0
        ? destinationService.getDestinationsByInterests(preferences.interests, destinationPoolSize).catch(() => [])
        : Promise.resolve([]),
      destinationService.getDestinationsForDiscovery({ sort: 'top-rated', limit: destinationPoolSize }).catch(() => []),
      destinationService.getEventsForDiscovery({ sort: 'top-rated', limit: eventPoolSize }).catch(() => []),
      destinationService
        .getEventsForDiscovery({
          sort: 'relevance',
          search: interestKeywords[0] ?? timeKeywords[0],
          limit: Math.max(limitEvents * 2, 12),
        })
        .catch(() => []),
    ]);

    const destinationPool = dedupeById(
      [...(interestDestinations as DestinationDiscoveryRow[]), ...fallbackDestinations] as DestinationDiscoveryRow[]
    );

    const eventPool = dedupeById([...baseEvents, ...hintEvents] as EventDiscoveryRow[]);

    const weatherContext = await resolveRecommendationWeatherContext(options, destinationPool, eventPool);

    const weatherAwareDestinationPool = destinationPool.filter((row) =>
      !shouldExcludeSuggestionByWeatherAndTime({
        searchText: destinationSearchText(row),
        weatherContext,
        timeOfDay,
      })
    );

    const weatherAwareEventPool = eventPool.filter((row) =>
      !shouldExcludeSuggestionByWeatherAndTime({
        searchText: eventSearchText(row),
        weatherContext,
        timeOfDay,
      })
    );

    const destinationSuggestions = weatherAwareDestinationPool
      .filter((row) => !excludedKeys.has(`destination:${String(row.id)}`))
      .map((row) =>
        scoreDestination({
          row,
          interestKeywords,
          travelKeywords,
          timeKeywords,
          contextKeywords,
          contextItem: options.contextItem,
          strictTimeOfDayFilter: options.strictTimeOfDayFilter === true,
        })
      )
      .filter((row): row is PersonalizedSuggestionItem => !!row)
      .sort(sortByRecommendation)
      .slice(0, limitDestinations);

    const eventSourceRows = options.respectTimeOfDayWindow
      ? filterEventsByTimeOfDay(weatherAwareEventPool, timeOfDay)
      : weatherAwareEventPool;

    const eventSuggestions = eventSourceRows
      .filter((row) => !excludedKeys.has(`event:${String(row.id)}`))
      .map((row) =>
        scoreEvent({
          row,
          interestKeywords,
          travelKeywords,
          timeKeywords,
          contextKeywords,
          contextItem: options.contextItem,
          timeOfDay,
          respectTimeOfDayWindow: options.respectTimeOfDayWindow === true,
        })
      )
      .filter((row): row is PersonalizedSuggestionItem => !!row)
      .sort(sortByRecommendation)
      .slice(0, limitEvents);

    const combined = [...destinationSuggestions, ...eventSuggestions]
      .sort(sortByRecommendation)
      .slice(0, limitDestinations + limitEvents);

    return {
      timeOfDay,
      preferences,
      destinations: destinationSuggestions,
      events: eventSuggestions,
      combined,
    };
  },
};
