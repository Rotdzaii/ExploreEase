import { supabase } from './supabase';

export type ReminderStatus = 'pending' | 'sent';

export type ReminderRow = {
  id: string;
  user_id: string;
  trip_id: string;
  message: string;
  remind_at: string;
  status: ReminderStatus;
  created_at?: string;
};

export const reminderService = {
  async createReminder(input: { tripId: string; message: string; remindAt: Date }) {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const userId = authData.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        user_id: userId,
        trip_id: input.tripId,
        message: input.message,
        remind_at: input.remindAt.toISOString(),
        status: 'pending' as const,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ReminderRow;
  },

  async countPendingRemindersForCurrentUser() {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const userId = authData.user?.id;
    if (!userId) return 0;

    const { count, error } = await supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) throw error;
    return count ?? 0;
  },
};
