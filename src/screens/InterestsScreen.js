import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { supabase } from '../services/supabase';

const INTERESTS_DATA = [
  { id: 'Food', label: 'Ẩm thực' },
  { id: 'Culture', label: 'Văn hóa' },
  { id: 'Shopping', label: 'Mua sắm' },
  { id: 'Nature', label: 'Thiên nhiên' },
  { id: 'Adventure', label: 'Phiêu lưu' },
  { id: 'History', label: 'Lịch sử' }
];

const InterestsScreen = () => {
  const [selected, setSelected] = useState([]);

  const toggleInterest = (id) => {
    if (selected.includes(id)) setSelected(selected.filter(i => i !== id));
    else setSelected([...selected, id]);
  };

  const handleStartExploring = async () => {
    if (selected.length < 3) {
      Alert.alert("Thông báo", "Vui lòng chọn ít nhất 3 sở thích để chúng tôi gợi ý tốt hơn!");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('profiles')
      .update({ interests: selected })
      .eq('id', user.id);

    if (error) Alert.alert("Lỗi", "Không thể lưu sở thích");
    else Alert.alert("Thành công", "Bắt đầu khám phá ExploreEase ngay thôi!");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hãy cho chúng tôi biết bạn <Text style={{color: '#0d7ff2'}}>thích gì</Text></Text>
      <Text style={styles.subtitle}>Chúng tôi sẽ tùy chỉnh bảng tin ExploreEase dựa trên lựa chọn của bạn.</Text>

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
        <Text style={styles.startBtnText}>Bắt đầu khám phá</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 10 },
  subtitle: { color: '#49739c', marginBottom: 30, lineHeight: 22 },
  chip: { flex: 1, height: 60, backgroundColor: '#f5f7f8', margin: 6, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  activeChip: { backgroundColor: '#0d7ff2', borderColor: '#0d7ff2' },
  chipText: { fontWeight: '600', color: '#0d141c' },
  activeChipText: { color: '#fff' },
  startBtn: { backgroundColor: '#0d7ff2', padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 20, shadowColor: '#0d7ff2', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  startBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});

export default InterestsScreen;