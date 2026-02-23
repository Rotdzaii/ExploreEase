import type { RealtimeChannel } from '@supabase/supabase-js';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  type ColorValue,
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
import { supabase } from '../../src/services/supabase';
import { getStyles } from './styles';

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

const CURRENT_USER_ID = '8d0faeae-769d-4af7-be4d-a47acff0c000';

const toDisplayPrice = (value: DestinationRow['price']) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return `$${value.toLocaleString()} / person`;

  const text = String(value).trim();
  if (!text) return '';
  if (text.includes('/')) return text;
  if (text.startsWith('$')) return `${text} / person`;
  return text;
};

const toRating = (value: DestinationRow['rating']) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 4.7;
};

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true); // Trạng thái Sáng/Tối
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
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

  const onToggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const onPressFilters = useCallback(() => {
    // placeholder
  }, []);

  // Lấy styles dựa trên state hiện tại
  const styles = useMemo(() => getStyles({ isDarkMode, screenWidth }), [isDarkMode, screenWidth]);

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();

      if (userErr) {
        console.warn('supabase.auth.getUser error:', userErr.message);
        return;
      }

      const user = userRes.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('profiles select error:', error.message);
        return;
      }

      setProfile(data);
    } catch (err: any) {
      console.warn('fetchProfile failed (network/premature close):', err?.message ?? err);
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

  const fetchUnreadNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', CURRENT_USER_ID)
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

  const markAllNotificationsRead = useCallback(async () => {
    const prev = notifications;
    setNotifications([]);

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', CURRENT_USER_ID)
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
    await markAllNotificationsRead();
  }, [markAllNotificationsRead]);

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
      await fetchUnreadNotifications();

      channel = supabase
        .channel(`notifications:${CURRENT_USER_ID}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${CURRENT_USER_ID}`,
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
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const displayName = profile?.full_name ?? (loadingProfile ? '...' : '');
  const avatarUrl = displayName
    ? `https://api.dicebear.com/7.x/avataaars/jpg?seed=${encodeURIComponent(displayName)}`
    : undefined;

  const gradientColors: readonly [ColorValue, ColorValue, ColorValue] = isDarkMode
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
          price: toDisplayPrice(d.price) || '$—',
          imageUrl: d.image_url as string,
          rating: toRating(d.rating),
        })),
    [popular]
  );

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainContainer}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      {/* Animated background gradient elements */}
      <View pointerEvents="none" style={styles.bgBlobContainer}>
        <Animated.View style={[styles.bgCircle1, blobAnimStyle1]} />
        <Animated.View style={[styles.bgCircle2, blobAnimStyle2]} />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        {isLoading ? (
          <View pointerEvents="none" style={styles.loadingIndicator} />
        ) : null}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.pageContent}>
            <Header
              styles={styles}
              name={displayName}
              avatarUrl={avatarUrl}
              isDarkMode={isDarkMode}
              onToggleTheme={onToggleTheme}
              hasNotifications={notifications.length > 0}
              onPressNotifications={onPressBell}
            />

            <SearchBar
              styles={styles}
              isDarkMode={isDarkMode}
              value={searchText}
              onChangeText={onChangeSearchText}
              onPressFilters={onPressFilters}
            />

            <CategoriesCarousel
              styles={styles}
              isDarkMode={isDarkMode}
              categories={categoryItems}
              initialActiveId={categoryItems[0]?.id}
            />

            {featured ? (
              <FeaturedDestination
                styles={styles}
                title={featured.name}
                location={featured.location}
                price={toDisplayPrice(featured.price) || '$—'}
                rating={toRating(featured.rating)}
                imageUrl={featured.image_url ?? ''}
                onPress={() => {}}
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