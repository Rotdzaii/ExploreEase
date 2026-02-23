import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
// Đảm bảo đường dẫn này đúng với file supabase.ts trong src của cậu
import { supabase } from '../src/services/supabase';

const isWeb = Platform.OS === 'web';

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const [isDark, setIsDark] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // States quản lý dữ liệu
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; fullName?: string }>({});
  const [loading, setLoading] = useState(false);

  const isLargeScreen = width > 1024;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const authPanelWidth = isLargeScreen ? 1200 * 0.4 : width - 40;

  // --- CHECKLIST MẬT KHẨU REAL-TIME ---
  const passwordCriteria = useMemo(() => ({
    minChar: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[@$!%*?&]/.test(password),
  }), [password]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: !isWeb }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: !isWeb }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: !isWeb }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: !isWeb }),
    ]).start();
  };

  const validate = () => {
    let newErrors: any = {};
    if (!isLogin && !fullName) newErrors.fullName = 'Vui lòng nhập tên';
    if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email không hợp lệ';
    
    const isPassValid = Object.values(passwordCriteria).every(Boolean);
    if (!isPassValid && !isLogin) {
      newErrors.password = 'Mật khẩu chưa đạt chuẩn bảo mật';
    } else if (isLogin && password.length < 6) {
      newErrors.password = 'Mật khẩu tối thiểu 6 ký tự';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      triggerShake();
      return false;
    }
    return true;
  };

  const handleAuthAction = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const { error } = isLogin 
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ 
            email, 
            password, 
            options: { data: { full_name: fullName } } 
          });

      if (error) {
        triggerShake();
        Alert.alert('Lỗi hệ thống', error.message);
      } else {
        if (isLogin) {
          router.replace('/(tabs)');
        } else {
          Alert.alert('Thành công', 'Cậu hãy kiểm tra Gmail để xác thực tài khoản nhé!');
          toggleAuthMode(true);
        }
      }
    } catch {
      Alert.alert('Lỗi kết nối', 'Không thể kết nối tới Supabase.');
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthMode = (toLogin: boolean) => {
    setIsLogin(toLogin);
    setErrors({});
    Animated.timing(slideAnim, {
      toValue: toLogin ? 0 : -authPanelWidth,
      duration: 400,
      useNativeDriver: !isWeb,
    }).start();
  };

  return (
    <ImageBackground 
      source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e' }} 
      style={styles.backgroundImage}
    >
      <StatusBar barStyle="light-content" />
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(10, 25, 41, 0.7)' : 'rgba(255, 255, 255, 0.1)' }]}>
        
        <SafeAreaView style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View style={styles.logoCapsule}>
              <MaterialCommunityIcons name="earth" size={24} color={ExploreEaseColors.primary} />
              <Text style={styles.logoText}>EXPLOREEASE</Text>
            </View>
            <TouchableOpacity onPress={() => setIsDark(!isDark)}>
              <BlurView intensity={30} tint="dark" style={styles.themeToggle}>
                <MaterialCommunityIcons name={isDark ? "weather-sunny" : "weather-night"} size={22} color={isDark ? "#fde047" : "white"} />
              </BlurView>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Animated.View style={[styles.mainCard, { flexDirection: isLargeScreen ? 'row' : 'column', transform: [{ translateX: shakeAnim }] }]}>
              
              {isLargeScreen && (
                <BlurView intensity={20} tint="dark" style={styles.leftPanel}>
                  <Text style={styles.mainHeading}>
                    Explore the World with {'\n'}
                    <Text style={{ color: ExploreEaseColors.primary }}>Ease</Text>
                  </Text>
                  <View style={styles.adSpace}>
                    <MaterialCommunityIcons name="image-filter-hdr" size={40} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.adTitle}>SPONSORED DESTINATION</Text>
                  </View>
                </BlurView>
              )}

              <View style={styles.authContainer}>
                <BlurView intensity={isDark ? 60 : 90} tint={isDark ? 'dark' : 'light'} style={styles.rightPanel}>
                  <Animated.View style={[styles.slidingWrapper, { width: authPanelWidth * 2, transform: [{ translateX: slideAnim }] }]}>
                    
                    {/* --- LOGIN FORM --- */}
                    <View style={{ width: authPanelWidth, padding: isLargeScreen ? 50 : 30 }}>
                      <Text style={[styles.welcomeTitle, { color: isDark ? 'white' : '#0f172a' }]}>Welcome Back</Text>
                      <AuthInput label="Email" icon="email-outline" isDark={isDark} placeholder="you@example.com" value={email} onChangeText={setEmail} error={errors.email} />
                      <AuthInput label="Password" icon="lock-outline" isDark={isDark} secure={!showPassword} placeholder="••••••••" value={password} onChangeText={setPassword} isPassword onTogglePassword={() => setShowPassword(!showPassword)} showPassword={showPassword} error={errors.password} />
                      <TouchableOpacity onPress={handleAuthAction} disabled={loading} style={styles.signInButton}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.signInText}>Sign In</Text>}
                      </TouchableOpacity>
                      <SocialLoginArea isDark={isDark} />
                      <TouchableOpacity onPress={() => toggleAuthMode(false)} style={styles.switchMode}>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Don&apos;t have an account? <Text style={styles.linkText}>Sign Up</Text></Text>
                      </TouchableOpacity>
                    </View>

                    {/* --- SIGN UP FORM --- */}
                    <View style={{ width: authPanelWidth, padding: isLargeScreen ? 50 : 30 }}>
                      <Text style={[styles.welcomeTitle, { color: isDark ? 'white' : '#0f172a' }]}>Create Account</Text>
                      <AuthInput label="Full Name" icon="account-outline" isDark={isDark} placeholder="Nguyên đẹp trai" value={fullName} onChangeText={setFullName} error={errors.fullName} />
                      <AuthInput label="Email" icon="email-outline" isDark={isDark} placeholder="you@example.com" value={email} onChangeText={setEmail} error={errors.email} />
                      <AuthInput label="Password" icon="lock-outline" isDark={isDark} secure={!showPassword} placeholder="••••••••" value={password} onChangeText={setPassword} isPassword onTogglePassword={() => setShowPassword(!showPassword)} showPassword={showPassword} />
                      
                      <View style={styles.checklistContainer}>
                        <CheckItem label="Ít nhất 8 ký tự" met={passwordCriteria.minChar} isDark={isDark} />
                        <CheckItem label="Chữ hoa & Chữ thường" met={passwordCriteria.hasUpper && passwordCriteria.hasLower} isDark={isDark} />
                        <CheckItem label="Có ít nhất 1 con số" met={passwordCriteria.hasNumber} isDark={isDark} />
                        <CheckItem label="Ký tự đặc biệt (@$!%...)" met={passwordCriteria.hasSpecial} isDark={isDark} />
                      </View>

                      <TouchableOpacity onPress={handleAuthAction} disabled={loading} style={[styles.signInButton, { backgroundColor: '#059669' }]}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.signInText}>Create Account</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleAuthMode(true)} style={styles.switchMode}>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Already have account? <Text style={styles.linkText}>Login</Text></Text>
                      </TouchableOpacity>
                    </View>

                  </Animated.View>
                </BlurView>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

// --- HELPER COMPONENTS ---
function CheckItem({ label, met, isDark }: any) {
  return (
    <View style={styles.checkItem}>
      <MaterialCommunityIcons name={met ? "check-circle" : "close-circle"} size={14} color={met ? "#10b981" : "#ef4444"} />
      <Text style={[styles.checkText, { color: met ? (isDark ? '#a7f3d0' : '#065f46') : (isDark ? '#fca5a5' : '#991b1b') }]}>{label}</Text>
    </View>
  );
}

function AuthInput({ label, icon, isDark, secure, placeholder, isPassword, onTogglePassword, showPassword, value, onChangeText, error }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[styles.inputLabel, { color: isDark ? '#cbd5e1' : '#334155' }]}>{label}</Text>
        {error && <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold' }}>{error}</Text>}
      </View>
      <View style={[styles.inputWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc', borderColor: error ? '#ef4444' : (isDark ? '#334155' : '#e2e8f0') }]}>
        <MaterialCommunityIcons name={icon} size={20} color="#94a3b8" />
        <TextInput value={value} onChangeText={onChangeText} secureTextEntry={secure} placeholder={placeholder} placeholderTextColor="#94a3b8" style={[styles.textInput, { color: isDark ? 'white' : '#0f172a' }]} />
        {isPassword && (
          <TouchableOpacity onPress={onTogglePassword}>
            <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SocialLoginArea({ isDark }: any) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={[styles.dividerLine, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {['google', 'facebook', 'apple'].map(n => (
          <TouchableOpacity key={n} style={[styles.socialBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <MaterialCommunityIcons name={n as any} size={22} color={n === 'apple' ? (isDark ? 'white' : 'black') : (n === 'google' ? '#ef4444' : '#1877f2')} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1 }, overlay: { flex: 1 },
  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  headerContent: { width: '100%', maxWidth: 1200, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 40 },
  logoCapsule: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, overflow: 'hidden' },
  logoText: { fontWeight: 'bold', marginLeft: 8, color: 'white', fontSize: 13 },
  themeToggle: { padding: 10, borderRadius: 25, overflow: 'hidden' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  mainCard: { width: '100%', maxWidth: 1200, alignSelf: 'center', borderRadius: 40, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  leftPanel: { flex: 1.2, padding: 60, justifyContent: 'center' },
  mainHeading: { fontSize: 52, fontWeight: 'bold', color: 'white', lineHeight: 60 },
  adSpace: { marginTop: 50, borderStyle: 'dashed', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 25, padding: 30, alignItems: 'center' },
  adTitle: { color: 'rgba(255,255,255,0.6)', fontWeight: 'bold', marginTop: 12, fontSize: 12 },
  authContainer: { flex: 1, overflow: 'hidden' },
  rightPanel: { flex: 1, justifyContent: 'center' },
  slidingWrapper: { flexDirection: 'row' },
  welcomeTitle: { fontSize: 30, fontWeight: 'bold', marginBottom: 5 },
  inputLabel: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 15, paddingHorizontal: 15 },
  textInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 14 },
  signInButton: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 15, height: 55 },
  signInText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 10, fontWeight: 'bold', color: '#94a3b8' },
  socialBtn: { flex: 1, height: 50, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  switchMode: { marginTop: 25, alignItems: 'center' },
  linkText: { color: '#3b82f6', fontWeight: 'bold' },
  checklistContainer: { marginTop: 5, marginBottom: 10, gap: 5, paddingLeft: 5 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 11, fontWeight: '600' }
});