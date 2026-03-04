import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { fxService } from '@/src/services/fxService';
import { profileService } from '@/src/services/profileService';
import { formatCurrency } from '@/utils/format';

type CurrencyCode = 'USD' | 'VND';

type CurrencyContextValue = {
  nationality: string;
  targetCurrency: CurrencyCode;
  usdToVndRate: number | null;
  isReady: boolean;
  refresh: () => Promise<void>;
  convertUsdToTarget: (amountUsd: number) => number;
  formatPricePerPerson: (amountUsd: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [nationality, setNationality] = useState<string>('VN');
  const [usdToVndRate, setUsdToVndRate] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const nationalityRef = useRef(nationality);
  nationalityRef.current = nationality;

  const targetCurrency: CurrencyCode = nationality === 'VN' ? 'VND' : 'USD';

  const refresh = useCallback(async () => {
    // Load profile nationality (canonicalized by profileService)
    let nat: string = 'VN';
    try {
      nat = await profileService.getCurrentNationality();
      setNationality(nat);
    } catch {
      setNationality('VN');
    }

    // Only fetch FX rate if we may need VND conversion.
    const shouldFetchFx = nat === 'VN';
    if (!shouldFetchFx) {
      setUsdToVndRate(null);
      setIsReady(true);
      return;
    }

    const rate = await fxService.getUsdToVndRate({ force: true, ttlMs: REFRESH_INTERVAL_MS });
    setUsdToVndRate(rate);
    setIsReady(true);
  }, []);

  useEffect(() => {
    let alive = true;

    const init = async () => {
      // Seed cached rate fast (no force) to avoid flicker.
      try {
        const nat = await profileService.getCurrentNationality();
        if (!alive) return;
        setNationality(nat);

        if (nat === 'VN') {
          const cachedRate = await fxService.getUsdToVndRate({ force: false, ttlMs: REFRESH_INTERVAL_MS });
          if (!alive) return;
          setUsdToVndRate(cachedRate);
        }
      } finally {
        if (alive) setIsReady(true);
      }

      // Always do a force refresh once at startup.
      if (!alive) return;
      await refresh();
    };

    void init();

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };

    const sub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      alive = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [refresh]);

  const convertUsdToTarget = useCallback(
    (amountUsd: number) => {
      if (!Number.isFinite(amountUsd)) return 0;
      if (targetCurrency === 'USD') return amountUsd;
      const rate = usdToVndRate;
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return amountUsd;
      return amountUsd * rate;
    },
    [targetCurrency, usdToVndRate]
  );

  const formatPricePerPerson = useCallback(
    (amountUsd: number) => {
      if (targetCurrency === 'VND') {
        const rate = usdToVndRate;
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
          // Avoid showing unconverted USD amount with a VND symbol.
          return `${formatCurrency(amountUsd, 'US')} / người`;
        }
      }

      const converted = convertUsdToTarget(amountUsd);
      const natForFormat = targetCurrency === 'VND' ? 'VN' : 'US';
      return `${formatCurrency(converted, natForFormat)} / người`;
    },
    [convertUsdToTarget, targetCurrency, usdToVndRate]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      nationality,
      targetCurrency,
      usdToVndRate,
      isReady,
      refresh,
      convertUsdToTarget,
      formatPricePerPerson,
    }),
    [convertUsdToTarget, formatPricePerPerson, isReady, nationality, refresh, targetCurrency, usdToVndRate]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
