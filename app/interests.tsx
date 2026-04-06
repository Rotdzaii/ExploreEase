import { useI18n } from '@/src/i18n/useI18n';
import { router } from 'expo-router'; //
import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../src/services/supabase';

export default function InterestsScreen() {
  const { t } = useI18n();

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

  // Sửa lỗi TS: Khai báo kiểu string cho id
  const toggleInterest = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter(i => i !== id));
    else setSelected([...selected, id]);
  };

  const handleStartExploring = async () => {
    if (selected.length < 3) {
      Alert.alert(t('common.notification'), t('auth.interests.minSelectionMessage'));
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    // Sửa lỗi TS: Kiểm tra user có tồn tại không trước khi lấy id
    if (!user) {
      Alert.alert(t('auth.profileSetup.errorTitle'), t('auth.interests.errorMissingAuth'));
        return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ interests: selected })
      .eq('id', user.id);

    if (error) Alert.alert(t('auth.profileSetup.errorTitle'), t('auth.interests.errorSaveInterests'));
    else {
        Alert.alert(t('auth.interests.successTitle'), t('auth.interests.successMessage'));
        router.replace('/(tabs)/explore' as any); //
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
        <Text style={styles.startBtnText}>{t('auth.interests.startExploring')}</Text>
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
