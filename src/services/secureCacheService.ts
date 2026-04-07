import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const CACHE_PREFIX = 'secure-cache:';
const ENCRYPTION_KEY_STORAGE_KEY = 'exploreease.secureCache.encryptionKey.v1';
const FALLBACK_KEY_STORAGE_KEY = 'exploreease.secureCache.encryptionKey.fallback';

let encryptionKeyCache: string | null = null;

const buildStorageKey = (cacheKey: string) => {
  const normalizedKey = cacheKey.trim();
  if (!normalizedKey) {
    throw new Error('secureCacheService: cache key must not be empty.');
  }

  return `${CACHE_PREFIX}${normalizedKey}`;
};

const generateRandomKey = () => {
  try {
    const bytes = Crypto.getRandomBytes(32);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    const fallbackSeed = `${Date.now()}-${Math.random()}-${Math.random()}`;
    return CryptoJS.SHA256(fallbackSeed).toString(CryptoJS.enc.Hex);
  }
};

const readStoredKey = async (): Promise<string | null> => {
  try {
    const secureStoreKey = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE_KEY);
    if (secureStoreKey) return secureStoreKey;
  } catch (error) {
    console.warn('secureCacheService: cannot read encryption key from SecureStore.', error);
  }

  try {
    const fallbackKey = await AsyncStorage.getItem(FALLBACK_KEY_STORAGE_KEY);
    if (fallbackKey) return fallbackKey;
  } catch {
    // no-op
  }

  return null;
};

const persistGeneratedKey = async (key: string) => {
  let storedInSecureStore = false;

  try {
    await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE_KEY, key);
    storedInSecureStore = true;
  } catch (error) {
    console.warn('secureCacheService: failed to persist encryption key to SecureStore, using fallback.', error);
  }

  if (!storedInSecureStore) {
    await AsyncStorage.setItem(FALLBACK_KEY_STORAGE_KEY, key);
  }
};

const getOrCreateEncryptionKey = async (): Promise<string> => {
  if (encryptionKeyCache) return encryptionKeyCache;

  const existingKey = await readStoredKey();
  if (existingKey) {
    encryptionKeyCache = existingKey;
    return existingKey;
  }

  const generatedKey = generateRandomKey();
  await persistGeneratedKey(generatedKey);
  encryptionKeyCache = generatedKey;
  return generatedKey;
};

const encryptString = (plainText: string, encryptionKey: string) => {
  return CryptoJS.AES.encrypt(plainText, encryptionKey).toString();
};

const decryptString = (cipherText: string, encryptionKey: string) => {
  const bytes = CryptoJS.AES.decrypt(cipherText, encryptionKey);
  const decoded = bytes.toString(CryptoJS.enc.Utf8);

  if (!decoded) {
    throw new Error('secureCacheService: failed to decrypt payload.');
  }

  return decoded;
};

export const secureCacheService = {
  async setJson<T>(cacheKey: string, value: T): Promise<void> {
    const encryptionKey = await getOrCreateEncryptionKey();
    const serialized = JSON.stringify(value);
    const encryptedPayload = encryptString(serialized, encryptionKey);

    await AsyncStorage.setItem(buildStorageKey(cacheKey), encryptedPayload);
  },

  async getJson<T>(cacheKey: string): Promise<T | null> {
    const storageKey = buildStorageKey(cacheKey);
    const encryptedPayload = await AsyncStorage.getItem(storageKey);

    if (!encryptedPayload) return null;

    try {
      const encryptionKey = await getOrCreateEncryptionKey();
      const decrypted = decryptString(encryptedPayload, encryptionKey);
      return JSON.parse(decrypted) as T;
    } catch (error) {
      console.warn('secureCacheService: corrupted cache entry removed.', error);
      await AsyncStorage.removeItem(storageKey);
      return null;
    }
  },

  async remove(cacheKey: string): Promise<void> {
    await AsyncStorage.removeItem(buildStorageKey(cacheKey));
  },

  async clearAll(): Promise<void> {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((key) => key.startsWith(CACHE_PREFIX));

    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  },
};
