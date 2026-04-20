import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryableNetworkError = (err: unknown) => {
  const anyErr = err as { name?: string; message?: string } | null;
  const name = anyErr?.name;
  const message = anyErr?.message ?? '';

  return name === 'AbortError' || message.includes('Network request failed');
};

const fetchWithTimeout: typeof fetch = async (input, init) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      const shouldRetry = attempt === 0 && isRetryableNetworkError(err);
      if (!shouldRetry) throw err;

      await sleep(RETRY_DELAY_MS);
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Unreachable (loop either returns or throws)
  throw new Error('fetchWithTimeout: unexpected state');
};

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('Supabase Check:', { url: rawSupabaseUrl, key: !!rawSupabaseAnonKey });

const isValidHttpUrl = (value?: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

if (!rawSupabaseUrl || !rawSupabaseAnonKey) {
  console.warn(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in a .env file, then restart Expo.'
  );
}

if (rawSupabaseUrl && !isValidHttpUrl(rawSupabaseUrl)) {
  console.warn('Invalid EXPO_PUBLIC_SUPABASE_URL. Expected a valid http(s) URL.');
}

const supabaseUrl: string = isValidHttpUrl(rawSupabaseUrl) ? rawSupabaseUrl! : 'https://example.invalid';
const supabaseAnonKey: string = rawSupabaseAnonKey ?? 'missing-anon-key';

const getWebStorage = () => {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

const secureAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      const webStorage = getWebStorage();
      return webStorage ? webStorage.getItem(key) : null;
    }

    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      const webStorage = getWebStorage();
      if (webStorage) {
        webStorage.setItem(key, value);
      }
      return;
    }

    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      const webStorage = getWebStorage();
      if (webStorage) {
        webStorage.removeItem(key);
      }
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: {
    storage: secureAuthStorage,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
