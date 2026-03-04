import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  colorScheme: AppColorScheme;
  isDark: boolean;
  isReady: boolean;
  setColorScheme: (scheme: AppColorScheme) => void;
  toggleColorScheme: () => void;
};

const STORAGE_KEY = 'exploreEase.colorScheme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const safeSetSystemColorScheme = (scheme: AppColorScheme) => {
  try {
    // `Appearance.setColorScheme` is not available on all platforms/versions.
    // Guard it so we can still satisfy the “default light” requirement safely.
    (Appearance as any)?.setColorScheme?.(scheme);
  } catch {
    // ignore
  }
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<AppColorScheme>('light');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const resolved: AppColorScheme = saved === 'dark' || saved === 'light' ? saved : 'light';
        if (!alive) return;
        setColorSchemeState(resolved);
        safeSetSystemColorScheme(resolved);

        // If there is no saved setting, persist default light so other sessions stay consistent.
        if (saved !== 'dark' && saved !== 'light') {
          await AsyncStorage.setItem(STORAGE_KEY, 'light');
        }
      } catch {
        if (!alive) return;
        setColorSchemeState('light');
        safeSetSystemColorScheme('light');
      } finally {
        if (alive) setIsReady(true);
      }
    };

    void init();
    return () => {
      alive = false;
    };
  }, []);

  const setColorScheme = useCallback((scheme: AppColorScheme) => {
    setColorSchemeState(scheme);
    safeSetSystemColorScheme(scheme);
    void AsyncStorage.setItem(STORAGE_KEY, scheme);
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, setColorScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      isDark: colorScheme === 'dark',
      isReady,
      setColorScheme,
      toggleColorScheme,
    }),
    [colorScheme, isReady, setColorScheme, toggleColorScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
