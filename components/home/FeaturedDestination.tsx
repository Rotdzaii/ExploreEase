import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ImageBackground, Platform, Pressable, Text, View } from 'react-native';

import { ExploreEaseColors } from '../../constants/exploreEaseTheme';

type FeaturedDestinationProps = {
  styles: any;
  title: string;
  location: string;
  price?: string;
  rating?: number;
  imageUrl: string;
  onPress?: () => void;
};

export function FeaturedDestination({
  styles,
  title,
  location,
  price,
  rating,
  imageUrl,
  onPress,
}: FeaturedDestinationProps) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Featured Destination</Text>
      <ImageBackground source={{ uri: imageUrl }} style={styles.featuredCard} imageStyle={styles.featuredImage}>
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.42)']}
          style={styles.featuredGradient}
        >
          <Text style={styles.featuredTitle}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={ExploreEaseColors.primary} />
            <Text style={styles.featuredLoc}>{location}</Text>
          </View>

          {price || typeof rating === 'number' ? (
            <View style={styles.featuredMetaRow}>
              {price ? <Text style={styles.featuredPrice}>{price}</Text> : <View />}
              {typeof rating === 'number' ? (
                <View style={styles.featuredRatingBadge}>
                  <MaterialCommunityIcons name="star" size={14} color={ExploreEaseColors.primary} />
                  <Text style={styles.featuredRatingText}>{rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={({ pressed, hovered }) => [
              styles.viewDetailsBtn,
              (Platform.OS === 'web' && hovered) ? { transform: [{ scale: 1.02 }], opacity: 0.97 } : null,
              pressed ? { opacity: 0.9, transform: [{ scale: 0.99 }] } : null,
            ]}
            onPress={onPress}
            accessibilityRole="button"
          >
            <Text style={styles.viewDetailsText}>View Details</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={ExploreEaseColors.background} />
          </Pressable>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}
