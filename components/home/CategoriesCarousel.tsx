import { Building2, Mountain, Tent, Waves } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

type CategoryId = 'mountains' | 'beaches' | 'cities' | 'camping';

type CategoriesCarouselProps = {
  styles: any;
  isDarkMode: boolean;
  initialActiveId?: CategoryId;
  onChange?: (id: CategoryId) => void;
};

export function CategoriesCarousel({
  styles,
  isDarkMode,
  initialActiveId = 'beaches',
  onChange,
}: CategoriesCarouselProps) {
  const categories = useMemo(
    () => [
      { id: 'mountains' as const, label: 'Mountains', Icon: Mountain },
      { id: 'beaches' as const, label: 'Beaches', Icon: Waves },
      { id: 'cities' as const, label: 'Cities', Icon: Building2 },
      { id: 'camping' as const, label: 'Camping', Icon: Tent },
    ],
    []
  );

  const [active, setActive] = useState<CategoryId>(initialActiveId);

  const setCategory = (id: CategoryId) => {
    setActive(id);
    onChange?.(id);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
      {categories.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <TouchableOpacity
            key={id}
            style={[styles.catItem, isActive && styles.catItemActive]}
            onPress={() => setCategory(id)}
            activeOpacity={0.85}
          >
            <View style={[styles.catIconBox, isActive && styles.catIconActive]}>
              <Icon size={20} color={isActive ? '#22d3ee' : isDarkMode ? '#94a3b8' : '#64748b'} />
            </View>
            <Text style={[styles.catText, isActive && styles.catTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
