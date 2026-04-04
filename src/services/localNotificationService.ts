import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type LocalNotificationInput = {
  title?: string | null;
  message?: string | null;
  data?: Record<string, unknown>;
};

let isInitialized = false;
let hasRequestedPermissions = false;

const FALLBACK_TITLE = 'Thong bao moi';
const FALLBACK_MESSAGE = 'Ban co thong bao moi';

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

  const title = input.title?.trim() || FALLBACK_TITLE;
  const body = input.message?.trim() || FALLBACK_MESSAGE;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: input.data ?? {},
    },
    trigger: null,
  });
}
