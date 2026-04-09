import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKMARKS_PREFIX = 'event-bookmarks:';

type BookmarkPayload = {
  ids: string[];
  updatedAt: string;
};

const buildStorageKey = (userId?: string | null) => {
  const normalizedUserId = String(userId ?? '').trim();
  return `${BOOKMARKS_PREFIX}${normalizedUserId || 'guest'}`;
};

const normalizeEventId = (eventId: string) => String(eventId ?? '').trim();

const sanitizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    )
  );
};

const readPayload = async (storageKey: string): Promise<BookmarkPayload> => {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) {
    return {
      ids: [],
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BookmarkPayload>;
    return {
      ids: sanitizeIds(parsed?.ids),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return {
      ids: [],
      updatedAt: new Date().toISOString(),
    };
  }
};

const writePayload = async (storageKey: string, ids: string[]) => {
  const payload: BookmarkPayload = {
    ids: sanitizeIds(ids),
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
};

export const eventBookmarkService = {
  async getIsBookmarked(eventId: string, userId?: string | null): Promise<boolean> {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) return false;

    const storageKey = buildStorageKey(userId);
    const payload = await readPayload(storageKey);
    return payload.ids.includes(normalizedEventId);
  },

  async setBookmarked(eventId: string, bookmarked: boolean, userId?: string | null): Promise<void> {
    const normalizedEventId = normalizeEventId(eventId);
    if (!normalizedEventId) {
      throw new Error('Missing event id.');
    }

    const storageKey = buildStorageKey(userId);
    const payload = await readPayload(storageKey);

    const nextIds = bookmarked
      ? Array.from(new Set([...payload.ids, normalizedEventId]))
      : payload.ids.filter((id) => id !== normalizedEventId);

    await writePayload(storageKey, nextIds);
  },
};
