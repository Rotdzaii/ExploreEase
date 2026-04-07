import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import type { TimeOfDayPreference } from '@/src/services/recommendationService';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type TimeOfDayToggleProps = {
  value: TimeOfDayPreference;
  onChange: (next: TimeOfDayPreference) => void;
  title?: string;
};

const OPTIONS: TimeOfDayPreference[] = ['auto', 'morning', 'afternoon', 'evening', 'night'];

export function TimeOfDayToggle({ value, onChange, title }: TimeOfDayToggleProps) {
  const { isDark } = useTheme();
  const { t } = useI18n();
  const resolvedTitle = title ?? t('recommendation.timing.title');

  const palette = useMemo(
    () => ({
      title: isDark ? '#f8fafc' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.74)',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
      idleBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
      idleText: isDark ? '#cbd5e1' : '#334155',
    }),
    [isDark]
  );

  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg, borderColor: palette.border }]}> 
      <Text style={[styles.title, { color: palette.title }]}>{resolvedTitle}</Text>
      <Text style={[styles.subtitle, { color: palette.subtitle }]}>{t('recommendation.timing.subtitle')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {OPTIONS.map((item) => {
          const active = value === item;
          return (
            <Pressable
              key={item}
              onPress={() => onChange(item)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? ExploreEaseColors.primary : palette.idleBg,
                  borderColor: active ? ExploreEaseColors.primary : palette.border,
                },
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, { color: active ? '#001018' : palette.idleText }]}>
                {/* Dynamic i18n key: keep recommendation.timing.{auto,morning,afternoon,evening,night} in translations.ts */}
                {t(`recommendation.timing.${item}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  row: {
    gap: 8,
    paddingRight: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 34,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
