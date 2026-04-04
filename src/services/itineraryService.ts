import { supabase } from './supabase';
import { tripService, type TripRow } from './tripService';

export type ItineraryItemRow = {
  id: string;
  user_id: string;
  trip_id: string;
  itinerary_id?: string | null;
  destination_id?: string | null;
  event_id?: string | null;
  day: number;
  day_number?: number | null;
  time_slot?: string | null;
  sort_order?: number | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
};

export type DayPlansJson = Record<
  string,
  {
    notes?: string[];
  }
>;

export type CreateTripInput = {
  title: string;
  destination?: string | null;
  cover?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type AddDestinationToTripDayInput = {
  tripId: string;
  day: number;
  destination_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  time_slot?: string | null;
};

export type AddEventToTripDayInput = {
  tripId: string;
  day: number;
  event_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  time_slot?: string | null;
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
};

const toLowerMessage = (error: unknown) => {
  const message = (error as any)?.message;
  if (typeof message !== 'string') return '';
  return message.toLowerCase();
};

const isMissingColumnError = (error: unknown) => {
  const msg = toLowerMessage(error);
  return msg.includes('column') && msg.includes('does not exist');
};

const toTimeText = (value?: string | null): string | null => {
  if (!value || !value.trim()) return null;
  const raw = value.trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
};

const insertItemWithFallback = async (
  payload: Record<string, any>
): Promise<ItineraryItemRow> => {
  const candidates: Record<string, any>[] = [
    payload,
    {
      ...payload,
      itinerary_id: undefined,
      day_number: undefined,
      event_id: undefined,
      time_slot: undefined,
    },
    {
      user_id: payload.user_id,
      trip_id: payload.trip_id,
      destination_id: payload.destination_id ?? null,
      day: payload.day ?? payload.day_number ?? 1,
      name: payload.name,
      image_url: payload.image_url ?? null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      description: payload.description ?? null,
      start_time: payload.start_time ?? null,
      end_time: payload.end_time ?? null,
    },
    {
      user_id: payload.user_id,
      trip_id: payload.trip_id,
      destination_id: payload.destination_id ?? null,
      day: payload.day ?? payload.day_number ?? 1,
      name: payload.name,
    },
  ];

  let lastError: any = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const cleaned = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined));

    const result = await supabase.from('itinerary_items').insert(cleaned).select('*').single();
    if (!result.error) return result.data as ItineraryItemRow;

    lastError = result.error;

    if (!isMissingColumnError(result.error)) {
      break;
    }
  }

  throw lastError;
};

export const itineraryService = {
  async getTripsForCurrentUser(): Promise<TripRow[]> {
    return tripService.getTripsForCurrentUser();
  },

  async createTripForCurrentUser(input: CreateTripInput): Promise<TripRow> {
    const title = input.title.trim();
    if (!title) throw new Error('Trip title is required');

    const row = await tripService.createTripForCurrentUser({
      name: title,
      destination: input.destination ?? null,
      cover: input.cover ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
    });

    const itinerary = await this.getOrCreateItinerary(row.id);

    const updatePayload = {
      title,
      start_date: input.start_date ?? row.start_date ?? null,
      end_date: input.end_date ?? row.end_date ?? null,
    };

    const { error } = await supabase
      .from('itineraries')
      .update(updatePayload)
      .eq('id', (itinerary as any).id)
      .eq('user_id', row.user_id);

    if (error && !isMissingColumnError(error)) {
      throw error;
    }

    return row;
  },

  async getItemsByTripAndDay(tripId: string, day: number) {
    const userId = await ensureAuthenticatedUserId();

    const baseQuery = () =>
      supabase
        .from('itinerary_items')
        .select('*')
        .eq('user_id', userId)
        .eq('trip_id', tripId)
        .eq('day', day);

    // Prefer deterministic ordering for optimization: sort_order -> time.
    const { data, error } = await baseQuery()
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true, nullsFirst: false });

    if (!error) return (data ?? []) as ItineraryItemRow[];

    // Backward-compatible fallback in case the DB schema doesn't have sort_order yet.
    const msg = (error as any)?.message as string | undefined;
    if (msg && msg.toLowerCase().includes('sort_order') && msg.toLowerCase().includes('does not exist')) {
      const fallback = await baseQuery().order('start_time', { ascending: true, nullsFirst: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []) as ItineraryItemRow[];
    }

    throw error;
  },

  async getOrCreateItinerary(tripId: string) {
    const userId = await ensureAuthenticatedUserId();

    const { data: existing, error: existingErr } = await supabase
      .from('itineraries')
      .select('*')
      .eq('user_id', userId)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingErr) throw existingErr;
    if (existing) return existing as any;

    const { data: created, error: createErr } = await supabase
      .from('itineraries')
      .insert({ user_id: userId, trip_id: tripId, day_plans: {} })
      .select('*')
      .single();

    if (createErr) throw createErr;
    return created as any;
  },

  async getNotes(tripId: string, day: number): Promise<string[]> {
    const row = await this.getOrCreateItinerary(tripId);

    const dayPlans = (row as any)?.day_plans as DayPlansJson | null | undefined;
    const key = String(day);
    const notes = dayPlans?.[key]?.notes;

    if (!Array.isArray(notes)) return [];
    return notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
  },

  async addNote(tripId: string, day: number, note: string) {
    const trimmed = note.trim();
    if (!trimmed) return;

    const row = await this.getOrCreateItinerary(tripId);
    const userId = await ensureAuthenticatedUserId();

    const currentDayPlans = ((row as any)?.day_plans ?? {}) as DayPlansJson;
    const key = String(day);

    const existingNotes = Array.isArray(currentDayPlans?.[key]?.notes)
      ? (currentDayPlans[key].notes ?? [])
      : [];

    const nextNotes = [...existingNotes, trimmed].slice(0, 50);

    const nextDayPlans: DayPlansJson = {
      ...currentDayPlans,
      [key]: {
        ...(currentDayPlans[key] ?? {}),
        notes: nextNotes,
      },
    };

    const { error } = await supabase
      .from('itineraries')
      .update({ day_plans: nextDayPlans })
      .eq('id', (row as any).id)
      .eq('user_id', userId);

    if (error) throw error;
    return nextNotes;
  },

  async addItemToTrip(input: {
    tripId: string;
    day: number;
    destination_id: string;
    name: string;
    description?: string | null;
    image_url?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    time_slot?: string | null;
  }): Promise<ItineraryItemRow> {
    const userId = await ensureAuthenticatedUserId();
    const itinerary = await this.getOrCreateItinerary(input.tripId);

    const dayNumber = Math.max(1, Number(input.day) || 1);

    const payload = {
      user_id: userId,
      itinerary_id: (itinerary as any)?.id ?? null,
      trip_id: input.tripId,
      destination_id: String(input.destination_id),
      day: dayNumber,
      day_number: dayNumber,
      name: input.name,
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      start_time: toTimeText(input.start_time),
      end_time: toTimeText(input.end_time),
      latitude: typeof input.latitude === 'number' ? input.latitude : null,
      longitude: typeof input.longitude === 'number' ? input.longitude : null,
      time_slot: input.time_slot ?? null,
    };

    return insertItemWithFallback(payload);
  },

  async addDestinationToTripDay(input: AddDestinationToTripDayInput): Promise<ItineraryItemRow> {
    return this.addItemToTrip({
      tripId: input.tripId,
      day: input.day,
      destination_id: input.destination_id,
      name: input.name,
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      time_slot: input.time_slot ?? null,
    });
  },

  async addEventToTripDay(input: AddEventToTripDayInput): Promise<ItineraryItemRow> {
    const userId = await ensureAuthenticatedUserId();
    const itinerary = await this.getOrCreateItinerary(input.tripId);
    const dayNumber = Math.max(1, Number(input.day) || 1);

    const payload = {
      user_id: userId,
      itinerary_id: (itinerary as any)?.id ?? null,
      trip_id: input.tripId,
      day: dayNumber,
      day_number: dayNumber,
      destination_id: null,
      event_id: input.event_id,
      name: input.name,
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      start_time: toTimeText(input.start_time),
      end_time: toTimeText(input.end_time),
      latitude: null,
      longitude: null,
      time_slot: input.time_slot ?? null,
    };

    return insertItemWithFallback(payload);
  },
};
