import { useCurrency } from '@/src/context/currency';
import { useTheme } from '@/src/context/theme';
import { reminderService } from '@/src/services/reminderService';
import { getStyles } from '@/src/styles/homeStyles';
import { parseMoneyToNumber } from '@/utils/format';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Animated,
    type ColorValue,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    useWindowDimensions,
    View
} from 'react-native';
import { CategoriesCarousel } from '../../components/home/CategoriesCarousel';
import { FeaturedDestination } from '../../components/home/FeaturedDestination';
import { Header } from '../../components/home/Header';
import { PopularDestinations } from '../../components/home/PopularDestinations';
import { SearchBar } from '../../components/home/SearchBar';
import { ExploreEaseColors } from '../../constants/exploreEaseTheme';
import { destinationService } from '../../src/services/destinationService';
import { profileService } from '../../src/services/profileService';
import { supabase } from '../../src/services/supabase';

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
  body?: string | null;
  [key: string]: any;
};

const toRating = (value: DestinationRow['rating']) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 4.7;
};

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<{ full_name: string | null; nationality?: string | null } | null>(null);
  const { isDark } = useTheme();
  const { formatPricePerPerson } = useCurrency();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);
  const [searchText, setSearchText] = useState('');

  const searchRequestIdRef = React.useRef(0);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const isLoading = loadingProfile || loadingDestinations;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [featured, setFeatured] = useState<DestinationRow | null>(null);
  const [popular, setPopular] = useState<DestinationRow[]>([]);

  const categoryItems = useMemo(
    () => categories.map((c) => ({ id: String(c.id), label: c.name })),
    [categories]
  );

  const pulse = React.useRef(new Animated.Value(0)).current;

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

  const markAllNotificationsRead = useCallback(async (userId: string) => {
    const prev = notifications;
    setNotifications([]);

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.warn('markAllNotificationsRead error:', error.message);
        setNotifications(prev);
      }
    } catch (err: any) {
      console.warn('markAllNotificationsRead failed:', err?.message ?? err);
      setNotifications(prev);
    }
  }, [notifications]);

  const onPressBell = useCallback(async () => {
    router.push('/notifications' as any);

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (userId) await markAllNotificationsRead(userId);
  }, [markAllNotificationsRead]);

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