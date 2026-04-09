import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useGlobalSearchParams, useRootNavigationState, useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/src/context/auth';
import { useI18n } from '@/src/i18n/useI18n';
import { adminService } from '@/src/services/adminService';

const PUBLIC_AUTH_SEGMENTS = new Set([
  'login',
  'register',
  'forgot-password',
  'recovery-password',
]);

const ONBOARDING_SEGMENTS = new Set(['interests', 'onboarding']);
const ONBOARDING_COMPLETED_STORAGE_KEY = 'exploreease.onboarding.completed';
const BIOMETRIC_LOCK_STORAGE_KEY = 'exploreease.security.biometricLockEnabled';

export function useProtectedRoute() {
  const { session, isInitialized } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const segments = useSegments();
  const searchParams = useGlobalSearchParams<{ mode?: string | string[] }>();
  const navigationState = useRootNavigationState();
  const biometricUnlockedRef = useRef(false);
  const biometricPromptingRef = useRef(false);
  const biometricUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    if (!navigationState?.key) return;

    const sessionUserId = session?.user?.id ?? null;
    if (biometricUserIdRef.current !== sessionUserId) {
      biometricUserIdRef.current = sessionUserId;
      biometricUnlockedRef.current = false;
    }

    let alive = true;

    const ensureBiometricUnlocked = async (shouldGate: boolean) => {
      if (!session) return false;
      if (!shouldGate) return true;

      if (Platform.OS === 'web') {
        biometricUnlockedRef.current = true;
        return true;
      }

      if (biometricUnlockedRef.current) return true;

      let isEnabled = false;
      try {
        const raw = await AsyncStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY);
        if (!alive) return false;
        isEnabled = raw === 'true';
      } catch {
        if (!alive) return false;
        isEnabled = false;
      }

      if (!isEnabled) {
        biometricUnlockedRef.current = true;
        return true;
      }

      if (biometricPromptingRef.current) return false;
      biometricPromptingRef.current = true;

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;

        if (!alive) return false;
        if (!hasHardware || !isEnrolled) {
          try {
            await AsyncStorage.setItem(BIOMETRIC_LOCK_STORAGE_KEY, 'false');
          } catch {
            // Ignore persistence failures and avoid locking users out.
          }

          biometricUnlockedRef.current = true;
          return true;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t('security.biometric.promptMessage'),
          cancelLabel: t('common.cancel'),
          fallbackLabel: t('security.biometric.fallbackLabel'),
          disableDeviceFallback: false,
        });

        if (!alive) return false;
        if (!result.success) return false;

        biometricUnlockedRef.current = true;
        return true;
      } catch {
        if (!alive) return false;
        return false;
      } finally {
        biometricPromptingRef.current = false;
      }
    };

    const enforceRouteAccess = async () => {
      const firstSegment = segments[0];
      const modeParam = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode;
      const inPublicAuthSegment =
        typeof firstSegment === 'string' && PUBLIC_AUTH_SEGMENTS.has(firstSegment);
      const isRootIndex = segments.join('/') === '';
      const inAdminSegment = firstSegment === 'admin';
      const inTabsSegment = firstSegment === '(tabs)';
      const inOnboardingSegment =
        typeof firstSegment === 'string' && ONBOARDING_SEGMENTS.has(firstSegment);
      const inInterestsEditMode = firstSegment === 'interests' && modeParam === 'edit';
      const shouldGateTabs = inTabsSegment || inPublicAuthSegment || isRootIndex;

      if (!session && !inPublicAuthSegment) {
        router.replace('/login');
        return;
      }

      if (session && shouldGateTabs) {
        const unlocked = await ensureBiometricUnlocked(shouldGateTabs);
        if (!alive) return;

        if (!unlocked) {
          if (inTabsSegment || isRootIndex || !inPublicAuthSegment) {
            router.replace('/login');
          }
          return;
        }
      }

      if (session && (inPublicAuthSegment || isRootIndex)) {
        router.replace('/(tabs)');
        return;
      }

      if (session && inOnboardingSegment && !inInterestsEditMode) {
        try {
          const hasCompletedOnboarding = await AsyncStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY);
          if (!alive) return;

          if (hasCompletedOnboarding === 'true') {
            router.replace('/(tabs)');
            return;
          }
        } catch {
          if (!alive) return;
        }
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
  }, [isInitialized, navigationState?.key, router, searchParams.mode, segments, session, t]);
}
