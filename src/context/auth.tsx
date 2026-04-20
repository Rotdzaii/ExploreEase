import type { Session, User } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { translate } from '@/src/i18n/translations';
import { supabase } from '@/src/services/supabase';
import { useLanguageStore } from '@/src/store/useLanguageStore';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isInitialized: boolean;
  isPasswordRecovery: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_REFRESH_RETRY_DELAY_MS = 12_000;
const SESSION_EXPIRY_GRACE_MS = 4_000;
const SIGNED_OUT_TIMEOUT_WINDOW_MS = 90_000;
const PASSWORD_RECOVERY_MODE = 'update-password';

const isNetworkAuthError = (message: string) => {
  const lower = message.toLowerCase();
  return (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('aborterror') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  );
};

const isSessionExpiredAuthError = (message: string) => {
  const lower = message.toLowerCase();
  return (
    lower.includes('refresh token') ||
    lower.includes('invalid_grant') ||
    lower.includes('jwt expired') ||
    lower.includes('session has expired') ||
    lower.includes('refresh_token_not_found')
  );
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const getText = useCallback((key: string, params?: Record<string, string | number>) => {
    const lang = useLanguageStore.getState().language;
    return translate(lang, key, params);
  }, []);

  const sessionCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasForcedTimeoutLogoutRef = useRef(false);
  const lastSessionExpiresAtMsRef = useRef(0);

  const clearSessionCheckTimer = useCallback(() => {
    if (!sessionCheckTimeoutRef.current) return;
    clearTimeout(sessionCheckTimeoutRef.current);
    sessionCheckTimeoutRef.current = null;
  }, []);

  const forceSessionTimeoutLogout = useCallback(async () => {
    if (hasForcedTimeoutLogoutRef.current) return;
    hasForcedTimeoutLogoutRef.current = true;

    clearSessionCheckTimer();

    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign-out errors and continue with local cleanup
    }

    setSession(null);
    setUser(null);
    setIsPasswordRecovery(false);
    setIsInitialized(true);

    Alert.alert(getText('auth.sessionExpiredTitle'), getText('auth.sessionExpiredMessage'));
    router.replace('/login');
  }, [clearSessionCheckTimer, getText]);

  const validateSessionAfterExpiry = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      const errorMessage = String(error?.message ?? '').trim();

      if (error) {
        if (isNetworkAuthError(errorMessage)) {
          sessionCheckTimeoutRef.current = setTimeout(() => {
            void validateSessionAfterExpiry();
          }, SESSION_REFRESH_RETRY_DELAY_MS);
          return;
        }

        if (isSessionExpiredAuthError(errorMessage)) {
          await forceSessionTimeoutLogout();
          return;
        }

        return;
      }

      const nextSession = data.session ?? null;
      if (!nextSession) {
        await forceSessionTimeoutLogout();
        return;
      }

      const nextExpiresAtMs = Number(nextSession.expires_at ?? 0) * 1000;
      if (!Number.isFinite(nextExpiresAtMs) || nextExpiresAtMs <= Date.now()) {
        await forceSessionTimeoutLogout();
      }
    } catch (error: any) {
      const message = String(error?.message ?? '').trim();
      if (isNetworkAuthError(message)) {
        sessionCheckTimeoutRef.current = setTimeout(() => {
          void validateSessionAfterExpiry();
        }, SESSION_REFRESH_RETRY_DELAY_MS);
        return;
      }

      if (isSessionExpiredAuthError(message)) {
        await forceSessionTimeoutLogout();
      }
    }
  }, [forceSessionTimeoutLogout]);

  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!alive) return;

        if (error) {
          setSession(null);
          setUser(null);

          if (isSessionExpiredAuthError(String(error.message ?? ''))) {
            void forceSessionTimeoutLogout();
          }
        } else {
          const nextSession = data.session ?? null;
          setSession(nextSession);
          setUser(nextSession?.user ?? null);

          if (nextSession) {
            hasForcedTimeoutLogoutRef.current = false;
            lastSessionExpiresAtMsRef.current = Number(nextSession.expires_at ?? 0) * 1000;
          }
        }
      } catch {
        if (!alive) return;
        setSession(null);
        setUser(null);
      } finally {
        if (alive) {
          setIsInitialized(true);
        }
      }
    };

    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return;

      const resolvedSession = nextSession ?? null;
      setSession(resolvedSession);
      setUser(resolvedSession?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        router.replace({
          pathname: '/forgot-password',
          params: {
            mode: PASSWORD_RECOVERY_MODE,
          },
        } as any);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }

      if (resolvedSession) {
        hasForcedTimeoutLogoutRef.current = false;
        lastSessionExpiresAtMsRef.current = Number(resolvedSession.expires_at ?? 0) * 1000;
      } else if (event === 'SIGNED_OUT') {
        const now = Date.now();
        const expiresAtMs = lastSessionExpiresAtMsRef.current;
        const looksLikeTimedOut = expiresAtMs > 0 && now >= expiresAtMs - SIGNED_OUT_TIMEOUT_WINDOW_MS;

        if (looksLikeTimedOut) {
          void forceSessionTimeoutLogout();
        }
      }

      setIsInitialized(true);
    });

    return () => {
      alive = false;
      clearSessionCheckTimer();
      listener.subscription.unsubscribe();
    };
  }, [clearSessionCheckTimer, forceSessionTimeoutLogout]);

  useEffect(() => {
    clearSessionCheckTimer();

    if (!isInitialized || !session) return;

    const expiresAtSeconds = Number(session.expires_at ?? 0);
    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return;

    const expiresAtMs = expiresAtSeconds * 1000;
    const delayMs = expiresAtMs - Date.now() + SESSION_EXPIRY_GRACE_MS;

    sessionCheckTimeoutRef.current = setTimeout(() => {
      void validateSessionAfterExpiry();
    }, Math.max(1500, delayMs));

    return () => {
      clearSessionCheckTimer();
    };
  }, [clearSessionCheckTimer, isInitialized, session, validateSessionAfterExpiry]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      isInitialized,
      isPasswordRecovery,
    }),
    [isInitialized, isPasswordRecovery, session, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
