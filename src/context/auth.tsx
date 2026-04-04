import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/src/services/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isInitialized: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!alive) return;

        if (error) {
          setSession(null);
          setUser(null);
        } else {
          const nextSession = data.session ?? null;
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;

      const resolvedSession = nextSession ?? null;
      setSession(resolvedSession);
      setUser(resolvedSession?.user ?? null);
      setIsInitialized(true);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      isInitialized,
    }),
    [isInitialized, session, user]
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
