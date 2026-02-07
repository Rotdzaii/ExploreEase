import { router } from 'expo-router'; //
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../src/services/supabase';

export default function ProfileSetupScreen() {
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Chọn');
  const [travelStyle, setTravelStyle] = useState('solo');

  const handleCompleteSetup = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Sửa lỗi TS: Bảo vệ user null
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        full_name: fullName, 
        age: parseInt(age) || 0, // Đảm bảo không bị NaN
        gender: gender, 
        travel_style: travelStyle 
      })
      .eq('id', user.id);

    if (error) Alert.alert("Lỗi", "Không thể cập nhật hồ sơ");
    else router.push('./interests'); //
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hãy để chúng tôi hiểu thêm về bạn</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Họ và Tên</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="VD: Nguyễn Văn A" />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>Tuổi</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="25" />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Giới tính</Text>
          <TextInput style={styles.input} value={gender} onChangeText={setGender} placeholder="Nam/Nữ" />
        </View>
      </View>

      <Text style={styles.subTitle}>Bạn thường đi du lịch như thế nào?</Text>
      <View style={styles.styleGrid}>
        {['solo', 'family', 'group'].map((style) => (
          <TouchableOpacity 
            key={style}
            style={[styles.styleCard, travelStyle === style && styles.activeCard]}
            onPress={() => setTravelStyle(style)}
          >
            <Text style={[styles.styleText, travelStyle === style && styles.activeText]}>
              {style === 'solo' ? 'Độc hành' : style === 'family' ? 'Gia đình' : 'Theo nhóm'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.nextBtn} onPress={handleCompleteSetup}>
        <Text style={styles.nextBtnText}>Tiếp tục</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#f5f7f8', flexGrow: 1 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  inputGroup: { marginBottom: 20 },
  label: { fontWeight: '600', marginBottom: 8, color: '#49739c' },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row' },
  subTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 20 },
  styleGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  styleCard: { flex: 1, padding: 15, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', marginHorizontal: 5, borderWidth: 2, borderColor: 'transparent' },
  activeCard: { borderColor: '#0d7ff2', backgroundColor: '#eef6ff' },
  styleText: { fontWeight: '600', color: '#49739c' },
  activeText: { color: '#0d7ff2' },
  nextBtn: { backgroundColor: '#0d7ff2', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 40 },
  nextBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
