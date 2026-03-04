import { useTheme } from '@/src/context/theme';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const { isDark } = useTheme();
  const tabBgColor = isDark ? 'rgba(26, 38, 55, 0.95)' : '#ffffff';
  const tabBorderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const inactiveColor = isDark ? '#9CA3AF' : '#6B7280';
  const activeColor = '#22d3ee';

  const tabBarBottom = Math.max(20, insets.bottom + 10);

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

  return (
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
          title: 'Trang chủ',
          tabBarIcon: renderTabIcon('home'),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Khám phá',
          tabBarIcon: renderTabIcon('map-pin'),
        }}
      />

      <Tabs.Screen
        name="trips"
        options={{
          title: 'Kế hoạch',
          tabBarIcon: renderTabIcon('briefcase'),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Cá nhân',
          tabBarIcon: renderTabIcon('user'),
        }}
      />
    </Tabs>
  );
}