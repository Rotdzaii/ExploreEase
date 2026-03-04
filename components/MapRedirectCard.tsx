import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';

export type LatLng = { latitude: number; longitude: number };

async function openGoogleMapsDirections(coords: LatLng) {
  const destination = `${coords.latitude},${coords.longitude}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  const deepLink = Platform.select({
    android: `google.navigation:q=${encodeURIComponent(destination)}`,
    ios: `comgooglemaps://?daddr=${encodeURIComponent(destination)}&directionsmode=driving`,
    default: webUrl,
  });

  try {
    if (deepLink) {
      const can = await Linking.canOpenURL(deepLink);
      if (can) {
        await Linking.openURL(deepLink);
        return;
      }
    }

    await Linking.openURL(webUrl);
  } catch (err: any) {
    Alert.alert('Lỗi', err?.message ?? 'Không thể mở Google Maps');
  }
}

export function MapRedirectCard({
  title,
  coords,
  loading,
  hint,
}: {
  title: string;
  coords: LatLng | null;
  loading: boolean;
  hint?: string | null;
}) {
  const onPressDirections = useCallback(async () => {
    if (!coords) return;
    await openGoogleMapsDirections(coords);
  }, [coords]);

  return (
    <BlurView
      intensity={Platform.OS === 'web' ? 16 : 24}
      tint="dark"
      style={{
        borderRadius: 16,
        padding: 10,
        marginTop: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: 220,
          borderRadius: 14,
          overflow: 'hidden',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        {loading ? (
          <ActivityIndicator color={ExploreEaseColors.primary} />
        ) : coords ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
            <MaterialCommunityIcons name="map-marker-radius" size={44} color={ExploreEaseColors.primary} />
            <Text style={{ color: 'white', fontWeight: '900', marginTop: 8 }} numberOfLines={2}>
              {title}
            </Text>
            <Text style={{ color: 'rgba(148,163,184,0.95)', fontWeight: '700', marginTop: 4 }}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          </View>
        ) : (
          <Text style={{ color: 'rgba(148,163,184,0.95)', fontWeight: '700' }}>Không có thông tin vị trí</Text>
        )}
      </View>

      <Pressable
        onPress={onPressDirections}
        disabled={!coords}
        style={({ pressed, hovered }) => [
          {
            height: 44,
            borderRadius: 14,
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: ExploreEaseColors.primary,
            opacity: !coords ? 0.55 : pressed ? 0.86 : (Platform.OS === 'web' && hovered) ? 0.96 : 1,
          },
        ]}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="directions" size={18} color={ExploreEaseColors.background} />
        <Text style={{ color: ExploreEaseColors.background, fontWeight: '900' }}>Chỉ đường</Text>
      </Pressable>

      {hint ? (
        <Text style={{ color: 'rgba(148,163,184,0.95)', fontWeight: '700', marginTop: 10, opacity: 0.85 }}>
          {hint}
        </Text>
      ) : null}
    </BlurView>
  );
}
