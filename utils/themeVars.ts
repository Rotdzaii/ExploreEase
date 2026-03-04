import { Platform } from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';

const readCssVar = (name: string) => {
  if (Platform.OS !== 'web') return null;
  if (typeof document === 'undefined') return null;

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || null;
};

export function getThemeVars() {
  const primary = readCssVar('--color-primary') ?? ExploreEaseColors.primary;
  const background = readCssVar('--color-background') ?? ExploreEaseColors.background;
  return { primary, background };
}
