import { useTheme } from '@/src/context/theme';

export function useColorScheme() {
	const { colorScheme } = useTheme();
	return colorScheme;
}
