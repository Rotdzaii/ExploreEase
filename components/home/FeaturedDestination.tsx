import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, MapPin } from 'lucide-react-native';
import React from 'react';
import { ImageBackground, Text, TouchableOpacity, View } from 'react-native';

type FeaturedDestinationProps = {
  styles: any;
  title: string;
  location: string;
  imageUrl: string;
  onPress?: () => void;
};

export function FeaturedDestination({ styles, title, location, imageUrl, onPress }: FeaturedDestinationProps) {
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
            <MapPin size={14} color={'#22d3ee'} />
            <Text style={styles.featuredLoc}>{location}</Text>
          </View>

          <TouchableOpacity style={styles.viewDetailsBtn} onPress={onPress} activeOpacity={0.9}>
            <Text style={styles.viewDetailsText}>View Details</Text>
            <ArrowRight size={16} color={'#0a1929'} />
          </TouchableOpacity>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}
