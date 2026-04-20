import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useGlobalSearchParams, useRootNavigationState, useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/src/context/auth';
import { useI18n } from '@/src/i18n/useI18n';
import { adminService } from '@/src/services/adminService';
import { authService } from '@/src/services/authService';
import { supabase } from '@/src/services/supabase';

const PUBLIC_AUTH_SEGMENTS = new Set([
  'login',
  'register',
  'forgot-password',
  'recovery-password',
]);

const ONBOARDING_SEGMENTS = new Set(['interests', 'onboarding']);
const ONBOARDING_COMPLETED_STORAGE_KEY = 'exploreease.onboarding.completed';
const BIOMETRIC_LOCK_STORAGE_KEY = 'exploreease.security.biometricLockEnabled';
const MFA_VERIFY_SEGMENT = 'mfa-verify';
const PASSWORD_RECOVERY_MODE = 'update-password';

export function useProtectedRoute() {
  const { session, isInitialized, isPasswordRecovery } = useAuth();
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

    const ensureBiometricUnlocked = async (activeSession: typeof session, shouldGate: boolean) => {
      if (!activeSession) return false;
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
      const inUpdatePasswordSegment =
        firstSegment === 'forgot-password' && modeParam === PASSWORD_RECOVERY_MODE;
      const inMfaVerifySegment = firstSegment === MFA_VERIFY_SEGMENT;
      const isRootIndex = segments.join('/') === '';
      const inAdminSegment = firstSegment === 'admin';
      const inTabsSegment = firstSegment === '(tabs)';
      const inOnboardingSegment =
        typeof firstSegment === 'string' && ONBOARDING_SEGMENTS.has(firstSegment);
      const inInterestsEditMode = firstSegment === 'interests' && modeParam === 'edit';
      const shouldGateTabs =
        inTabsSegment || isRootIndex || (inPublicAuthSegment && !inUpdatePasswordSegment);

      const { data: latestSessionData, error: latestSessionError } = await supabase.auth.getSession();
      if (latestSessionError) {
        console.warn('useProtectedRoute.getSession failed:', latestSessionError.message);
      }

      const effectiveSession = latestSessionData.session ?? session;

      if (!effectiveSession && !inPublicAuthSegment) {
        router.replace('/login');
        return;
      }

      if (effectiveSession && isPasswordRecovery && !inUpdatePasswordSegment) {
        router.replace({
          pathname: '/forgot-password',
          params: {
            mode: PASSWORD_RECOVERY_MODE,
          },
        } as any);
        return;
      }

      if (effectiveSession) {
        const mfaGate = await authService.getMfaGateInfo(effectiveSession.user ?? null);

        const sessionUserAal = String(
          (effectiveSession.user as any)?.aal ?? (effectiveSession.user as any)?.app_metadata?.aal ?? ''
        )
          .trim()
          .toLowerCase();
        const sessionFactorCount = Array.isArray((effectiveSession.user as any)?.factors)
          ? ((effectiveSession.user as any).factors as unknown[]).length
          : 0;
        const sessionSignalsAal2WithFactors =
          sessionUserAal === 'aal2' && (sessionFactorCount > 0 || mfaGate.hasKnownFactor);

        const shouldRequireMfa = mfaGate.requiresMfa && !sessionSignalsAal2WithFactors;

        if (shouldRequireMfa && !inMfaVerifySegment) {
          router.replace({
            pathname: '/mfa-verify',
            params: {
              factorId: mfaGate.factorId ?? '',
            },
          } as any);
          return;
        }

        if (!shouldRequireMfa && inMfaVerifySegment) {
          router.replace('/(tabs)');
          return;
        }
      }

      if (effectiveSession && shouldGateTabs) {
        const unlocked = await ensureBiometricUnlocked(effectiveSession, shouldGateTabs);
        if (!alive) return;

        if (!unlocked) {
          if (inTabsSegment || isRootIndex || !inPublicAuthSegment) {
            router.replace('/login');
          }
          return;
        }
      }

      if (effectiveSession && (inPublicAuthSegment || isRootIndex)) {
        if (inUpdatePasswordSegment) {
          return;
        }

        router.replace('/(tabs)');
        return;
      }

      if (effectiveSession && inOnboardingSegment && !inInterestsEditMode) {
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

      if (effectiveSession && inAdminSegment) {
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
  }, [isInitialized, isPasswordRecovery, navigationState?.key, router, searchParams.mode, segments, session, t]);
}
