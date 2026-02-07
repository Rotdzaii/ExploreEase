import { BlurView } from 'expo-blur';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';

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
          <Search size={20} color={isDarkMode ? '#94a3b8' : '#64748b'} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)'}
            style={styles.searchInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <TouchableOpacity style={styles.searchFilterBtn} onPress={onPressFilters} activeOpacity={0.85}>
            <SlidersHorizontal size={18} color={'#22d3ee'} />
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}
