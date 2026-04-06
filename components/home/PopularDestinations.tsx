import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    FlatList,
    ImageBackground,
    Platform,
    Pressable,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

import { ExploreEaseColors } from '../../constants/exploreEaseTheme';
import { useI18n } from '../../src/i18n/useI18n';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type PopularDestination = {
  id: number;
  name: string;
  location: string;
  price: string;
  imageUrl: string;
  rating: number;
};

type PopularDestinationsProps = {
  styles: any;
  destinations: PopularDestination[];
};

export function PopularDestinations({ styles, destinations }: PopularDestinationsProps) {
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();

  const scale = clamp(screenWidth / 390, 0.86, 1.18);
  const s = (value: number) => Math.round(value * scale);
  const padX = Math.round(clamp(screenWidth * 0.04, 14, 22));
  const gap = Math.round(clamp(screenWidth * 0.03, 10, 16));

  const columns = screenWidth < 420 ? 1 : screenWidth < 900 ? 2 : 3;
  const availableWidth = Math.max(0, screenWidth - padX * 2);
  const cardWidth = Math.floor((availableWidth - gap * (columns - 1)) / columns);
  const cardHeight = Math.round(clamp(cardWidth * 0.9, s(220), s(300)));

  const ratingIconSize = s(14);
  const favIconSize = s(18);
  const locationIconSize = s(12);

  const data = useMemo<PopularDestination[]>(() => destinations, [destinations]);

  const [favorites, setFavorites] = useState<number[]>([]);

  const toggleFavorite = (id: number) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id]));
  };

  const onPressDestination = useCallback((destination: PopularDestination) => {
    router.push(
      {
        pathname: '/destination/[id]',
        params: {
          id: String(destination.id),
          name: destination.name,
          location: destination.location,
          price: destination.price,
          rating: destination.rating.toFixed(1),
          imageUrl: destination.imageUrl,
        },
      } as any
    );
  }, []);

  const renderItem = useCallback(
    ({ item: destination }: { item: PopularDestination }) => {
      const isFav = favorites.includes(destination.id);

      return (
        <View style={[styles.popularCard, { width: cardWidth, height: cardHeight, marginRight: 0 }]}>
          <Pressable
            style={({ pressed, hovered }) => [
              styles.popularCardInner,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.01 }], opacity: 0.98 } : null,
              pressed ? { opacity: 0.92, transform: [{ scale: 0.995 }] } : null,
            ]}
            onPress={() => onPressDestination(destination)}
            accessibilityRole="button"
          >
            <ImageBackground
              source={{ uri: destination.imageUrl }}
              style={styles.popularImage}
              imageStyle={styles.popularImageStyle}
            >
              <LinearGradient
                colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.75)']}
                style={styles.popularGradient}
              />

              <View style={styles.popularContent}>
                <View style={styles.popularContentTop}>
                  <Text style={styles.popularTitle}>{destination.name}</Text>
                  <View style={styles.popularLocationRow}>
                    <MaterialCommunityIcons
                      name="map-marker"
                      size={locationIconSize}
                      color={'rgba(226,232,240,0.95)'}
                    />
                    <Text style={styles.popularLoc}>{destination.location}</Text>
                  </View>
                </View>

                <View style={styles.popularMetaRow}>
                  <Text style={styles.popularPrice}>{destination.price}</Text>
                  <View style={styles.popularRatingBadge}>
                    <MaterialCommunityIcons name="star" size={ratingIconSize} color={ExploreEaseColors.primary} />
                    <Text style={styles.popularRatingText}>{destination.rating.toFixed(1)}</Text>
                  </View>
                </View>
              </View>
            </ImageBackground>
          </Pressable>

          {Platform.OS === 'web' ? (
            <View
              // On web, avoid nested <button> hydration errors by NOT using Pressable here.
              // We still keep it interactive via click + keyboard.
              {...({
                role: 'button',
                tabIndex: 0,
                onClick: (e: any) => {
                  e?.stopPropagation?.();
                  toggleFavorite(destination.id);
                },
                onKeyDown: (e: any) => {
                  const key = e?.key;
                  if (key === 'Enter' || key === ' ') {
                    e?.preventDefault?.();
                    e?.stopPropagation?.();
                    toggleFavorite(destination.id);
                  }
                },
              } as any)}
              style={styles.popularFavBtn}
              accessibilityLabel={isFav ? t('home.unfavorite') : t('home.favorite')}
            >
              <MaterialCommunityIcons
                name={isFav ? 'heart' : 'heart-outline'}
                size={favIconSize}
                color={isFav ? '#ef4444' : '#ffffff'}
              />
            </View>
          ) : (
            <Pressable
              style={({ pressed, hovered }) => [
                styles.popularFavBtn,
                (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.03 }], opacity: 0.98 } : null,
                pressed ? { opacity: 0.9, transform: [{ scale: 0.98 }] } : null,
              ]}
              onPress={() => toggleFavorite(destination.id)}
              accessibilityRole="button"
              accessibilityLabel={isFav ? t('home.unfavorite') : t('home.favorite')}
            >
              <MaterialCommunityIcons
                name={isFav ? 'heart' : 'heart-outline'}
                size={favIconSize}
                color={isFav ? '#ef4444' : '#ffffff'}
              />
            </Pressable>
          )}
        </View>
      );
    },
    [
      cardHeight,
      cardWidth,
      favIconSize,
      favorites,
      locationIconSize,
      onPressDestination,
      ratingIconSize,
      styles,
      t,
    ]
  );

  return (
    <View style={styles.popularSection}>
      <View style={styles.popularHeader}>
        <Text style={styles.popularHeading}>{t('home.popularDestinations')}</Text>
        <Text style={styles.popularSubheading}>{t('home.popularSubtitle')}</Text>
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        numColumns={columns}
        key={columns}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        removeClippedSubviews={Platform.OS !== 'web'}
        initialNumToRender={Math.min(12, columns * 4)}
        maxToRenderPerBatch={Math.min(12, columns * 4)}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        contentContainerStyle={{ rowGap: gap }}
        columnWrapperStyle={columns > 1 ? ({ columnGap: gap } as any) : undefined}
      />
    </View>
  );
}
