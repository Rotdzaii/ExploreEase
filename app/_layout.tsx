import { GlobalToastHost } from '@/components/GlobalToastHost';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { AuthProvider } from '@/src/context/auth';
import { CurrencyProvider } from '@/src/context/currency';
import { ThemeProvider } from '@/src/context/theme';
import { initializeLocalNotificationsAsync } from '@/src/services/localNotificationService';
import { useLanguageStore } from '@/src/store/useLanguageStore';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
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

function AuthRouteGate() {
  useProtectedRoute();
  return null;
}

export default function RootLayout() {
  const initializeLanguage = useLanguageStore((s) => s.initializeLanguage);

  useEffect(() => {
    void initializeLanguage();
    void initializeLocalNotificationsAsync();
  }, [initializeLanguage]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <GlobalToastHost />
            <AuthRouteGate />
            <Stack screenOptions={{ headerShown: false }}>
              {/* Màn hình Login hiện đầu tiên và không có Tab */}
              <Stack.Screen name="login" />
              <Stack.Screen name="forgot-password" />
              <Stack.Screen name="recovery-password" />
              <Stack.Screen name="event/[id]" />
              <Stack.Screen name="itinerary/[id]" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="admin/dashboard" />

              {/* Nhóm các màn hình có Tab (Home, Settings...) */}
              <Stack.Screen name="(tabs)" />
            </Stack>
          </CurrencyProvider>
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}