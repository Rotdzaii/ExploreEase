import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

type SearchBarProps = {
  styles: any;
  isDarkMode: boolean;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onPressFilters?: () => void;
};

export function SearchBar({
  styles,
  isDarkMode,
  placeholder = 'Where to explore?',
  value,
  onChangeText,
  onPressFilters,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.searchContainer}>
      <BlurView
        intensity={isDarkMode ? 28 : 45}
        tint={isDarkMode ? 'dark' : 'light'}
        style={[styles.searchBlur, focused && styles.searchBlurFocused]}
      >
        <View style={styles.searchInner}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={isDarkMode ? '#94a3b8' : '#64748b'}
          />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)'}
            style={styles.searchInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <Pressable
            style={({ pressed, hovered }) => [
              styles.searchFilterBtn,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.95 } : null,
              pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
            ]}
            onPress={onPressFilters}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={18}
              color={ExploreEaseColors.primary}
            />
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}
