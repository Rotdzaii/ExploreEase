import { supabase } from './supabase';

type ProfileRow = {
  full_name: string | null;
  nationality: string;
  interests: string[];
};

const normalizeInterests = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const profileService = {
  async getCurrentProfile(): Promise<ProfileRow | null> {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const userId = authData.user?.id;
    if (!userId) return null;

    // IMPORTANT:
    // - Selecting a missing column (e.g. `nationality`) causes a 400 from PostgREST.
    // - Selecting `*` is schema-safe: if the column doesn't exist, it simply won't be present.
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;

    const nationality = (data as any)?.nationality;
    const rawNationality = typeof nationality === 'string' ? nationality.trim() : '';
    const lowerNationality = rawNationality.toLowerCase();
    const upperNationality = rawNationality.toUpperCase();

    // Currency formatting throughout the app relies on the canonical code `VN`.
    // Users/DB may store variants like: "vn", "Việt Nam", "Viet Nam", "Vietnam".
    const normalizedNationality = !rawNationality
      ? 'VN'
      : (upperNationality === 'VN' || lowerNationality === 'việt nam' || lowerNationality === 'viet nam' || lowerNationality === 'vietnam')
        ? 'VN'
        : upperNationality;

    return {
      full_name: (data as any)?.full_name ?? null,
      nationality: normalizedNationality,
      interests: normalizeInterests((data as any)?.interests),
    };
  },

  async getCurrentNationality(): Promise<string> {
    try {
      const profile = await this.getCurrentProfile();
      return profile?.nationality ?? 'VN';
    } catch {
      return 'VN';
    }
  },

  async updateInterests(interests: string[], userId?: string) {
    const normalized = (interests ?? []).map((s) => s.trim()).filter(Boolean);

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      resolvedUserId = data.user?.id;
    }
    if (!resolvedUserId) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update({ interests: normalized })
      .eq('id', resolvedUserId);

    if (error) throw error;
    return { interests: normalized };
  },
};
