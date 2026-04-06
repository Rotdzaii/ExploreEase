import { useI18n } from '@/src/i18n/useI18n';
import { getThemeVars } from '@/utils/themeVars';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

export type InterestItem = {
  id: string;
  label: string;
};

const DEFAULT_INTERESTS: InterestItem[] = [
  { id: 'Food', label: 'Food' },
  { id: 'Culture', label: 'Culture' },
  { id: 'Shopping', label: 'Shopping' },
  { id: 'Nature', label: 'Nature' },
  { id: 'Adventure', label: 'Adventure' },
  { id: 'History', label: 'History' },
];

export function InterestSelection({
  selected,
  onSelectionChange,
  interests,
}: {
  selected: string[];
  onSelectionChange: (next: string[]) => void;
  interests?: InterestItem[];
}) {
  const { t } = useI18n();
  const data = useMemo(() => {
    if (interests) return interests;

    return DEFAULT_INTERESTS.map((item) => {
      if (item.id === 'Food') return { ...item, label: t('profile.interests.food') };
      if (item.id === 'Culture') return { ...item, label: t('profile.interests.culture') };
      if (item.id === 'Shopping') return { ...item, label: t('profile.interests.shopping') };
      if (item.id === 'Nature') return { ...item, label: t('profile.interests.nature') };
      if (item.id === 'Adventure') return { ...item, label: t('profile.interests.adventure') };
      if (item.id === 'History') return { ...item, label: t('profile.interests.history') };
      return item;
    });
  }, [interests, t]);
  const { primary } = getThemeVars();

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = useCallback(
    (id: string) => {
      const next = selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id];
      onSelectionChange(next);
    },
    [onSelectionChange, selected, selectedSet]
  );

  return (
    <View className="px-4">
      <View className="items-center mb-6">
        <View className="p-4 rounded-full bg-white/10 border border-white/10">
          <Feather name="globe" size={44} color={primary} />
        </View>
      </View>

      <Text className="text-3xl font-bold text-white mb-2 text-center">{t('auth.interests.selectTitle')}</Text>
      <Text className="text-white/70 mb-6 text-center">
        {t('auth.interests.selectSubtitle')}
      </Text>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingBottom: 120, gap: 12 }}
        renderItem={({ item }) => {
          const isActive = selectedSet.has(item.id);
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              className={
                'flex-1 h-16 rounded-2xl border items-center justify-center ' +
                (isActive
                  ? 'bg-white/15 border-white/25'
                  : 'bg-white/5 border-white/10')
              }
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <View className="flex-row items-center gap-2">
                <Text className={"font-semibold " + (isActive ? 'text-white' : 'text-white/85')}>
                  {item.label}
                </Text>
                {isActive ? <Feather name="check" size={16} color="white" /> : null}
              </View>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
