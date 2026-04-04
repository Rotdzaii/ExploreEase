import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useI18n } from '@/src/i18n/useI18n';

export type RatingDistributionEntry = {
  star: number;
  count: number;
  percent: number;
};

type RatingDistributionProps = {
  entries: RatingDistributionEntry[];
  isDark: boolean;
  scale: (value: number) => number;
};

export function RatingDistribution({ entries, isDark, scale }: RatingDistributionProps) {
  const { t } = useI18n();

  return (
    <View
      style={[
        styles.container,
        {
          marginTop: scale(12),
          borderRadius: scale(14),
          padding: scale(12),
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
        },
      ]}
    >
      {entries.map((entry) => (
        <View key={entry.star} style={[styles.row, { marginTop: scale(4) }]}>
          <Text style={{ width: scale(38), fontWeight: '800', fontSize: scale(12), color: isDark ? '#f8fafc' : '#0f172a' }}>
            {t('review.distribution.stars', { star: entry.star })}
          </Text>
          <View
            style={[
              styles.track,
              {
                height: scale(8),
                borderRadius: scale(6),
                backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)',
              },
            ]}
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(0, Math.min(100, entry.percent))}%`,
                  borderRadius: scale(6),
                },
              ]}
            />
          </View>
          <Text style={{ width: scale(24), textAlign: 'right', fontWeight: '800', fontSize: scale(12), color: isDark ? '#94a3b8' : 'rgba(0,0,0,0.55)' }}>
            {entry.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: ExploreEaseColors.primary,
  },
});
