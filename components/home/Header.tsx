import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useI18n } from '@/src/i18n/useI18n';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

type HeaderProps = {
  styles: any;
  name: string;
  avatarUrl?: string;
  isDarkMode: boolean;
  badgeCount?: number;
  onPressNotifications?: () => void;
  showNotificationsButton?: boolean;
};

export function Header({
  styles,
  name,
  avatarUrl,
  isDarkMode,
  badgeCount,
  onPressNotifications,
  showNotificationsButton = true,
}: HeaderProps) {
  const { t } = useI18n();
  const globalUnreadCount = useNotificationStore((s) => s.unreadCount);
  const externalCount = typeof badgeCount === 'number' && Number.isFinite(badgeCount) ? Math.max(0, badgeCount) : 0;
  const safeCount = externalCount + Math.max(0, globalUnreadCount);
  const badgeText = safeCount > 99 ? '99+' : String(safeCount);

  return (
    <View style={styles.headerShell}>
      {Platform.OS === 'web' ? (
        <View style={styles.headerBlurBg} />
      ) : (
        <BlurView
          intensity={isDarkMode ? 22 : 35}
          tint={isDarkMode ? 'dark' : 'light'}
          style={styles.headerBlurBg}
        />
      )}

      <View style={styles.headerContentRow}>
        <View style={styles.userInfo}>
          <Pressable
            onPress={() => router.push('/(tabs)/profile' as any)}
            accessibilityRole="button"
            accessibilityLabel={t('home.openProfile')}
            style={({ pressed, hovered }) => [
              styles.avatarRing,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.02 }], opacity: 0.98 } : null,
              pressed ? { opacity: 0.9, transform: [{ scale: 0.99 }] } : null,
            ]}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarImg} />
            )}
          </Pressable>

          <View>
            <Text style={styles.welcomeSub}>{t('home.welcomeBack')}</Text>
            <Text style={styles.welcomeMain}>{t('home.helloName', { name })}</Text>
          </View>
        </View>

        {showNotificationsButton ? (
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.notifBtn,
                (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.96 } : null,
                pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
              ]}
              onPress={onPressNotifications}
              accessibilityRole="button"
              accessibilityLabel={safeCount > 0 ? t('home.notificationsWithCount', { count: safeCount }) : t('home.notifications')}
            >
              <MaterialCommunityIcons
                name="bell-outline"
                size={20}
                color={ExploreEaseColors.primary}
              />
              {safeCount > 0 ? (
                <View style={styles.notifBadge} pointerEvents="none">
                  <Text style={styles.notifBadgeText}>{badgeText}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </View>

    </View>
  );
}
