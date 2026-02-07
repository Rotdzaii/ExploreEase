import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Bell, Moon, Sun } from 'lucide-react-native';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

type HeaderProps = {
  styles: any;
  name: string;
  avatarUrl?: string;
  isDarkMode: boolean;
  onToggleTheme?: () => void;
  hasNotifications?: boolean;
};

export function Header({
  styles,
  name,
  avatarUrl,
  isDarkMode,
  onToggleTheme,
  hasNotifications,
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
            <TouchableOpacity style={styles.iconBtn} onPress={onToggleTheme} activeOpacity={0.85}>
              {isDarkMode ? (
                <Sun size={18} color={isDarkMode ? '#22d3ee' : '#0f172a'} />
              ) : (
                <Moon size={18} color={isDarkMode ? '#22d3ee' : '#0f172a'} />
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.notifBtn} activeOpacity={0.85}>
            <Bell size={20} color={'#22d3ee'} />
            {!!hasNotifications && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Web-only: allow clicks to pass through blurred bg */}
      {Platform.OS === 'web' ? <View pointerEvents="none" /> : null}
    </View>
  );
}
