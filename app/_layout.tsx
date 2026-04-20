import { GlobalToastHost } from '@/components/GlobalToastHost';
import { useNetwork } from '@/hooks/useNetwork';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { AuthProvider } from '@/src/context/auth';
import { CurrencyProvider } from '@/src/context/currency';
import { ThemeProvider } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { initializeLocalNotificationsAsync } from '@/src/services/localNotificationService';
import { offlineSyncService } from '@/src/services/offlineSyncService';
import { useLanguageStore } from '@/src/store/useLanguageStore';
import { useNotificationStore } from '@/src/store/useNotificationStore';
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
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { t } = useI18n();
  const { isOnline } = useNetwork();

  useEffect(() => {
    void initializeLanguage();
    void initializeLocalNotificationsAsync();
  }, [initializeLanguage]);

  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    const run = async () => {
      try {
        const result = await offlineSyncService.syncPendingReviews();
        if (cancelled) return;

        if (result.syncedCount > 0) {
          addNotification({
            message: t('sync.pendingReviews', { count: result.syncedCount }),
            type: 'success',
            durationMs: 3200,
          });
        }
      } catch (error: any) {
        if (cancelled) return;
        console.warn('offline review sync failed:', error?.message ?? error);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [addNotification, isOnline, t]);

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
              <Stack.Screen name="mfa-verify" />
              <Stack.Screen name="event/[id]" />
              <Stack.Screen name="festivals" />
              <Stack.Screen name="itinerary/[id]" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="security" />
              <Stack.Screen name="messages/index" />
              <Stack.Screen name="messages/[id]" />
              <Stack.Screen name="user/[id]" />
              <Stack.Screen name="admin/dashboard" />
              <Stack.Screen name="search-filter" />

              {/* Nhóm các màn hình có Tab (Home, Settings...) */}
              <Stack.Screen name="(tabs)" />
            </Stack>
          </CurrencyProvider>
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}