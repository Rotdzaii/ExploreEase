import { translate } from '@/src/i18n/translations';
import { useLanguageStore } from '@/src/store/useLanguageStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type LocalNotificationInput = {
  title?: string | null;
  message?: string | null;
  data?: Record<string, unknown>;
};

type EventReminderSyncInput = {
  bookmarked: boolean;
  eventId: string;
  eventTitle: string;
  startTime: string | Date;
  userId?: string | null;
  location?: string | null;
};

let isInitialized = false;
let hasRequestedPermissions = false;

const EVENT_REMINDER_MAP_PREFIX = 'event-reminder-map:';

const buildEventReminderMapStorageKey = (userId?: string | null) => {
  const normalizedUserId = String(userId ?? '').trim();
  return `${EVENT_REMINDER_MAP_PREFIX}${normalizedUserId || 'guest'}`;
};

const readEventReminderMap = async (storageKey: string): Promise<Record<string, string>> => {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed ?? {})) {
      const normalizedKey = String(key ?? '').trim();
      const normalizedValue = String(value ?? '').trim();
      if (!normalizedKey || !normalizedValue) continue;
      next[normalizedKey] = normalizedValue;
    }

    return next;
  } catch {
    return {};
  }
};

const writeEventReminderMap = async (storageKey: string, mapping: Record<string, string>) => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(mapping));
};

const cancelScheduledNotificationSafe = async (notificationId?: string | null) => {
  const normalized = String(notificationId ?? '').trim();
  if (!normalized) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(normalized);
  } catch {
    // Ignore stale or unknown identifiers.
  }
};

const getLocalizedFallbackContent = () => {
  const language = useLanguageStore.getState().language;
  return {
    title: translate(language, 'notifications.item.defaultTitle'),
    message: translate(language, 'notifications.item.defaultMessage'),
  };
};

export async function initializeLocalNotificationsAsync() {
  if (Platform.OS === 'web') return;

  if (!isInitialized) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    isInitialized = true;
  }

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return;

  if (!hasRequestedPermissions && permissions.canAskAgain) {
    hasRequestedPermissions = true;
    await Notifications.requestPermissionsAsync();
  }
}

export async function presentLocalNotificationAsync(input: LocalNotificationInput) {
  if (Platform.OS === 'web') return;

  const fallbackContent = getLocalizedFallbackContent();
  const title = input.title?.trim() || fallbackContent.title;
  const body = input.message?.trim() || fallbackContent.message;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: input.data ?? {},
    },
    trigger: null,
  });
}

export async function syncBookmarkedEventReminderAsync(input: EventReminderSyncInput) {
  if (Platform.OS === 'web') return;

  const eventId = String(input.eventId ?? '').trim();
  if (!eventId) return;

  const storageKey = buildEventReminderMapStorageKey(input.userId);
  const reminderMap = await readEventReminderMap(storageKey);
  const existingNotificationId = reminderMap[eventId];

  if (!input.bookmarked) {
    await cancelScheduledNotificationSafe(existingNotificationId);
    if (existingNotificationId) {
      delete reminderMap[eventId];
      await writeEventReminderMap(storageKey, reminderMap);
    }
    return;
  }

  const startDate = input.startTime instanceof Date ? input.startTime : new Date(input.startTime);
  if (Number.isNaN(startDate.getTime())) {
    await cancelScheduledNotificationSafe(existingNotificationId);
    if (existingNotificationId) {
      delete reminderMap[eventId];
      await writeEventReminderMap(storageKey, reminderMap);
    }
    return;
  }

  const reminderAt = new Date(startDate.getTime() - 30 * 60 * 1000);
  if (reminderAt.getTime() <= Date.now()) {
    await cancelScheduledNotificationSafe(existingNotificationId);
    if (existingNotificationId) {
      delete reminderMap[eventId];
      await writeEventReminderMap(storageKey, reminderMap);
    }
    return;
  }

  await initializeLocalNotificationsAsync();
  await cancelScheduledNotificationSafe(existingNotificationId);

  const language = useLanguageStore.getState().language;
  const fallbackContent = getLocalizedFallbackContent();
  const eventTitle = input.eventTitle?.trim() || fallbackContent.title;
  const title = translate(language, 'event.reminder.notificationTitle');
  const body = translate(language, 'event.reminder.notificationBody', { title: eventTitle });

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        type: 'event-reminder',
        eventId,
        eventTitle,
        eventLocation: input.location ?? null,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderAt,
    },
  });

  reminderMap[eventId] = notificationId;
  await writeEventReminderMap(storageKey, reminderMap);
}
