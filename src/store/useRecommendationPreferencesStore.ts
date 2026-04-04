import { create } from 'zustand';

import type { TimeOfDayPreference } from '../services/recommendationService';

type RecommendationPreferencesState = {
  timeOfDayPreference: TimeOfDayPreference;
  setTimeOfDayPreference: (next: TimeOfDayPreference) => void;
};

export const useRecommendationPreferencesStore = create<RecommendationPreferencesState>((set) => ({
  timeOfDayPreference: 'auto',
  setTimeOfDayPreference: (next) =>
    set(() => ({
      timeOfDayPreference: next,
    })),
}));
