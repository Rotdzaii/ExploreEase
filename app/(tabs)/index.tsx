import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  type ColorValue,
  SafeAreaView,
  ScrollView,
  StatusBar,
  View
} from 'react-native';
import { CategoriesCarousel } from '../../components/home/CategoriesCarousel';
import { FeaturedDestination } from '../../components/home/FeaturedDestination';
import { Header } from '../../components/home/Header';
import { PopularDestinations } from '../../components/home/PopularDestinations';
import { SearchBar } from '../../components/home/SearchBar';
import { supabase } from '../../src/services/supabase';
import { getStyles } from './styles'; // Import hàm getStyles mới

export default function HomeScreen() {
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true); // Trạng thái Sáng/Tối
  const [notifications] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');

  const pulse = React.useRef(new Animated.Value(0)).current;

  // Lấy styles dựa trên state hiện tại
  const styles = getStyles(isDarkMode);

  useEffect(() => {
    fetchProfile();
  }, []);

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

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      setProfile(data);
    }
  };

  const gradientColors: readonly [ColorValue, ColorValue, ColorValue] = isDarkMode
    ? ['#0a1929', '#0a1929', 'rgba(10,25,41,0.95)']
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

  const displayName = profile?.full_name || 'Nguyên';
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/jpg?seed=${encodeURIComponent(displayName)}`;

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainContainer}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      {/* Animated background gradient elements */}
      <View pointerEvents="none" style={styles.bgBlobContainer}>
        <Animated.View style={[styles.bgCircle1, blobAnimStyle1]} />
        <Animated.View style={[styles.bgCircle2, blobAnimStyle2]} />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.pageContent}>
            <Header
              styles={styles}
              name={displayName}
              avatarUrl={avatarUrl}
              isDarkMode={isDarkMode}
              onToggleTheme={() => setIsDarkMode(!isDarkMode)}
              hasNotifications={notifications.length > 0}
            />

            <SearchBar
              styles={styles}
              isDarkMode={isDarkMode}
              value={searchText}
              onChangeText={setSearchText}
              onPressFilters={() => {}}
            />

            <CategoriesCarousel styles={styles} isDarkMode={isDarkMode} initialActiveId="beaches" />

            <FeaturedDestination
              styles={styles}
              title="Bali Temples & Rice"
              location="Ubud, Indonesia"
              imageUrl="https://images.unsplash.com/photo-1537996194471-e657df975ab4"
              onPress={() => {}}
            />

            <PopularDestinations styles={styles} />

            <View style={{ height: 48 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}