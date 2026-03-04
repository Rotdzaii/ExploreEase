import { GlobalToastHost } from '@/components/GlobalToastHost';
import { CurrencyProvider } from '@/src/context/currency';
import { ThemeProvider } from '@/src/context/theme';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

if (process.env.EXPO_OS === 'web' && typeof console !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('props.pointerEvents is deprecated')) return;
    return originalWarn(...args);
  };
}

if (process.env.EXPO_OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../global.css');
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <CurrencyProvider>
          <GlobalToastHost />
          <Stack screenOptions={{ headerShown: false }}>
            {/* Màn hình Login hiện đầu tiên và không có Tab */}
            <Stack.Screen name="login" />

            {/* Nhóm các màn hình có Tab (Home, Settings...) */}
            <Stack.Screen name="(tabs)" />
          </Stack>
        </CurrencyProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}