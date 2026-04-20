import { Alert, Platform } from 'react-native';

type ConfirmDestructiveActionOptions = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
};

export const confirmDestructiveAction = async ({
  title,
  message,
  confirmText,
  cancelText,
}: ConfirmDestructiveActionOptions): Promise<boolean> => {
  if (Platform.OS === 'web') {
    const webConfirm = (globalThis as { confirm?: (value: string) => boolean } | undefined)?.confirm;
    if (typeof webConfirm === 'function') {
      return webConfirm(`${title}\n\n${message}`);
    }
  }

  return await new Promise<boolean>((resolve) => {
    let isResolved = false;
    const finalize = (value: boolean) => {
      if (isResolved) return;
      isResolved = true;
      resolve(value);
    };

    Alert.alert(
      title,
      message,
      [
        {
          text: cancelText,
          style: 'cancel',
          onPress: () => finalize(false),
        },
        {
          text: confirmText,
          style: 'destructive',
          onPress: () => finalize(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => finalize(false),
      }
    );
  });
};