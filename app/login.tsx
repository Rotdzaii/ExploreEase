import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// Hoàn tất phiên xác thực trên trình duyệt (đặc biệt cần cho web)
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  console.log('Client ID check:', process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);

  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const { t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [googleLoading, setGoogleLoading] = useState(false);

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

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

  const redirectUri = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        native: 'exploreeaseexpo:/oauthredirect',
      }),
    []
  );

  const isGoogleConfiguredForPlatform =
    (Platform.OS === 'web' && !!googleWebClientId) ||
    (Platform.OS === 'android' && !!googleAndroidClientId) ||
    (Platform.OS === 'ios' && !!googleIosClientId);

  const [googleRequest, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest(
    {
      webClientId: googleWebClientId || 'MISSING_WEB_CLIENT_ID',
      androidClientId: googleAndroidClientId || undefined,
      iosClientId: googleIosClientId || undefined,
      // Fallback to prevent hook from throwing if platform-specific id is missing.
      clientId: googleWebClientId || 'MISSING_CLIENT_ID',
      redirectUri,
    },
    {
      // Use the app scheme declared in app.json to keep redirect stable.
      native: 'exploreeaseexpo:/oauthredirect',
    }
  );

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

  useEffect(() => {
    const finishGoogleLogin = async () => {
      if (googleResponse?.type !== 'success') return;

      const idToken =
        (googleResponse as any)?.authentication?.idToken ??
        (googleResponse as any)?.params?.id_token;

      if (!idToken) {
        Alert.alert(t('auth.login.errorLoginFailedTitle'), t('auth.login.errorMissingGoogleIdToken'));
        return;
      }

      setGoogleLoading(true);
      try {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (error) {
          console.log('Lỗi đăng nhập:', error.message);
          Alert.alert(t('auth.login.errorLoginTitle'), error.message);
          return;
        }

        router.replace('/(tabs)');
      } catch {
        Alert.alert(t('auth.login.errorConnectionTitle'), t('auth.login.errorGoogleUnavailable'));
      } finally {
        setGoogleLoading(false);
      }
    };

    finishGoogleLogin();
  }, [googleResponse]);

  const validate = () => {
    let newErrors: any = {};
    if (!isLogin && !fullName) newErrors.fullName = t('auth.login.validation.fullNameRequired');
    if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = t('auth.recovery.invalidEmailTitle');
    
    const isPassValid = Object.values(passwordCriteria).every(Boolean);
    if (!isPassValid && !isLogin) {
      newErrors.password = t('auth.recovery.passwordWeakTitle');
    } else if (isLogin && password.length < 6) {
      newErrors.password = t('auth.login.validation.passwordMinLength');
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
        Alert.alert(t('auth.login.errorSystemTitle'), error.message);
      } else {
        if (isLogin) {
          router.replace('/(tabs)');
        } else {
          Alert.alert(t('auth.login.successTitle'), t('auth.login.successSignupVerifyEmail'));
          toggleAuthMode(true);
        }
      }
    } catch {
      Alert.alert(t('auth.login.errorConnectionTitle'), t('auth.login.errorSupabaseConnection'));
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

  const handleGoogleLogin = async () => {
    if (!isGoogleConfiguredForPlatform) {
      const missingKey =
        Platform.OS === 'web'
          ? 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'
          : Platform.OS === 'android'
            ? 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'
            : Platform.OS === 'ios'
              ? 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
              : 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';

      Alert.alert(
        t('auth.login.errorMissingGoogleConfigTitle'),
        t('auth.login.errorMissingGoogleConfigMessage', { key: missingKey })
      );
      return;
    }

    try {
      if (__DEV__) {
        console.log('[GoogleLogin] platform=', Platform.OS);
        console.log('[GoogleLogin] redirectUri=', (googleRequest as any)?.redirectUri);
      }

      // Thêm dòng này vào hàm xử lý khi nhấn nút Login
      const rUri = AuthSession.makeRedirectUri({
        path: 'login', // Hoặc path cậu đang dùng
        preferLink: true,
      });
      console.log('--- ĐỊA CHỈ REDIRECT ĐÂY NÈ ---');
      console.log(rUri);

      await googlePromptAsync();
    } catch {
      Alert.alert(t('auth.login.errorLoginFailedTitle'), t('auth.login.errorOpenGoogleLogin'));
    }
  };

  return (
    <ImageBackground 
      source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e' }} 
      style={styles.backgroundImage}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(10, 25, 41, 0.7)' : 'rgba(255, 255, 255, 0.1)' }]}>
        
        <SafeAreaView style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View style={styles.logoCapsule}>
              <MaterialCommunityIcons name="earth" size={24} color={ExploreEaseColors.primary} />
              <Text style={styles.logoText}>{t('common.appNameUpper')}</Text>
            </View>
          </View>
        </SafeAreaView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Animated.View style={[styles.mainCard, { flexDirection: isLargeScreen ? 'row' : 'column', transform: [{ translateX: shakeAnim }] }]}>
              
              {isLargeScreen && (
                <BlurView intensity={20} tint="dark" style={styles.leftPanel}>
                  <Text style={styles.mainHeading}>
                    {t('auth.login.heroTitleLine1')} {'\n'}
                    <Text style={{ color: ExploreEaseColors.primary }}>{t('auth.login.heroTitleLine2')}</Text>
                  </Text>
                  <View style={styles.adSpace}>
                    <MaterialCommunityIcons name="image-filter-hdr" size={40} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.adTitle}>{t('auth.login.heroSponsored')}</Text>
                  </View>
                </BlurView>
              )}

              <View style={styles.authContainer}>
                <BlurView intensity={isDark ? 60 : 90} tint={isDark ? 'dark' : 'light'} style={styles.rightPanel}>
                  <Animated.View style={[styles.slidingWrapper, { width: authPanelWidth * 2, transform: [{ translateX: slideAnim }] }]}>
                    
                    {/* --- LOGIN FORM --- */}
                    <View style={{ width: authPanelWidth, padding: isLargeScreen ? 50 : 30 }}>
                      <Text style={[styles.welcomeTitle, { color: isDark ? 'white' : '#0f172a' }]}>{t('auth.login.welcomeBack')}</Text>
                      <AuthInput label={t('auth.login.emailLabel')} icon="email-outline" isDark={isDark} placeholder={t('auth.login.emailPlaceholder')} value={email} onChangeText={setEmail} error={errors.email} />
                      <AuthInput label={t('auth.login.passwordLabel')} icon="lock-outline" isDark={isDark} secure={!showPassword} placeholder={t('auth.login.passwordPlaceholder')} value={password} onChangeText={setPassword} isPassword onTogglePassword={() => setShowPassword(!showPassword)} showPassword={showPassword} error={errors.password} />
                      <TouchableOpacity onPress={() => router.push('/forgot-password')} style={{ alignSelf: 'flex-end', marginTop: 2 }}>
                        <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 12 }}>{t('auth.login.forgotPassword')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleAuthAction} disabled={loading} style={styles.signInButton}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.signInText}>{t('auth.login.signIn')}</Text>}
                      </TouchableOpacity>
                      <SocialLoginArea
                        isDark={isDark}
                        disabled={!googleRequest || googleLoading}
                        loading={googleLoading}
                        onGooglePress={handleGoogleLogin}
                        dividerText={t('auth.login.or')}
                        googleButtonText={t('auth.login.continueWithGoogle')}
                      />
                      <TouchableOpacity onPress={() => toggleAuthMode(false)} style={styles.switchMode}>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                          {t('auth.login.noAccount')} <Text style={styles.linkText}>{t('auth.login.signUp')}</Text>
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* --- SIGN UP FORM --- */}
                    <View style={{ width: authPanelWidth, padding: isLargeScreen ? 50 : 30 }}>
                      <Text style={[styles.welcomeTitle, { color: isDark ? 'white' : '#0f172a' }]}>{t('auth.login.createAccount')}</Text>
                      <AuthInput label={t('auth.login.fullNameLabel')} icon="account-outline" isDark={isDark} placeholder={t('auth.login.fullNamePlaceholder')} value={fullName} onChangeText={setFullName} error={errors.fullName} />
                      <AuthInput label={t('auth.login.emailLabel')} icon="email-outline" isDark={isDark} placeholder={t('auth.login.emailPlaceholder')} value={email} onChangeText={setEmail} error={errors.email} />
                      <AuthInput label={t('auth.login.passwordLabel')} icon="lock-outline" isDark={isDark} secure={!showPassword} placeholder={t('auth.login.passwordPlaceholder')} value={password} onChangeText={setPassword} isPassword onTogglePassword={() => setShowPassword(!showPassword)} showPassword={showPassword} />
                      
                      <View style={styles.checklistContainer}>
                        <CheckItem label={t('auth.recovery.ruleMinChar')} met={passwordCriteria.minChar} isDark={isDark} />
                        <CheckItem label={t('auth.login.ruleUpperLower')} met={passwordCriteria.hasUpper && passwordCriteria.hasLower} isDark={isDark} />
                        <CheckItem label={t('auth.recovery.ruleNumber')} met={passwordCriteria.hasNumber} isDark={isDark} />
                        <CheckItem label={t('auth.recovery.ruleSpecial')} met={passwordCriteria.hasSpecial} isDark={isDark} />
                      </View>

                      <TouchableOpacity onPress={handleAuthAction} disabled={loading} style={[styles.signInButton, { backgroundColor: '#059669' }]}>
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.signInText}>{t('auth.login.createAccount')}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleAuthMode(true)} style={styles.switchMode}>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                          {t('auth.login.hasAccount')} <Text style={styles.linkText}>{t('auth.login.signIn')}</Text>
                        </Text>
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

type SocialLoginAreaProps = {
  isDark: boolean;
  disabled: boolean;
  loading: boolean;
  onGooglePress: () => void;
  dividerText: string;
  googleButtonText: string;
};

function SocialLoginArea({
  isDark,
  disabled,
  loading,
  onGooglePress,
  dividerText,
  googleButtonText,
}: SocialLoginAreaProps) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />
        <Text style={styles.dividerText}>{dividerText}</Text>
        <View style={[styles.dividerLine, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} />
      </View>
      <TouchableOpacity
        disabled={disabled}
        onPress={onGooglePress}
        className={`flex-row items-center justify-center p-4 bg-white border border-slate-200 rounded-2xl active:scale-95 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {loading ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text className="font-bold text-slate-950">{googleButtonText}</Text>
        )}
      </TouchableOpacity>
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