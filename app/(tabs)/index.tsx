import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { reminderService } from '@/src/services/reminderService';
import { transcribeAudioUri } from '@/src/services/speechService';
import { getStyles } from '@/src/styles/homeStyles';
import { parseMoneyToNumber } from '@/utils/format';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Animated,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    useWindowDimensions,
    View,
    type ColorValue
} from 'react-native';
import { CategoriesCarousel } from '../../components/home/CategoriesCarousel';
import { FeaturedDestination } from '../../components/home/FeaturedDestination';
import { Header } from '../../components/home/Header';
import { PopularDestinations } from '../../components/home/PopularDestinations';
import { SearchBar } from '../../components/home/SearchBar';
import { TimeOfDayToggle } from '../../components/home/TimeOfDayToggle';
import { YouMightAlsoLike, type YouMightAlsoLikeItem } from '../../components/home/YouMightAlsoLike';
import { ExploreEaseColors } from '../../constants/exploreEaseTheme';
import { destinationService } from '../../src/services/destinationService';
import { presentLocalNotificationAsync } from '../../src/services/localNotificationService';
import { profileService } from '../../src/services/profileService';
import { recommendationService, resolveTimeOfDayPreference, type PersonalizedRecommendationsResult } from '../../src/services/recommendationService';
import { supabase } from '../../src/services/supabase';
import { useRecommendationPreferencesStore } from '../../src/store/useRecommendationPreferencesStore';

type CategoryRow = {
  id: number;
  name: string;
};

type DestinationRow = {
  id: number;
  name: string;
  location: string;
  price?: string | number | null;
  rating?: number | null;
  image_url?: string | null;
  is_featured?: boolean | null;
};

type NotificationRow = {
  id: string | number;
  user_id: string;
  is_read?: boolean | null;
  created_at?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: any;
};

const toRating = (value: DestinationRow['rating']) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 4.7;
};

type VoiceSearchState = 'idle' | 'recording' | 'processing';

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<{ full_name: string | null; nationality?: string | null } | null>(null);
  const { isDark } = useTheme();
  const { formatPricePerPerson } = useCurrency();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [voiceSearchState, setVoiceSearchState] = useState<VoiceSearchState>('idle');
  const timeOfDayPreference = useRecommendationPreferencesStore((s) => s.timeOfDayPreference);
  const setTimeOfDayPreference = useRecommendationPreferencesStore((s) => s.setTimeOfDayPreference);

  const searchRequestIdRef = React.useRef(0);
  const recordingRef = React.useRef<Audio.Recording | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const [loadingPersonalized, setLoadingPersonalized] = useState(true);
  const isLoading = loadingProfile || loadingDestinations || loadingPersonalized;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [featured, setFeatured] = useState<DestinationRow | null>(null);
  const [popular, setPopular] = useState<DestinationRow[]>([]);
  const [personalized, setPersonalized] = useState<PersonalizedRecommendationsResult | null>(null);

  const categoryItems = useMemo(
    () => categories.map((c) => ({ id: String(c.id), label: c.name })),
    [categories]
  );

  const pulse = React.useRef(new Animated.Value(0)).current;

  const effectiveTimeOfDay = useMemo(
    () => resolveTimeOfDayPreference(timeOfDayPreference),
    [timeOfDayPreference]
  );

  const onPressFilters = useCallback(() => {
    // placeholder
  }, []);

  // Lấy styles dựa trên state hiện tại
  const styles = useMemo(() => getStyles({ isDarkMode: isDark, screenWidth }), [isDark, screenWidth]);

  const toDisplayPrice = useCallback(
    (value: DestinationRow['price']) => {
      const amount = parseMoneyToNumber(value);
      if (amount === null) return '';
      return formatPricePerPerson(amount);
    },
    [formatPricePerPerson]
  );

  const toSuggestionPrice = useCallback(
    (value: number | null) => {
      if (value === null) return '—';
      if (value <= 0) return 'FREE';
      return formatPricePerPerson(value);
    },
    [formatPricePerPerson]
  );

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const currentProfile = await profileService.getCurrentProfile();
      setProfile(currentProfile);
    } catch (err: any) {
      console.warn('fetchProfile failed:', err?.message ?? err);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const fetchDestinations = useCallback(async () => {
    setLoadingDestinations(true);
    try {
      const [cats, dests] = await Promise.all([
        destinationService.getCategories() as Promise<CategoryRow[]>,
        destinationService.getDestinations() as Promise<DestinationRow[]>,
      ]);

      setCategories(cats ?? []);

      const featuredDestination = (dests ?? []).find((d) => !!d.is_featured) ?? null;
      setFeatured(featuredDestination);

      setPopular(dests ?? []);
    } catch (err: any) {
      console.warn('fetchDestinations failed:', err?.message ?? err);
      setCategories([]);
      setFeatured(null);
      setPopular([]);
    } finally {
      setLoadingDestinations(false);
    }
  }, []);

  const fetchPersonalizedRecommendations = useCallback(async () => {
    setLoadingPersonalized(true);
    try {
      const result = await recommendationService.getPersonalizedRecommendationsForCurrentUser({
        limitDestinations: 8,
        limitEvents: 6,
        timeOfDay: effectiveTimeOfDay,
        respectTimeOfDayWindow: true,
      });

      setPersonalized(result);
    } catch (err: any) {
      console.warn('fetchPersonalizedRecommendations failed:', err?.message ?? err);
      setPersonalized(null);
    } finally {
      setLoadingPersonalized(false);
    }
  }, [effectiveTimeOfDay]);

  const loadData = useCallback(async () => {
    await fetchDestinations();
  }, [fetchDestinations]);

  const handleSearch = useCallback(
    async (text: string) => {
      const requestId = ++searchRequestIdRef.current;

      try {
        if (!text.trim()) {
          await loadData();
          return;
        }

        const results = (await destinationService.searchDestinations(text)) as DestinationRow[];

        if (requestId !== searchRequestIdRef.current) return;

        setPopular(results ?? []);
      } catch (error) {
        console.error('Lỗi tìm kiếm:', error);
      }
    },
    [loadData]
  );

  const onChangeSearchText = useCallback(
    (text: string) => {
      setSearchText(text);
      void handleSearch(text);
    },
    [handleSearch]
  );

  const setRecordingAudioMode = useCallback(async (recordingEnabled: boolean) => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: recordingEnabled,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (voiceSearchState !== 'idle') return;

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please allow microphone access to use voice search.'
        );
        return;
      }

      await setRecordingAudioMode(true);

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setVoiceSearchState('recording');
    } catch (err: any) {
      console.warn('startVoiceRecording failed:', err?.message ?? err);
      recordingRef.current = null;
      setVoiceSearchState('idle');
      setRecordingAudioMode(false).catch(() => {
        // noop
      });
      Alert.alert('Voice Search Unavailable', 'Could not start recording. Please try again.');
    }
  }, [setRecordingAudioMode, voiceSearchState]);

  const stopVoiceRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setVoiceSearchState('idle');
      return;
    }

    setVoiceSearchState('processing');
    recordingRef.current = null;

    let recordingUri: string | null = null;

    try {
      await recording.stopAndUnloadAsync();
      recordingUri = recording.getURI();
    } catch (err: any) {
      console.warn('stopVoiceRecording failed:', err?.message ?? err);
    } finally {
      await setRecordingAudioMode(false).catch(() => {
        // noop
      });
    }

    if (!recordingUri) {
      setVoiceSearchState('idle');
      Alert.alert('Voice Search Failed', 'No audio file was captured. Please try again.');
      return;
    }

    try {
      const transcript = await transcribeAudioUri(recordingUri, {
        languageCode: 'vi-VN',
        alternativeLanguageCodes: ['en-US'],
        maxAlternatives: 1,
      });

      const query = transcript.trim();
      if (!query) {
        Alert.alert('No Speech Detected', 'Please speak clearly and try again.');
        return;
      }

      setSearchText(query);
      await handleSearch(query);
    } catch (err: any) {
      console.warn('voice transcription failed:', err?.message ?? err);
      Alert.alert(
        'Voice Search Failed',
        err?.message ?? 'Unable to transcribe audio. Please check your API key and try again.'
      );
    } finally {
      setVoiceSearchState('idle');
    }
  }, [handleSearch, setRecordingAudioMode]);

  const onPressVoiceSearch = useCallback(() => {
    if (voiceSearchState === 'processing') return;

    if (voiceSearchState === 'recording') {
      void stopVoiceRecordingAndTranscribe();
      return;
    }

    void startVoiceRecording();
  }, [startVoiceRecording, stopVoiceRecordingAndTranscribe, voiceSearchState]);

  const voiceStatusText = useMemo(() => {
    if (voiceSearchState === 'recording') {
      return 'Listening... tap the microphone again to stop.';
    }

    if (voiceSearchState === 'processing') {
      return 'Transcribing your voice...';
    }

    return null;
  }, [voiceSearchState]);

  const fetchUnreadNotifications = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('notifications unread fetch error:', error.message);
        setNotifications([]);
        return;
      }

      setNotifications((data ?? []) as NotificationRow[]);
    } catch (err: any) {
      console.warn('fetchUnreadNotifications failed:', err?.message ?? err);
      setNotifications([]);
    }
  }, []);

  const onPressBell = useCallback(() => {
    router.push('/notifications' as any);
  }, []);

  const onPressPersonalizedItem = useCallback((item: YouMightAlsoLikeItem) => {
    if (item.kind === 'event') {
      router.push(`/event/${item.id}` as any);
      return;
    }

    router.push(
      {
        pathname: '/destination/[id]',
        params: {
          id: item.id,
          name: item.title,
          location: item.location,
          price: item.displayPrice,
          rating: typeof item.rating === 'number' ? item.rating.toFixed(1) : '',
          imageUrl: item.imageUrl ?? '',
        },
      } as any
    );
  }, []);

  const refreshPendingReminders = useCallback(async () => {
    try {
      const count = await reminderService.countPendingRemindersForCurrentUser();
      setPendingRemindersCount(count);
    } catch (err: any) {
      console.warn('refreshPendingReminders failed:', err?.message ?? err);
      setPendingRemindersCount(0);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await Promise.all([fetchProfile(), fetchDestinations()]);
    };

    run().catch(() => {
      // errors already handled in fetchers
    });

    return () => {
      mounted = false;
      void mounted;
    };
  }, [fetchDestinations, fetchProfile]);

  useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      recordingRef.current = null;

      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {
          // noop
        });
      }

      setRecordingAudioMode(false).catch(() => {
        // noop
      });
    };
  }, [setRecordingAudioMode]);

  useEffect(() => {
    void fetchPersonalizedRecommendations();
  }, [fetchPersonalizedRecommendations]);

  useEffect(() => {
    let isActive = true;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        setNotifications([]);
        return;
      }

      await fetchUnreadNotifications(userId);

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isActive) return;

            const next = payload.new as NotificationRow;
            if (next?.is_read === true) return;

            setNotifications((prev) => {
              if (next?.id !== undefined && prev.some((n) => n.id === next.id)) return prev;
              return [next, ...prev];
            });

            void presentLocalNotificationAsync({
              title: next?.title,
              message: next?.message ?? next?.body,
              data: {
                notificationId: String(next?.id ?? ''),
                type: next?.type ?? 'system',
              },
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isActive) return;

            const next = payload.new as NotificationRow;
            if (!next?.id) return;

            setNotifications((prev) => {
              if (next.is_read) {
                return prev.filter((item) => item.id !== next.id);
              }

              const filtered = prev.filter((item) => item.id !== next.id);
              return [next, ...filtered];
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!isActive) return;
            const oldRow = payload.old as NotificationRow;
            if (!oldRow?.id) return;

            setNotifications((prev) => prev.filter((item) => item.id !== oldRow.id));
          }
        )
        .subscribe();
    };

    init().catch((err: any) => {
      console.warn('notifications init failed:', err?.message ?? err);
    });

    return () => {
      isActive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchUnreadNotifications]);

  useEffect(() => {
    let isActive = true;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      await refreshPendingReminders();

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) return;

      channel = supabase
        .channel(`reminders:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'reminders',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (!isActive) return;
            void refreshPendingReminders();
          }
        )
        .subscribe();
    };

    init().catch((err: any) => {
      console.warn('reminders init failed:', err?.message ?? err);
    });

    return () => {
      isActive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refreshPendingReminders]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const displayName = profile?.full_name ?? (loadingProfile ? '...' : '');
  const avatarUrl = displayName
    ? `https://api.dicebear.com/7.x/avataaars/jpg?seed=${encodeURIComponent(displayName)}`
    : undefined;

  const gradientColors: readonly [ColorValue, ColorValue, ColorValue] = isDark
    ? [ExploreEaseColors.background, ExploreEaseColors.background, 'rgba(10,25,41,0.95)']
    : ['#f8fafc', '#f8fafc', 'rgba(248,250,252,0.95)'];

  const blobAnimStyle1 = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.38] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
      },
    ],
  };

  const blobAnimStyle2 = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.32] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.1] }),
      },
    ],
  };

  const popularItems = useMemo(
    () =>
      popular
        .filter((d) => !!d.image_url)
        .slice(0, 12)
        .map((d) => ({
          id: d.id,
          name: d.name,
          location: d.location,
          price: toDisplayPrice(d.price) || '—',
          imageUrl: d.image_url as string,
          rating: toRating(d.rating),
        })),
    [popular, toDisplayPrice]
  );

  const personalizedItems = useMemo<YouMightAlsoLikeItem[]>(
    () =>
      (personalized?.combined ?? []).map((item) => ({
        ...item,
        displayPrice: toSuggestionPrice(item.priceValue),
      })),
    [personalized, toSuggestionPrice]
  );

  const activeTimeOfDay = personalized?.timeOfDay ?? effectiveTimeOfDay;

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainContainer}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Animated background gradient elements */}
      <View style={[styles.bgBlobContainer, { pointerEvents: 'none' }]}>
        <Animated.View style={[styles.bgCircle1, blobAnimStyle1]} />
        <Animated.View style={[styles.bgCircle2, blobAnimStyle2]} />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        {isLoading ? (
          <View style={[styles.loadingIndicator, { pointerEvents: 'none' }]} />
        ) : null}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.pageContent}>
            <Header
              styles={styles}
              name={displayName}
              avatarUrl={avatarUrl}
              isDarkMode={isDark}
              badgeCount={notifications.length + pendingRemindersCount}
              onPressNotifications={onPressBell}
            />

            <SearchBar
              styles={styles}
              isDarkMode={isDark}
              value={searchText}
              onChangeText={onChangeSearchText}
              onPressFilters={onPressFilters}
              onPressVoiceSearch={onPressVoiceSearch}
              disableVoiceSearch={voiceSearchState === 'processing'}
              voiceSearchState={voiceSearchState}
              voiceStatusText={voiceStatusText}
            />

            <CategoriesCarousel
              styles={styles}
              isDarkMode={isDark}
              categories={categoryItems}
              initialActiveId={categoryItems[0]?.id}
            />

            {featured ? (
              <FeaturedDestination
                styles={styles}
                title={featured.name}
                location={featured.location}
                price={toDisplayPrice(featured.price) || '—'}
                rating={toRating(featured.rating)}
                imageUrl={featured.image_url ?? ''}
                onPress={() => {
                  router.push(
                    {
                      pathname: '/destination/[id]',
                      params: {
                        id: String(featured.id),
                        name: featured.name,
                        location: featured.location,
                        price: toDisplayPrice(featured.price) || '—',
                        rating: String(toRating(featured.rating)),
                        imageUrl: featured.image_url ?? '',
                      },
                    } as any
                  );
                }}
              />
            ) : null}

            <TimeOfDayToggle
              value={timeOfDayPreference}
              onChange={setTimeOfDayPreference}
            />

            <YouMightAlsoLike
              items={personalizedItems}
              loading={loadingPersonalized}
              timeOfDay={activeTimeOfDay}
              travelStyle={personalized?.preferences.travelStyle ?? null}
              onPressItem={onPressPersonalizedItem}
            />

            <PopularDestinations
              styles={styles}
              destinations={popularItems}
            />

            <View style={{ height: 48 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}