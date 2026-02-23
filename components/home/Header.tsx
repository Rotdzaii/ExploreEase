import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

type HeaderProps = {
  styles: any;
  name: string;
  avatarUrl?: string;
  isDarkMode: boolean;
  onToggleTheme?: () => void;
  hasNotifications?: boolean;
  onPressNotifications?: () => void;
};

export function Header({
  styles,
  name,
  avatarUrl,
  isDarkMode,
  onToggleTheme,
  hasNotifications,
  onPressNotifications,
}: HeaderProps) {
  return (
    <View style={styles.headerShell}>
      <BlurView
        intensity={isDarkMode ? 22 : 35}
        tint={isDarkMode ? 'dark' : 'light'}
        style={styles.headerBlurBg}
      />

      <View style={styles.headerContentRow}>
        <View style={styles.userInfo}>
          <View style={styles.avatarRing}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarImg} />
            )}
          </View>

          <View>
            <Text style={styles.welcomeSub}>Welcome back</Text>
            <Text style={styles.welcomeMain}>Hello, {name}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {onToggleTheme && (
            <Pressable
              style={({ pressed, hovered }) => [
                styles.iconBtn,
                (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.96 } : null,
                pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
              ]}
              onPress={onToggleTheme}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={isDarkMode ? 'weather-sunny' : 'weather-night'}
                size={18}
                color={isDarkMode ? ExploreEaseColors.primary : ExploreEaseColors.background}
              />
            </Pressable>
          )}

          <Pressable
            style={({ pressed, hovered }) => [
              styles.notifBtn,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.96 } : null,
              pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
            ]}
            onPress={onPressNotifications}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name="bell-outline"
              size={20}
              color={ExploreEaseColors.primary}
            />
            {!!hasNotifications && <View style={styles.notifDot} />}
          </Pressable>
        </View>
      </View>

      {/* Web-only: allow clicks to pass through blurred bg */}
      {Platform.OS === 'web' ? <View pointerEvents="none" /> : null}
    </View>
  );
}
