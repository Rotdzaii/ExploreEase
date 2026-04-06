import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useI18n } from '@/src/i18n/useI18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

type CategoryId = string;

type CategoryItem = {
  id: string;
  label: string;
};

type CategoriesCarouselProps = {
  styles: any;
  isDarkMode: boolean;
  categories?: CategoryItem[];
  initialActiveId?: CategoryId;
  onChange?: (id: CategoryId) => void;
};

export function CategoriesCarousel({
  styles,
  isDarkMode,
  categories: categoriesProp,
  initialActiveId = 'beaches',
  onChange,
}: CategoriesCarouselProps) {
  const { t } = useI18n();
  const categories = useMemo<CategoryItem[]>(
    () =>
      categoriesProp ?? [
        { id: 'mountains', label: t('home.category.mountains') },
        { id: 'beaches', label: t('home.category.beaches') },
        { id: 'cities', label: t('home.category.cities') },
        { id: 'camping', label: t('home.category.camping') },
      ],
    [categoriesProp, t]
  );

  const iconForCategory = (label: string) => {
    const key = label.toLowerCase();
    if (key.includes('beach') || key.includes('biển')) return 'waves';
    if (key.includes('mount') || key.includes('núi')) return 'image-filter-hdr';
    if (key.includes('city') || key.includes('thành')) return 'city-variant-outline';
    if (key.includes('camp') || key.includes('cắm')) return 'tent';
    return 'shape-outline';
  };

  const [active, setActive] = useState<CategoryId>(initialActiveId);

  const setCategory = (id: CategoryId) => {
    setActive(id);
    onChange?.(id);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
      {categories.map(({ id, label }) => {
        const isActive = id === active;
        return (
          <Pressable
            key={id}
            style={({ pressed, hovered }) => [
              styles.catItem,
              isActive && styles.catItemActive,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.02 }], opacity: 0.97 } : null,
              pressed ? { opacity: 0.9, transform: [{ scale: 0.99 }] } : null,
            ]}
            onPress={() => setCategory(id)}
            accessibilityRole="button"
          >
            <View style={[styles.catIconBox, isActive && styles.catIconActive]}>
              <MaterialCommunityIcons
                name={iconForCategory(label) as any}
                size={20}
                color={isActive ? ExploreEaseColors.primary : isDarkMode ? '#94a3b8' : '#64748b'}
              />
            </View>
            <Text style={[styles.catText, isActive && styles.catTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
