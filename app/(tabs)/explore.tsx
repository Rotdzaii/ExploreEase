import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import React, { useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function ExploreScreen() {
  const { isDark } = useTheme();
  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      text: isDark ? '#ffffff' : '#0f172a',
    }),
    [isDark]
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <Text style={[styles.text, { color: colors.text }]}>Khám phá</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, fontWeight: '800' },
});
