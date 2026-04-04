import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type AppLanguage = 'vi' | 'en';

const STORAGE_KEY = 'exploreEase.language';

const normalizeLanguage = (value: string | null | undefined): AppLanguage => {
  if (value === 'en') return 'en';
  return 'vi';
};

type LanguageState = {
  language: AppLanguage;
  isReady: boolean;
  initializeLanguage: () => Promise<void>;
  setLanguage: (language: AppLanguage) => void;
};

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: 'vi',
  isReady: false,

  initializeLanguage: async () => {
    if (get().isReady) return;

    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const resolved = normalizeLanguage(saved);
      set({ language: resolved, isReady: true });

      if (saved !== resolved) {
        await AsyncStorage.setItem(STORAGE_KEY, resolved);
      }
    } catch {
      set({ language: 'vi', isReady: true });
      void AsyncStorage.setItem(STORAGE_KEY, 'vi');
    }
  },

  setLanguage: (language) => {
    set({ language });
    void AsyncStorage.setItem(STORAGE_KEY, language);
  },
}));
