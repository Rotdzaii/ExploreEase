import { supabase } from './supabase';

export type EventStatus = 'incoming' | 'ongoing' | 'completed';

export type EventRow = {
  id: string;
  title: string;
  category: string;
  location: string;
  start_time: string;
  end_time: string;
  price: number;
  image_url?: string | null;
  description?: string | null;
  status: EventStatus;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  creator_id: string;
  created_at?: string | null;
};

export type GetEventsFilters = {
  search?: string;
  category?: string;
  location?: string;
  status?: EventStatus | 'all';
  freeOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  startFrom?: string | Date;
  endTo?: string | Date;
  creatorId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'start_time' | 'created_at' | 'price' | 'title';
  ascending?: boolean;
};

export type CreateEventInput = {
  title: string;
  category: string;
  location: string;
  start_time: string | Date;
  end_time: string | Date;
  price?: number;
  image_url?: string | null;
  description?: string | null;
  status?: EventStatus;
};

export type UpdateEventInput = {
  title?: string;
  category?: string;
  location?: string;
  start_time?: string | Date;
  end_time?: string | Date;
  price?: number;
  image_url?: string | null;
  description?: string | null;
  status?: EventStatus;
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');

  return userId;
};

const toIsoString = (value: string | Date): string => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid datetime value');
  }
  return parsed.toISOString();
};

const normalizeMoney = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value < 0) throw new Error('Price must be >= 0');
  return Number(value.toFixed(2));
};

export const getEventStatusByTime = (
  startTimeValue: string | Date,
  endTimeValue: string | Date,
  referenceDate: Date = new Date()
): EventStatus => {
  const start = startTimeValue instanceof Date ? startTimeValue : new Date(startTimeValue);
  const end = endTimeValue instanceof Date ? endTimeValue : new Date(endTimeValue);
  const now = referenceDate;

  if (now < start) return 'incoming';
  if (now > end) return 'completed';
  return 'ongoing';
};

const withLiveStatus = (row: EventRow): EventRow => ({
  ...row,
  status: getEventStatusByTime(row.start_time, row.end_time),
});

export const eventService = {
  async getEventById(eventId: string): Promise<EventRow | null> {
    const id = eventId?.trim();
    if (!id) return null;

    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!data) return null;
    return withLiveStatus(data as EventRow);
  },

  async getEvents(filters: GetEventsFilters = {}): Promise<EventRow[]> {
    let query = supabase.from('events').select('*');

    const search = filters.search?.trim();
    if (search) {
      query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`);
    }

    const category = filters.category?.trim();
    if (category) {
      query = query.eq('category', category);
    }

    const location = filters.location?.trim();
    if (location) {
      query = query.ilike('location', `%${location}%`);
    }

    if (filters.status && filters.status !== 'all') {
      const nowIso = new Date().toISOString();
      if (filters.status === 'incoming') {
        query = query.gt('start_time', nowIso);
      } else if (filters.status === 'ongoing') {
        query = query.lte('start_time', nowIso).gte('end_time', nowIso);
      } else {
        query = query.lt('end_time', nowIso);
      }
    }

    if (filters.freeOnly) {
      query = query.eq('price', 0);
    }

    if (typeof filters.minPrice === 'number' && !Number.isNaN(filters.minPrice)) {
      query = query.gte('price', filters.minPrice);
    }

    if (typeof filters.maxPrice === 'number' && !Number.isNaN(filters.maxPrice)) {
      query = query.lte('price', filters.maxPrice);
    }

    if (filters.startFrom) {
      query = query.gte('start_time', toIsoString(filters.startFrom));
    }

    if (filters.endTo) {
      query = query.lte('end_time', toIsoString(filters.endTo));
    }

    if (filters.creatorId) {
      query = query.eq('creator_id', filters.creatorId);
    }

    const orderBy = filters.orderBy ?? 'start_time';
    const ascending = filters.ascending ?? true;
    query = query.order(orderBy, { ascending });

    if (typeof filters.limit === 'number' && Number.isFinite(filters.limit) && filters.limit > 0) {
      const offset = Math.max(filters.offset ?? 0, 0);
      query = query.range(offset, offset + filters.limit - 1);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as EventRow[]).map(withLiveStatus);
  },

  async createEventForCurrentUser(input: CreateEventInput): Promise<EventRow> {
    const creatorId = await ensureAuthenticatedUserId();

    const title = input.title?.trim();
    const category = input.category?.trim();
    const location = input.location?.trim();

    if (!title) throw new Error('Title is required');
    if (!category) throw new Error('Category is required');
    if (!location) throw new Error('Location is required');

    const startTimeIso = toIsoString(input.start_time);
    const endTimeIso = toIsoString(input.end_time);

    if (new Date(endTimeIso) <= new Date(startTimeIso)) {
      throw new Error('end_time must be greater than start_time');
    }

    const status = input.status ?? getEventStatusByTime(startTimeIso, endTimeIso);
    const description = typeof input.description === 'string' ? input.description.trim() : '';

    const payload = {
      title,
      category,
      location,
      start_time: startTimeIso,
      end_time: endTimeIso,
      price: normalizeMoney(input.price),
      image_url: input.image_url ?? null,
      description: description || null,
      status,
      creator_id: creatorId,
    };

    const { data, error } = await supabase.from('events').insert(payload).select('*').single();
    if (error) throw error;

    return data as EventRow;
  },

  async updateEvent(eventId: string, input: UpdateEventInput): Promise<EventRow> {
    const id = eventId?.trim();
    if (!id) throw new Error('Event ID is required');

    const userId = await ensureAuthenticatedUserId();

    const payload: Record<string, unknown> = {};

    if (typeof input.title === 'string') {
      const title = input.title.trim();
      if (!title) throw new Error('Title is required');
      payload.title = title;
    }

    if (typeof input.category === 'string') {
      const category = input.category.trim();
      if (!category) throw new Error('Category is required');
      payload.category = category;
    }

    if (typeof input.location === 'string') {
      const location = input.location.trim();
      if (!location) throw new Error('Location is required');
      payload.location = location;
    }

    if (typeof input.price === 'number') {
      payload.price = normalizeMoney(input.price);
    }

    if ('image_url' in input) {
      payload.image_url = typeof input.image_url === 'string' ? input.image_url.trim() || null : null;
    }

    if ('description' in input) {
      payload.description = typeof input.description === 'string' ? input.description.trim() || null : null;
    }

    if (input.start_time) {
      payload.start_time = toIsoString(input.start_time);
    }

    if (input.end_time) {
      payload.end_time = toIsoString(input.end_time);
    }

    if (input.status) {
      payload.status = input.status;
    }

    const existing = await this.getEventById(id);
    if (!existing) throw new Error('Event not found');

    if (Object.keys(payload).length === 0) {
      return existing;
    }

    const nextStart = (payload.start_time as string | undefined) ?? existing.start_time;
    const nextEnd = (payload.end_time as string | undefined) ?? existing.end_time;
    if (new Date(nextEnd) <= new Date(nextStart)) {
      throw new Error('end_time must be greater than start_time');
    }

    if (!input.status) {
      payload.status = getEventStatusByTime(nextStart, nextEnd);
    }

    const { data, error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', id)
      .eq('creator_id', userId)
      .select('*')
      .single();

    if (error) throw error;
    return withLiveStatus(data as EventRow);
  },

  async deleteEvent(eventId: string): Promise<void> {
    const id = eventId?.trim();
    if (!id) throw new Error('Event ID is required');

    const userId = await ensureAuthenticatedUserId();

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('creator_id', userId);

    if (error) throw error;
  },
};
