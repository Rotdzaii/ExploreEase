import { useTheme } from '@/src/context/theme';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const { colorScheme } = useTheme();
  return colorScheme;
}
