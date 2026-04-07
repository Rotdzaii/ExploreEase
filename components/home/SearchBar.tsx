import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useI18n } from '@/src/i18n/useI18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

type VoiceSearchState = 'idle' | 'recording' | 'processing';

type SearchBarProps = {
  styles: any;
  isDarkMode: boolean;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
  onPressFilters?: () => void;
  voiceSearchState?: VoiceSearchState;
  voiceStatusText?: string | null;
  onPressVoiceSearch?: () => void;
  disableVoiceSearch?: boolean;
};

export function SearchBar({
  styles,
  isDarkMode,
  placeholder,
  value,
  onChangeText,
  onSubmitEditing,
  onPressFilters,
  voiceSearchState = 'idle',
  voiceStatusText,
  onPressVoiceSearch,
  disableVoiceSearch = false,
}: SearchBarProps) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const isRecording = voiceSearchState === 'recording';
  const isProcessing = voiceSearchState === 'processing';
  const resolvedPlaceholder = placeholder ?? t('home.searchPlaceholder');

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
            placeholder={resolvedPlaceholder}
            placeholderTextColor={isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)'}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={onSubmitEditing}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          {onPressVoiceSearch ? (
            <Pressable
              style={({ pressed, hovered }) => [
                styles.searchFilterBtn,
                isRecording
                  ? {
                      backgroundColor: isDarkMode ? 'rgba(239,68,68,0.24)' : 'rgba(239,68,68,0.15)',
                      borderWidth: 1,
                      borderColor: isDarkMode ? 'rgba(248,113,113,0.7)' : 'rgba(220,38,38,0.45)',
                    }
                  : null,
                (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.95 } : null,
                pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
              ]}
              onPress={onPressVoiceSearch}
              disabled={disableVoiceSearch}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? t('home.voice.stop') : t('home.voice.start')}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
              ) : (
                <MaterialCommunityIcons
                  name={isRecording ? 'microphone' : 'microphone-outline'}
                  size={18}
                  color={isRecording ? '#ef4444' : (isDarkMode ? '#94a3b8' : '#64748b')}
                />
              )}
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed, hovered }) => [
              styles.searchFilterBtn,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.95 } : null,
              pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
            ]}
            onPress={onPressFilters}
            accessibilityRole="button"
            accessibilityLabel={t('common.filter')}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={18}
              color={ExploreEaseColors.primary}
            />
          </Pressable>
        </View>
      </BlurView>

      {voiceStatusText ? (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          {isProcessing ? (
            <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
          ) : (
            <MaterialCommunityIcons
              name={isRecording ? 'record-circle-outline' : 'information-outline'}
              size={14}
              color={isRecording ? '#ef4444' : (isDarkMode ? '#94a3b8' : '#64748b')}
            />
          )}
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: isRecording ? (isDarkMode ? '#fca5a5' : '#b91c1c') : (isDarkMode ? '#94a3b8' : '#64748b'),
            }}
          >
            {voiceStatusText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
