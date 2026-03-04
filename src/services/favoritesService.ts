import { supabase } from './supabase';

type PostgrestErrorLike = {
  code?: string;
  message?: string;
  hint?: string | null;
};

const isMissingFavoritesTableError = (err: unknown) => {
  const e = err as PostgrestErrorLike | null;
  const code = e?.code;
  const msg = (e?.message ?? '').toLowerCase();
  return code === 'PGRST205' || (msg.includes('favorites') && msg.includes('schema cache'));
};

export const favoritesService = {
  async getIsFavorited(destinationId: string): Promise<boolean> {
    const trimmed = String(destinationId ?? '').trim();
    if (!trimmed) return false;

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = userRes.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('destination_id', trimmed)
      .maybeSingle();

    if (error) {
      // If the favorites migration hasn't been applied yet, treat as "not favorited"
      // to avoid breaking the destination detail screen.
      if (isMissingFavoritesTableError(error)) return false;
      throw error;
    }
    return !!data?.id;
  },

  async add(destinationId: string): Promise<void> {
    const trimmed = String(destinationId ?? '').trim();
    if (!trimmed) throw new Error('Missing destinationId');

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = userRes.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, destination_id: trimmed });

    if (error) {
      if (isMissingFavoritesTableError(error)) {
        throw new Error('Favorites table is missing. Run the favorites migration in Supabase then refresh schema cache.');
      }
      throw error;
    }
  },

  async remove(destinationId: string): Promise<void> {
    const trimmed = String(destinationId ?? '').trim();
    if (!trimmed) throw new Error('Missing destinationId');

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = userRes.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('destination_id', trimmed);

    if (error) {
      if (isMissingFavoritesTableError(error)) {
        throw new Error('Favorites table is missing. Run the favorites migration in Supabase then refresh schema cache.');
      }
      throw error;
    }
  },
};
