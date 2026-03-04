import { supabase } from './supabase';

export type TripRow = {
  id: string;
  user_id: string;
  name: string;
  cover?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  destination?: string | null;
  created_at?: string | null;
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');

  return userId;
};

export const tripService = {
  async getTripsForCurrentUser(): Promise<TripRow[]> {
    const userId = await ensureAuthenticatedUserId();

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Injected Logs: data flow
    console.log('Trips fetched:', data, 'Error:', error);

    if (error) throw error;
    return (data ?? []) as TripRow[];
  },

  async createTripForCurrentUser(input: {
    name: string;
    cover?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    destination?: string | null;
  }): Promise<TripRow> {
    const userId = await ensureAuthenticatedUserId();

    const payload = {
      user_id: userId,
      name: input.name,
      cover: input.cover ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      destination: input.destination ?? null,
    };

    // Injected Logs: create trip data flow
    console.log('[Trips] createTripForCurrentUser payload:', payload);

    const { data, error } = await supabase.from('trips').insert(payload).select('*').single();
    console.log('[Trips] createTripForCurrentUser result:', data, 'Error:', error);
    if (error) throw error;
    return data as TripRow;
  },
};
