import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type TripActionBarProps = {
  onOptimizeRoute: () => void;
  onShare: () => void;
  optimized: boolean;
};

export function TripActionBar({ onOptimizeRoute, onShare, optimized }: TripActionBarProps) {
  const { isDark } = useTheme();
  const { t } = useI18n();

  const colors = useMemo(
    () => ({
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
      text: isDark ? '#ffffff' : '#0f172a',
      sub: isDark ? '#94a3b8' : '#64748b',
    }),
    [isDark]
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <Pressable
        onPress={onOptimizeRoute}
        style={({ pressed, hovered }) => [
          styles.btn,
          { backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)' },
          hovered ? { opacity: 0.95 } : null,
          pressed ? { opacity: 0.85 } : null,
        ]}
        accessibilityRole="button"
      >
        <Feather name="shuffle" size={18} color={ExploreEaseColors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.btnTitle, { color: colors.text }]}>{t('trips.actions.optimizeTitle')}</Text>
          <Text style={[styles.btnDesc, { color: colors.sub }]}>{optimized ? t('trips.actions.optimizeOn') : t('trips.actions.optimizeOff')}</Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onShare}
        style={({ pressed, hovered }) => [
          styles.btn,
          { backgroundColor: isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.12)' },
          hovered ? { opacity: 0.95 } : null,
          pressed ? { opacity: 0.85 } : null,
        ]}
        accessibilityRole="button"
      >
        <Feather name="share-2" size={18} color={ExploreEaseColors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.btnTitle, { color: colors.text }]}>Chia sẻ QR</Text>
          <Text style={[styles.btnDesc, { color: colors.sub }]}>Mở mã QR và gửi nhanh cho bạn bè</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
  },
  btnTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  btnDesc: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
});
