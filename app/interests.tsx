import { useI18n } from '@/src/i18n/useI18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router'; //
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../src/services/supabase';

const ONBOARDING_COMPLETED_STORAGE_KEY = 'exploreease.onboarding.completed';

const toInterestArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

export default function InterestsScreen() {
  const { t } = useI18n();
  const searchParams = useLocalSearchParams<{ mode?: string | string[] }>();

  const INTERESTS_DATA = [
    { id: 'Food', label: t('profile.interests.food') },
    { id: 'Culture', label: t('profile.interests.culture') },
    { id: 'Shopping', label: t('profile.interests.shopping') },
    { id: 'Nature', label: t('profile.interests.nature') },
    { id: 'Adventure', label: t('profile.interests.adventure') },
    { id: 'History', label: t('profile.interests.history') },
  ];

  // Sửa lỗi TS: Khai báo kiểu string[] cho mảng selected
  const [selected, setSelected] = useState<string[]>([]);
  const modeParam = useMemo(() => {
    const raw = searchParams.mode;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [searchParams.mode]);
  const [isEditMode, setIsEditMode] = useState(modeParam === 'edit');

  const submitLabel = useMemo(
    () => (isEditMode ? `${t('profile.edit')} ${t('profile.interests.title')}` : t('auth.interests.startExploring')),
    [isEditMode, t]
  );

  React.useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      try {
        if (modeParam === 'edit') {
          setIsEditMode(true);
        } else {
          const onboardingCompleted = await AsyncStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY);
          if (!alive) return;

          setIsEditMode(onboardingCompleted === 'true');
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!alive || userError || !user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .maybeSingle();

        if (!alive) return;

        const profileInterests = toInterestArray((profile as { interests?: unknown } | null)?.interests);
        if (profileInterests.length > 0) {
          setSelected(profileInterests);
        }
      } catch {
        if (!alive) return;
      }
    };

    void bootstrap();

    return () => {
      alive = false;
    };
  }, [modeParam]);

  // Sửa lỗi TS: Khai báo kiểu string cho id
  const toggleInterest = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const handleStartExploring = async () => {
    if (!isEditMode && selected.length < 3) {
      Alert.alert(t('common.notification'), t('auth.interests.minSelectionMessage'));
      return;
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        Alert.alert(t('auth.profileSetup.errorTitle'), t('auth.interests.errorMissingAuth'));
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ interests: selected })
        .eq('id', user.id);

      if (error) throw error;

      if (isEditMode) {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/profile');
        }
        return;
      }

      try {
        await AsyncStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'true');
      } catch (storageErr: any) {
        const storageMessage = typeof storageErr?.message === 'string' && storageErr.message.trim()
          ? storageErr.message
          : t('auth.interests.errorSaveInterests');

        Alert.alert(t('auth.profileSetup.errorTitle'), storageMessage);
      }

      router.replace('/(tabs)');
    } catch (err: any) {
      const fallbackMessage = t('auth.interests.errorSaveInterests');
      const message = typeof err?.message === 'string' && err.message.trim()
        ? err.message
        : fallbackMessage;

      Alert.alert(t('auth.profileSetup.errorTitle'), message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('auth.interests.titlePrefix')} <Text style={{ color: '#0d7ff2' }}>{t('auth.interests.titleHighlight')}</Text>
      </Text>
      <Text style={styles.subtitle}>{t('auth.interests.subtitle')}</Text>

      <FlatList 
        data={INTERESTS_DATA}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.chip, selected.includes(item.id) && styles.activeChip]}
            onPress={() => toggleInterest(item.id)}
          >
            <Text style={[styles.chipText, selected.includes(item.id) && styles.activeChipText]}>
              {item.label} {selected.includes(item.id) ? '✓' : ''}
            </Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.startBtn} onPress={handleStartExploring}>
        <Text style={styles.startBtnText}>{submitLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 10 },
  subtitle: { color: '#49739c', marginBottom: 30, lineHeight: 22 },
  chip: { flex: 1, height: 60, backgroundColor: '#f5f7f8', margin: 6, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  activeChip: { backgroundColor: '#0d7ff2', borderColor: '#0d7ff2' },
  chipText: { fontWeight: '600', color: '#0d141c' },
  activeChipText: { color: '#fff' },
  startBtn: { backgroundColor: '#0d7ff2', padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 20, boxShadow: '0px 8px 20px rgba(13, 127, 242, 0.30)' },
  startBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});
