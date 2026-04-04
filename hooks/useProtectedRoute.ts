import { useEffect } from 'react';

import { useRootNavigationState, useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/src/context/auth';

const PUBLIC_AUTH_SEGMENTS = new Set([
  'login',
  'register',
  'forgot-password',
  'recovery-password',
]);

export function useProtectedRoute() {
  const { session, isInitialized } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!isInitialized) return;
    if (!navigationState?.key) return;

    const firstSegment = segments[0];
    const inPublicAuthSegment =
      typeof firstSegment === 'string' && PUBLIC_AUTH_SEGMENTS.has(firstSegment);
    const isRootIndex = segments.length === 0;

    if (!session && !inPublicAuthSegment) {
      router.replace('/login');
      return;
    }

    if (session && (inPublicAuthSegment || isRootIndex)) {
      router.replace('/(tabs)');
    }
  }, [isInitialized, navigationState?.key, router, segments, session]);
}
