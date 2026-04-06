import { InterestSelection } from '@/components/InterestSelection';
import { useI18n } from '@/src/i18n/useI18n';
import { profileService } from '@/src/services/profileService';
import { getThemeVars } from '@/utils/themeVars';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    Text,
    View,
} from 'react-native';

export default function OnboardingScreen() {
  const { t } = useI18n();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { primary, background } = getThemeVars();

  const pulse = useRef(new Animated.Value(0)).current;

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

  const blobStyle1 = useMemo(
    () => ({
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.34] }),
      transform: [
        { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
      ],
    }),
    [pulse]
  );

  const blobStyle2 = useMemo(
    () => ({
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.30] }),
      transform: [
        { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) },
      ],
    }),
    [pulse]
  );

  const handleSelectionChange = (interests: string[]) => {
    setSelectedInterests(interests);
  };

  const handleContinue = async () => {
    if (selectedInterests.length === 0) return;
    if (saving) return;

    try {
      setSaving(true);
      await profileService.updateInterests(selectedInterests);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert(t('auth.profileSetup.errorTitle'), err?.message ?? t('auth.interests.errorSaveInterests'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1">
      <LinearGradient
        colors={[background, background, 'rgba(10,25,41,0.95)']}
        className="absolute inset-0"
      />

      <View className="absolute inset-0">
        <Animated.View
          style={[
            blobStyle1,
            {
              position: 'absolute',
              top: -160,
              right: -160,
              width: 380,
              height: 380,
              borderRadius: 999,
              backgroundColor: 'rgba(34,211,238,0.18)',
            },
          ]}
        />
        <Animated.View
          style={[
            blobStyle2,
            {
              position: 'absolute',
              bottom: -170,
              left: -170,
              width: 420,
              height: 420,
              borderRadius: 999,
              backgroundColor: 'rgba(34,211,238,0.12)',
            },
          ]}
        />
      </View>

      <SafeAreaView className="flex-1">
        <BlurView
          intensity={Platform.OS === 'web' ? 12 : 22}
          tint="dark"
          style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}
        >
          <View className="px-4 py-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="p-2 rounded-xl bg-white/10 border border-white/10">
                <Feather name="globe" size={18} color={primary} />
              </View>
              <Text className="text-white text-lg font-bold">{t('common.appName')}</Text>
            </View>
            <Text className="text-white/60 text-xs">{t('auth.onboarding.step')}</Text>
          </View>
        </BlurView>

        <ScrollView contentContainerStyle={{ paddingTop: 24, paddingBottom: 24 }}>
          <InterestSelection selected={selectedInterests} onSelectionChange={handleSelectionChange} />
        </ScrollView>

        {selectedInterests.length > 0 ? (
          <View className="absolute left-0 right-0 bottom-0">
            <LinearGradient
              colors={['transparent', 'rgba(10,25,41,0.85)', background]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              className="px-4 pt-6 pb-4"
            >
              <Pressable
                onPress={handleContinue}
                disabled={saving}
                className="w-full flex-row items-center justify-center gap-2 rounded-xl py-4"
                style={{ backgroundColor: primary, opacity: saving ? 0.7 : 1 }}
                accessibilityRole="button"
              >
                <Text className="text-black font-semibold">{t('auth.profileSetup.continue')}</Text>
                <Feather name="arrow-right" size={18} color="black" />
              </Pressable>
            </LinearGradient>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
