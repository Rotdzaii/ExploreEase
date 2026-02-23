import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    ImageBackground,
    Linking,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useLocation } from '@/hooks/useLocation';
import { calculateAverageRating, destinationService, type ReviewRow } from '@/src/services/destinationService';
import { supabase } from '@/src/services/supabase';
import { formatDistance, getHaversineDistance } from '@/utils/location';
import { BlurView } from 'expo-blur';
import MapView, { Marker } from 'react-native-maps';

type DetailParams = {
  id?: string;
  name?: string;
  location?: string;
  price?: string;
  rating?: string;
  imageUrl?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toNumberOrNull = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  return Number.isFinite(n) ? n : null;
};

const extractCoords = (row: any) => {
  if (!row) return null;
  const latitude =
    toNumberOrNull(row.latitude) ??
    toNumberOrNull(row.lat) ??
    toNumberOrNull(row.Latitude) ??
    toNumberOrNull(row.Lat);
  const longitude =
    toNumberOrNull(row.longitude) ??
    toNumberOrNull(row.lng) ??
    toNumberOrNull(row.long) ??
    toNumberOrNull(row.Longitude) ??
    toNumberOrNull(row.Lng);

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
};

export default function DestinationDetailScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const params = useLocalSearchParams<DetailParams>();

  const scale = useMemo(() => clamp(screenWidth / 390, 0.86, 1.18), [screenWidth]);
  const s = useCallback((value: number) => Math.round(value * scale), [scale]);

  const name = params.name ? String(params.name) : 'Destination';
  const price = params.price ? String(params.price) : '';

  const destinationId = params.id ? String(params.id) : '';

  const { location, errorMsg: locationErrorMsg, isLoading: isLoadingLocation } = useLocation();
  const [destinationCoords, setDestinationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingDestination, setLoadingDestination] = useState(false);

  const ratingFromParams = useMemo(() => {
    const raw = params.rating ? Number(params.rating) : NaN;
    if (Number.isFinite(raw)) return raw;
    return null;
  }, [params.rating]);

  const imageUrl = params.imageUrl
    ? String(params.imageUrl)
    : 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21';

  const headerHeight = Math.round(clamp(screenHeight * 0.42, s(260), s(360)));

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const [isWritingReview, setIsWritingReview] = useState(false);
  const [draftRating, setDraftRating] = useState<number>(5);
  const [draftComment, setDraftComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchReviews = useCallback(async () => {
    if (!destinationId) return;
    setLoadingReviews(true);
    try {
      const data = await destinationService.getReviews(destinationId);
      setReviews(data ?? []);
    } catch (error) {
      console.warn('fetchReviews failed:', error);
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }, [destinationId]);

  const fetchDestinationCoords = useCallback(async () => {
    if (!destinationId) return;
    setLoadingDestination(true);
    try {
      const row = await destinationService.getDestinationById(destinationId);
      setDestinationCoords(extractCoords(row));
    } catch (error) {
      console.warn('fetchDestinationCoords failed:', error);
      setDestinationCoords(null);
    } finally {
      setLoadingDestination(false);
    }
  }, [destinationId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    void fetchDestinationCoords();
  }, [fetchDestinationCoords]);

  useEffect(() => {
    if (!destinationId) return;

    const channel = supabase
      .channel(`reviews:${destinationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews',
          filter: `destination_id=eq.${destinationId}`,
        },
        () => {
          void fetchReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [destinationId, fetchReviews]);

  const averageRating = useMemo(() => calculateAverageRating(reviews, 1), [reviews]);
  const displayRating = averageRating ?? ratingFromParams;

  const distanceText = useMemo(() => {
    if (!location || !destinationCoords) return null;
    const meters = getHaversineDistance(
      location.latitude,
      location.longitude,
      destinationCoords.latitude,
      destinationCoords.longitude
    );
    return formatDistance(meters);
  }, [destinationCoords, location]);

  const onPressDirections = useCallback(async () => {
    if (!destinationCoords) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destinationCoords.latitude},${destinationCoords.longitude}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn('open directions failed:', error);
    }
  }, [destinationCoords]);

  const onPressWriteReview = useCallback(() => {
    setIsWritingReview((prev) => !prev);
  }, []);

  const onSubmitReview = useCallback(async () => {
    if (!destinationId) return;

    const rating = Number(draftRating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;

    setSubmittingReview(true);
    try {
      await destinationService.submitReview({
        destination_id: destinationId,
        rating,
        comment: draftComment.trim() ? draftComment.trim() : null,
      });

      setDraftComment('');
      setDraftRating(5);
      setIsWritingReview(false);
      await fetchReviews();
    } catch (error) {
      console.warn('submitReview failed:', error);
    } finally {
      setSubmittingReview(false);
    }
  }, [destinationId, draftComment, draftRating, fetchReviews]);

  const renderStars = useCallback(
    (value: number, size: number) => (
      <View style={styles.starsRow}>
        {Array.from({ length: 5 }).map((_, idx) => {
          const filled = idx < value;
          return (
            <MaterialCommunityIcons
              key={idx}
              name={filled ? 'star' : 'star-outline'}
              size={size}
              color={ExploreEaseColors.primary}
            />
          );
        })}
      </View>
    ),
    []
  );

  const renderReviewItem = useCallback(
    ({ item }: { item: ReviewRow }) => {
      const reviewerName = item.profiles?.full_name ?? 'Anonymous';
      const avatarUrl = item.profiles?.avatar_url ?? null;

      return (
        <BlurView
          intensity={Platform.OS === 'web' ? 16 : 24}
          tint="dark"
          style={[styles.reviewCard, { borderRadius: s(16), padding: s(14), marginHorizontal: s(16) }]}
        >
          <View style={styles.reviewTopRow}>
            <View style={[styles.avatarWrap, { width: s(40), height: s(40), borderRadius: s(20) }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: s(20) }} />
              ) : (
                <View style={[styles.avatarFallback, { borderRadius: s(20) }]} />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.reviewName, { fontSize: s(14) }]} numberOfLines={1}>
                {reviewerName}
              </Text>
              <View style={styles.reviewStarsRow}>
                {renderStars(Math.round(item.rating), s(14))}
                <Text style={[styles.reviewRatingText, { fontSize: s(12) }]}>{Number(item.rating).toFixed(1)}</Text>
              </View>
            </View>
          </View>

          {item.comment ? (
            <Text style={[styles.reviewComment, { fontSize: s(13), marginTop: s(10) }]}>
              {item.comment}
            </Text>
          ) : null}
        </BlurView>
      );
    },
    [renderStars, s]
  );

  const listHeader = useMemo(() => {
    return (
      <View>
        <View style={[styles.headerImageWrap, { height: headerHeight }]}>
          <ImageBackground source={{ uri: imageUrl }} style={styles.headerImage} imageStyle={styles.headerImageStyle}>
            <LinearGradient
              colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.75)']}
              style={styles.headerGradient}
            />

            <View style={[styles.headerTopRow, { paddingHorizontal: s(16), paddingTop: s(10) }]}
            >
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.iconPill,
                  { width: s(42), height: s(42), borderRadius: s(21) },
                  pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : null,
                ]}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="chevron-left" size={s(24)} color={'white'} />
              </Pressable>
            </View>
          </ImageBackground>
        </View>

        <View style={[styles.floatingCardWrap, { marginTop: -s(36), paddingHorizontal: s(16) }]}>
          <BlurView
            intensity={Platform.OS === 'web' ? 18 : 28}
            tint="dark"
            style={[styles.floatingCard, { borderRadius: s(18), padding: s(16) }]}
          >
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardName, { fontSize: s(18) }]} numberOfLines={2}>
                  {name}
                </Text>
              </View>

              <View style={[styles.ratingBadge, { paddingHorizontal: s(10), paddingVertical: s(6) }]}>
                <MaterialCommunityIcons name="star" size={s(14)} color={ExploreEaseColors.primary} />
                <Text style={[styles.ratingText, { fontSize: s(12) }]}>
                  {displayRating !== null ? displayRating.toFixed(1) : '—'}
                </Text>
              </View>
            </View>

            <View style={[styles.metaRow, { marginTop: s(12) }]}>
              <Text style={[styles.metaLabel, { fontSize: s(11) }]}>Price</Text>
              <Text style={[styles.metaValue, { fontSize: s(16) }]} numberOfLines={1}>
                {price || '$—'}
              </Text>
            </View>
          </BlurView>
        </View>

        <View style={{ paddingHorizontal: s(16), marginTop: s(14) }}>
          <View style={styles.locationHeaderRow}>
            <Text style={[styles.locationTitle, { fontSize: s(18) }]}>Vị trí</Text>
            {isLoadingLocation ? (
              <Text style={[styles.distanceText, { fontSize: s(13) }]}>Đang lấy vị trí...</Text>
            ) : distanceText ? (
              <Text style={[styles.distanceText, { fontSize: s(13) }]}>Cách bạn {distanceText}</Text>
            ) : locationErrorMsg ? (
              <Text style={[styles.distanceText, { fontSize: s(13) }]}>Bật GPS để xem khoảng cách</Text>
            ) : null}
          </View>

          <BlurView
            intensity={Platform.OS === 'web' ? 16 : 24}
            tint="dark"
            style={[styles.mapCard, { borderRadius: s(16), padding: s(10), marginTop: s(10) }]}
          >
            {loadingDestination ? (
              <View style={[styles.mapLoadingRow, { height: s(220), borderRadius: s(14) }]}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
              </View>
            ) : destinationCoords ? (
              <View style={{ height: s(220), borderRadius: s(14), overflow: 'hidden' }}>
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: destinationCoords.latitude,
                    longitude: destinationCoords.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker coordinate={destinationCoords} title={name} />
                </MapView>
              </View>
            ) : (
              <View style={[styles.mapLoadingRow, { height: s(220), borderRadius: s(14) }]}>
                <Text style={[styles.loadingText, { fontSize: s(13) }]}>Không có thông tin vị trí</Text>
              </View>
            )}

            <Pressable
              onPress={onPressDirections}
              disabled={!destinationCoords}
              style={({ pressed, hovered }) => [
                styles.directionsBtn,
                { height: s(44), borderRadius: s(14), marginTop: s(10) },
                (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                pressed ? { opacity: 0.86 } : null,
                !destinationCoords ? { opacity: 0.55 } : null,
              ]}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="directions" size={s(18)} color={ExploreEaseColors.background} />
              <Text style={[styles.directionsText, { fontSize: s(14) }]}>Chỉ đường</Text>
            </Pressable>

            {!!locationErrorMsg && !isLoadingLocation ? (
              <Text style={[styles.loadingText, { fontSize: s(12), marginTop: s(10), opacity: 0.85 }]}>
                {locationErrorMsg}
              </Text>
            ) : null}
          </BlurView>
        </View>

        <View style={{ paddingHorizontal: s(16), marginTop: s(18) }}>
          <View style={styles.reviewsHeaderRow}>
            <Text style={[styles.reviewsTitle, { fontSize: s(18) }]}>Reviews</Text>
            <Pressable
              onPress={onPressWriteReview}
              style={({ pressed, hovered }) => [
                styles.writeReviewBtn,
                { paddingHorizontal: s(12), height: s(36), borderRadius: s(12) },
                (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                pressed ? { opacity: 0.86 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.writeReviewText, { fontSize: s(13) }]}>
                {isWritingReview ? 'Cancel' : 'Write a Review'}
              </Text>
            </Pressable>
          </View>

          {loadingReviews ? (
            <View style={[styles.loadingRow, { marginTop: s(10) }]}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
              <Text style={[styles.loadingText, { fontSize: s(13) }]}>Loading reviews...</Text>
            </View>
          ) : null}

          {isWritingReview ? (
            <BlurView intensity={Platform.OS === 'web' ? 16 : 24} tint="dark" style={[styles.writeReviewCard, { borderRadius: s(16), padding: s(14), marginTop: s(12) }]}>
              <Text style={[styles.inputLabel, { fontSize: s(12) }]}>Your rating</Text>
              <View style={[styles.pickStarsRow, { marginTop: s(8) }]}>
                {Array.from({ length: 5 }).map((_, idx) => {
                  const value = idx + 1;
                  const filled = value <= draftRating;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setDraftRating(value)}
                      style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
                      accessibilityRole="button"
                    >
                      <MaterialCommunityIcons
                        name={filled ? 'star' : 'star-outline'}
                        size={s(22)}
                        color={ExploreEaseColors.primary}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.inputLabel, { fontSize: s(12), marginTop: s(12) }]}>Comment</Text>
              <TextInput
                value={draftComment}
                onChangeText={setDraftComment}
                placeholder="Share your experience..."
                placeholderTextColor={'rgba(148,163,184,0.65)'}
                multiline
                style={[styles.commentInput, { minHeight: s(88), borderRadius: s(14), padding: s(12), fontSize: s(13) }]}
              />

              <Pressable
                onPress={onSubmitReview}
                disabled={submittingReview}
                style={({ pressed, hovered }) => [
                  styles.submitBtn,
                  { height: s(44), borderRadius: s(14), marginTop: s(12) },
                  (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                  pressed ? { opacity: 0.86 } : null,
                  submittingReview ? { opacity: 0.7 } : null,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.submitText, { fontSize: s(14) }]}>
                  {submittingReview ? 'Submitting...' : 'Submit Review'}
                </Text>
              </Pressable>
            </BlurView>
          ) : null}
        </View>

        <View style={{ height: s(16) }} />
      </View>
    );
  }, [
    displayRating,
    distanceText,
    destinationCoords,
    isLoadingLocation,
    locationErrorMsg,
    draftComment,
    draftRating,
    headerHeight,
    imageUrl,
    isWritingReview,
    loadingReviews,
    loadingDestination,
    name,
    onPressWriteReview,
    onPressDirections,
    onSubmitReview,
    price,
    s,
    submittingReview,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.root}>
        <FlatList
          data={reviews}
          renderItem={renderReviewItem}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: s(110), rowGap: s(12) }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
        />

        <View style={[styles.footerWrap, { paddingHorizontal: s(16), paddingBottom: s(16) }]}
        >
          <BlurView
            intensity={Platform.OS === 'web' ? 18 : 28}
            tint="dark"
            style={[styles.footer, { borderRadius: s(16), padding: s(12) }]}
          >
            <Pressable
              onPress={() => {
                // scaffold: booking flow to be implemented
              }}
              style={({ pressed, hovered }) => [
                styles.bookBtn,
                { height: s(52), borderRadius: s(14) },
                (Platform.OS === 'web' && hovered) ? { opacity: 0.96 } : null,
                pressed ? { opacity: 0.86, transform: [{ scale: 0.99 }] } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.bookBtnText, { fontSize: s(16) }]}>Book Now</Text>
            </Pressable>
          </BlurView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ExploreEaseColors.background },
  root: { flex: 1, backgroundColor: ExploreEaseColors.background },

  headerImageWrap: { width: '100%' },
  headerImage: { flex: 1 },
  headerImageStyle: { resizeMode: 'cover' },
  headerGradient: { ...StyleSheet.absoluteFillObject },

  headerTopRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPill: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  floatingCardWrap: { width: '100%' },
  floatingCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardName: { color: 'white', fontWeight: '900' },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 211, 238, 0.20)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.26)',
  },
  ratingText: { color: ExploreEaseColors.primary, fontWeight: '800' },

  metaRow: {},
  metaLabel: { color: 'rgba(148,163,184,0.95)', fontWeight: '800' },
  metaValue: { color: 'white', fontWeight: '900', marginTop: 6 },

  locationHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  locationTitle: { color: 'white', fontWeight: '900' },
  distanceText: { color: 'rgba(148,163,184,0.95)', fontWeight: '800' },
  mapCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  mapLoadingRow: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: ExploreEaseColors.primary,
  },
  directionsText: { color: ExploreEaseColors.background, fontWeight: '900' },

  reviewsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewsTitle: { color: 'white', fontWeight: '900' },
  writeReviewBtn: {
    backgroundColor: 'rgba(34, 211, 238, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  writeReviewText: { color: ExploreEaseColors.primary, fontWeight: '900' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: 'rgba(148,163,184,0.95)', fontWeight: '700' },

  writeReviewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  inputLabel: { color: 'rgba(148,163,184,0.95)', fontWeight: '900' },
  pickStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: {
    marginTop: 8,
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: ExploreEaseColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: { color: ExploreEaseColors.background, fontWeight: '900' },

  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatarFallback: { flex: 1, backgroundColor: 'rgba(148,163,184,0.18)' },
  reviewName: { color: 'white', fontWeight: '900' },
  reviewStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reviewRatingText: { color: 'rgba(148,163,184,0.95)', fontWeight: '800' },
  reviewComment: { color: 'rgba(226,232,240,0.95)', fontWeight: '600', lineHeight: 18 },

  footerWrap: {
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  bookBtn: {
    backgroundColor: ExploreEaseColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookBtnText: {
    color: ExploreEaseColors.background,
    fontWeight: '900',
  },
});
