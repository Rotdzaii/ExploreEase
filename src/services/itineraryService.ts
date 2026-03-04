import { supabase } from './supabase';

export type ItineraryItemRow = {
  id: string;
  user_id: string;
  trip_id: string;
  destination_id?: string | null;
  day: number;
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

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
};

export const itineraryService = {
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
    image_url?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<ItineraryItemRow> {
    const userId = await ensureAuthenticatedUserId();

    const payload = {
      user_id: userId,
      trip_id: input.tripId,
      destination_id: String(input.destination_id),
      day: input.day,
      name: input.name,
      image_url: input.image_url ?? null,
      latitude: typeof input.latitude === 'number' ? input.latitude : null,
      longitude: typeof input.longitude === 'number' ? input.longitude : null,
    };

    const primary = await supabase.from('itinerary_items').insert(payload).select('*').single();
    if (!primary.error) return primary.data as ItineraryItemRow;

    const msg = ((primary.error as any)?.message as string | undefined) ?? '';
    const msgLower = msg.toLowerCase();

    // Backward-compatible fallback in case the DB schema doesn't have destination_id yet.
    if (msgLower.includes('destination_id') && msgLower.includes('does not exist')) {
      const { destination_id: _omit, ...fallbackPayload } = payload as any;
      const fallback = await supabase.from('itinerary_items').insert(fallbackPayload).select('*').single();
      if (fallback.error) throw fallback.error;
      return fallback.data as ItineraryItemRow;
    }

    // Schema mismatch fallback: if consumer DB only has the Module 12.1 fields,
    // retry with minimal columns (trip_id, destination_id, day, user_id).
    // Example errors:
    // - column "name" of relation "itinerary_items" does not exist
    // - column "image_url" of relation "itinerary_items" does not exist
    if (msgLower.includes('column') && msgLower.includes('itinerary_items') && msgLower.includes('does not exist')) {
      const minimalPayload = {
        user_id: userId,
        trip_id: input.tripId,
        destination_id: String(input.destination_id),
        day: input.day,
      };

      const fallback = await supabase.from('itinerary_items').insert(minimalPayload).select('*').single();
      if (fallback.error) throw fallback.error;
      return fallback.data as ItineraryItemRow;
    }

    throw primary.error;
  },
};
