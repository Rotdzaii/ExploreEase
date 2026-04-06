import { NotificationPopover } from '@/components/notifications/NotificationPopover';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, Tabs } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const { isDark } = useTheme();
  const { t } = useI18n();
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markRead = useNotificationStore((s) => s.markRead);

  const [isPopoverVisible, setIsPopoverVisible] = useState(false);

  const tabBgColor = isDark ? 'rgba(26, 38, 55, 0.95)' : '#ffffff';
  const tabBorderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const inactiveColor = isDark ? '#9CA3AF' : '#6B7280';
  const activeColor = '#22d3ee';

  const tabBarBottom = Math.max(20, insets.bottom + 10);
  const bellTop = Math.max(10, insets.top + 10);
  const popoverTop = bellTop + 52;

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  const previewNotifications = useMemo(
    () => notifications.slice(0, 24),
    [notifications]
  );

  const tabBarStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      bottom: tabBarBottom,
      left: 20,
      right: 20,
      borderRadius: 25,
      height: 60,
      elevation: 0,
      backgroundColor: 'transparent',
      borderTopColor: tabBorderColor,
      borderTopWidth: 1,
      overflow: 'hidden' as const,
    }),
    [tabBarBottom, tabBorderColor]
  );

  const tabBarBackground = useCallback(function TabBarBackground() {
    const tint = isDark ? 'dark' : 'light';
    const intensity = isDark ? 22 : 18;

    if (Platform.OS === 'web') {
      return <View style={[StyleSheet.absoluteFill, { backgroundColor: tabBgColor }]} />;
    }

    return (
      <View style={StyleSheet.absoluteFill}>
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tabBgColor }]} />
      </View>
    );
  }, [isDark, tabBgColor]);

  const renderTabIcon = useCallback(
    (iconName: React.ComponentProps<typeof Feather>['name']) =>
      function TabIcon({ color, focused }: { color: string; focused: boolean }) {
        return (
          <View className="items-center justify-center">
            <Feather name={iconName} size={22} color={color} />
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                marginTop: 4,
                backgroundColor: activeColor,
                opacity: focused ? 1 : 0,
              }}
            />
          </View>
        );
      },
    [activeColor]
  );

  const togglePopover = useCallback(() => {
    setIsPopoverVisible((prev) => !prev);
  }, []);

  const closePopover = useCallback(() => {
    setIsPopoverVisible(false);
  }, []);

  const onPressNotification = useCallback(
    (id: string) => {
      markRead(id);
      setIsPopoverVisible(false);
    },
    [markRead]
  );

  const onPressViewAll = useCallback(() => {
    setIsPopoverVisible(false);
    router.push('/notifications' as any);
  }, []);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle,
          tabBarBackground,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarLabelStyle: { fontSize: 12, marginTop: 2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: renderTabIcon('home'),
          }}
        />

        <Tabs.Screen
          name="explore"
          options={{
            title: t('tabs.explore'),
            tabBarIcon: renderTabIcon('map-pin'),
          }}
        />

        <Tabs.Screen
          name="trips"
          options={{
            title: t('tabs.trips'),
            tabBarIcon: renderTabIcon('briefcase'),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: renderTabIcon('user'),
          }}
        />
      </Tabs>

      <View pointerEvents="box-none" style={styles.overlayLayer}>
        <Pressable
          onPress={togglePopover}
          style={({ pressed, hovered }) => [
            styles.bellButton,
            {
              top: bellTop,
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.9)',
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
            },
            Platform.OS === 'web' && hovered ? { opacity: 0.98, transform: [{ scale: 1.03 }] } : null,
            pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0
              ? t('home.notificationsWithCount', { count: unreadCount })
              : t('home.notifications')
          }
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color={activeColor} />

          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <NotificationPopover
        visible={isPopoverVisible}
        notifications={previewNotifications}
        unreadCount={unreadCount}
        top={popoverTop}
        right={16}
        onClose={closePopover}
        onPressNotification={onPressNotification}
        onPressViewAll={onPressViewAll}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    elevation: 1200,
  },
  bellButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 17,
    height: 17,
    borderRadius: 99,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 11,
  },
});