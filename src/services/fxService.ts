import AsyncStorage from '@react-native-async-storage/async-storage';

type FxCache = {
  rate: number;
  fetchedAt: number; // epoch ms
};

const USD_VND_CACHE_KEY = 'exploreEase.fx.usdVnd';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

async function readCache(): Promise<FxCache | null> {
  try {
    const raw = await AsyncStorage.getItem(USD_VND_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FxCache>;
    if (!isFinitePositive(parsed.rate) || typeof parsed.fetchedAt !== 'number') return null;
    return { rate: parsed.rate, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

async function writeCache(value: FxCache) {
  try {
    await AsyncStorage.setItem(USD_VND_CACHE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

async function fetchUsdVndRate(): Promise<FxCache> {
  // Free endpoint, no API key. Response format:
  // { result: 'success', time_last_update_unix: 1710000000, rates: { VND: 25000, ... } }
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);

  const json = (await res.json()) as any;
  const rate = json?.rates?.VND;

  if (!isFinitePositive(rate)) {
    throw new Error('FX response missing VND rate');
  }

  return { rate, fetchedAt: Date.now() };
}

export const fxService = {
  async getUsdToVndRate(options?: { force?: boolean; ttlMs?: number }) {
    const force = !!options?.force;
    const ttlMs = typeof options?.ttlMs === 'number' && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;

    const cached = await readCache();
    const isFresh = cached ? Date.now() - cached.fetchedAt < ttlMs : false;

    if (!force && cached && isFresh) return cached.rate;

    try {
      const latest = await fetchUsdVndRate();
      await writeCache(latest);
      return latest.rate;
    } catch {
      // Fallback to cached even if stale.
      return cached?.rate ?? null;
    }
  },
};
