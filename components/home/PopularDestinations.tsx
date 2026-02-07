import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MapPin } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ImageBackground, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

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
  destinations?: PopularDestination[];
};

export function PopularDestinations({ styles, destinations }: PopularDestinationsProps) {
  const data = useMemo<PopularDestination[]>(
    () =>
      destinations ?? [
        {
          id: 1,
          name: 'Santorini',
          location: 'Greece',
          price: '$1,299',
          imageUrl: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21',
          rating: 4.8,
        },
        {
          id: 2,
          name: 'Maldives Resort',
          location: 'Maldives',
          price: '$1,899',
          imageUrl: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21',
          rating: 4.9,
        },
        {
          id: 3,
          name: 'Swiss Alps',
          location: 'Switzerland',
          price: '$1,599',
          imageUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e',
          rating: 4.7,
        },
        {
          id: 4,
          name: 'Tokyo Nights',
          location: 'Japan',
          price: '$899',
          imageUrl: 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2',
          rating: 4.6,
        },
      ],
    [destinations]
  );

  const [favorites, setFavorites] = useState<number[]>([]);

  const toggleFavorite = (id: number) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id]));
  };

  return (
    <View style={styles.popularSection}>
      <View style={styles.popularHeader}>
        <Text style={styles.popularHeading}>Popular Destinations</Text>
        <Text style={styles.popularSubheading}>Trending places everyone loves</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={Platform.select({ web: { scrollbarWidth: 'none', msOverflowStyle: 'none' } as any })}
      >
        {data.map((destination) => {
          const isFav = favorites.includes(destination.id);
          return (
            <TouchableOpacity key={destination.id} style={styles.popularCard} activeOpacity={0.9}>
              <View style={styles.popularCardInner}>
                <ImageBackground
                  source={{ uri: destination.imageUrl }}
                  style={styles.popularImage}
                  imageStyle={styles.popularImageStyle}
                >
                  <LinearGradient
                    colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.75)']}
                    style={styles.popularGradient}
                  />

                  <TouchableOpacity
                    style={styles.popularFavBtn}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      toggleFavorite(destination.id);
                    }}
                    activeOpacity={0.85}
                  >
                    <Heart
                      size={18}
                      color={isFav ? '#ef4444' : '#ffffff'}
                      fill={isFav ? '#ef4444' : 'transparent'}
                    />
                  </TouchableOpacity>

                  <View style={styles.popularContent}>
                    <View style={styles.popularContentTop}>
                      <Text style={styles.popularTitle}>{destination.name}</Text>
                      <View style={styles.popularLocationRow}>
                        <MapPin size={12} color={'rgba(226,232,240,0.95)'} />
                        <Text style={styles.popularLoc}>{destination.location}</Text>
                      </View>
                    </View>

                    <View style={styles.popularMetaRow}>
                      <Text style={styles.popularPrice}>{destination.price}</Text>
                      <View style={styles.popularRatingBadge}>
                        <Text style={styles.popularRatingText}>⭐ {destination.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                  </View>
                </ImageBackground>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
