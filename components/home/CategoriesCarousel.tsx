import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  activeId?: CategoryId;
  initialActiveId?: CategoryId;
  onChange?: (id: CategoryId) => void;
};

const normalizeCategoryLabel = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function CategoriesCarousel({
  styles,
  isDarkMode,
  categories: categoriesProp,
  activeId,
  initialActiveId = 'all',
  onChange,
}: CategoriesCarouselProps) {
  const categories = useMemo<CategoryItem[]>(
    () =>
      categoriesProp ?? [
        { id: 'all', label: 'Tất cả' },
        { id: 'Cuisines', label: 'Ẩm thực 🍜' },
        { id: 'Landmarks', label: 'Tham quan 🏛️' },
        { id: 'Activities', label: 'Hoạt động 🎢' },
      ],
    [categoriesProp]
  );

  const iconForCategory = (label: string) => {
    const key = normalizeCategoryLabel(label);
    if (key.includes('all') || key.includes('tat ca')) return 'view-grid-outline';
    if (key.includes('cuisine') || key.includes('am thuc') || key.includes('food')) return 'silverware-fork-knife';
    if (key.includes('landmark') || key.includes('tham quan') || key.includes('di tich') || key.includes('heritage')) return 'bank-outline';
    if (key.includes('activities') || key.includes('activity') || key.includes('hoat dong') || key.includes('adventure')) return 'run-fast';
    if (key.includes('beach') || key.includes('bien')) return 'waves';
    if (key.includes('mount') || key.includes('nui')) return 'image-filter-hdr';
    if (key.includes('city') || key.includes('thanh')) return 'city-variant-outline';
    if (key.includes('camp') || key.includes('cam trai')) return 'tent';
    return 'shape-outline';
  };

  const [internalActive, setInternalActive] = useState<CategoryId>(initialActiveId);

  const resolvedActive = activeId ?? internalActive;

  useEffect(() => {
    if (typeof activeId !== 'undefined') return;
    setInternalActive(initialActiveId);
  }, [activeId, initialActiveId]);

  useEffect(() => {
    if (!categories.length) return;
    const hasActive = categories.some((item) => item.id === resolvedActive);
    if (hasActive) return;

    const fallbackId = categories[0].id;
    if (typeof activeId === 'undefined') {
      setInternalActive(fallbackId);
    }
    onChange?.(fallbackId);
  }, [activeId, categories, onChange, resolvedActive]);

  const setCategory = useCallback((id: CategoryId) => {
    if (typeof activeId === 'undefined') {
      setInternalActive(id);
    }
    onChange?.(id);
  }, [activeId, onChange]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.catScroll}
      directionalLockEnabled
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
    >
      {categories.map(({ id, label }) => {
        const isActive = id === resolvedActive;
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
