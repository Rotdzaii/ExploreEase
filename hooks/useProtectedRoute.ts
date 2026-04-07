import { useEffect } from 'react';

import { useRootNavigationState, useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/src/context/auth';
import { adminService } from '@/src/services/adminService';

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

    let alive = true;

    const enforceRouteAccess = async () => {
      const firstSegment = segments[0];
      const inPublicAuthSegment =
        typeof firstSegment === 'string' && PUBLIC_AUTH_SEGMENTS.has(firstSegment);
      const isRootIndex = segments.join('/') === '';
      const inAdminSegment = firstSegment === 'admin';

      if (!session && !inPublicAuthSegment) {
        router.replace('/login');
        return;
      }

      if (session && (inPublicAuthSegment || isRootIndex)) {
        router.replace('/(tabs)');
        return;
      }

      if (session && inAdminSegment) {
        try {
          const isAdmin = await adminService.isCurrentUserAdmin();
          if (!alive) return;
          if (!isAdmin) {
            router.replace('/(tabs)/profile');
          }
        } catch {
          if (!alive) return;
          router.replace('/(tabs)/profile');
        }
      }
    };

    void enforceRouteAccess();

    return () => {
      alive = false;
    };
  }, [isInitialized, navigationState?.key, router, segments, session]);
}
