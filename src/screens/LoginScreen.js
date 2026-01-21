import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, Alert } from 'react-native';
import { supabase } from '../services/supabase';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isFormValid, setIsFormValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Logic kiểm tra Form (Module 1.1) 
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmailOk = emailRegex.test(email);
    const isPasswordOk = password.length >= 8; // Kiểm tra mật khẩu mạnh 
    
    setIsFormValid(isEmailOk && isPasswordOk);
  }, [email, password]);

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert("Lỗi", "Thông tin đăng nhập không chính xác");
    else Alert.alert("Thành công", "Chào mừng bạn trở lại!");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Banner Hình ảnh */}
      <View style={styles.headerImage}>
        <Image 
          source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e' }} 
          style={styles.image} 
        />
        <View style={styles.overlay}>
           <Text style={styles.brandTitle}>ExploreEase</Text>
        </View>
      </View>

      {/* Nội dung Form */}
      <View style={styles.formSection}>
        <Text style={styles.title}>Đăng nhập tài khoản</Text>
        <Text style={styles.subtitle}>Nhập thông tin để truy cập kế hoạch du lịch của bạn</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Địa chỉ Email</Text>
          <TextInput
            style={styles.input}
            placeholder="ten@viethan.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Mật khẩu</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Nhập mật khẩu"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.toggleText}>{showPassword ? "Ẩn" : "Hiện"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity>
            <Text style={styles.forgotText}>Quên mật khẩu? [cite: 24]</Text>
          </TouchableOpacity>
        </View>

        {/* Nút đăng nhập có trạng thái Disabled  */}
        <TouchableOpacity 
          style={[styles.loginBtn, !isFormValid && styles.loginBtnDisabled]} 
          onPress={handleLogin}
          disabled={!isFormValid}
        >
          <Text style={[styles.loginBtnText, !isFormValid && styles.disabledText]}>Đăng nhập</Text>
        </TouchableOpacity>

        <Text style={styles.divider}>Hoặc tiếp tục với</Text>

        {/* Nút Google [cite: 21] */}
        <TouchableOpacity style={styles.googleBtn}>
          <Text style={styles.googleText}>Tiếp tục với Google</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f5f7f8' },
  headerImage: { height: 220, position: 'relative' },
  image: { width: '100%', height: '100%', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  overlay: { position: 'absolute', bottom: 20, left: 20 },
  brandTitle: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  formSection: { padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#0d141c' },
  subtitle: { color: '#49739c', marginBottom: 20 },
  inputGroup: { marginBottom: 15 },
  label: { fontWeight: '600', marginBottom: 5 },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  passwordInput: { flex: 1, padding: 12 },
  toggleText: { paddingHorizontal: 10, color: '#0d7ff2' },
  forgotText: { textAlign: 'right', marginTop: 5, color: '#0d7ff2', fontWeight: '600' },
  loginBtn: { backgroundColor: '#0d7ff2', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  loginBtnDisabled: { backgroundColor: '#e2e8f0' },
  loginBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  disabledText: { color: '#94a3b8' },
  divider: { textAlign: 'center', marginVertical: 15, color: '#94a3b8' },
  googleBtn: { borderWidth: 1, borderColor: '#e2e8f0', padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#fff' },
  googleText: { fontWeight: '600' }
});

export default LoginScreen;