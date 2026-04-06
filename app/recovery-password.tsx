import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { supabase } from '@/src/services/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type RecoveryStep = 'email' | 'otp' | 'password' | 'success';

const EMAIL_REGEX = /\S+@\S+\.\S+/;

const validatePassword = (value: string) => {
  return {
    minChar: value.length >= 8,
    hasUpper: /[A-Z]/.test(value),
    hasLower: /[a-z]/.test(value),
    hasNumber: /\d/.test(value),
    hasSpecial: /[@$!%*?&]/.test(value),
  };
};

const getProgressStep = (step: RecoveryStep) => {
  switch (step) {
    case 'email':
      return 1;
    case 'otp':
      return 2;
    case 'password':
      return 3;
    case 'success':
      return 4;
    default:
      return 1;
  }
};

export default function RecoveryPasswordScreen() {
  const { isDark } = useTheme();
  const { t } = useI18n();

  const [currentStep, setCurrentStep] = useState<RecoveryStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const progressStep = getProgressStep(currentStep);
  const isSuccess = currentStep === 'success';

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      body: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      inputBg: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
      inputBorder: isDark ? '#334155' : '#e2e8f0',
      inputText: isDark ? '#ffffff' : '#0f172a',
    }),
    [isDark]
  );

  const passwordCriteria = useMemo(() => validatePassword(newPassword), [newPassword]);
  const isPasswordValid = useMemo(() => Object.values(passwordCriteria).every(Boolean), [passwordCriteria]);

  const sendResetEmail = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert(t('auth.recovery.invalidEmailTitle'), t('auth.recovery.invalidEmailMessage'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;

      setEmail(cleanEmail);
      setOtp('');
      setCurrentStep('otp');
      Alert.alert(t('auth.recovery.otpSentTitle'), t('auth.recovery.otpSentMessage'));
    } catch (err: any) {
      Alert.alert(t('auth.recovery.otpSendFailedTitle'), err?.message ?? t('trips.error.tryAgainLater'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      Alert.alert(t('auth.recovery.otpMissingTitle'), t('auth.recovery.otpMissingMessage'));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: cleanOtp,
        type: 'recovery',
      });

      if (error) throw error;

      if (data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      setCurrentStep('password');
    } catch (err: any) {
      Alert.alert(t('auth.recovery.otpInvalidTitle'), err?.message ?? t('auth.recovery.otpInvalidMessage'));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!EMAIL_REGEX.test(email.trim().toLowerCase())) {
      Alert.alert(t('auth.recovery.invalidEmailTitle'), t('auth.recovery.invalidEmailBeforeResend'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) throw error;
      Alert.alert(t('auth.recovery.otpResentTitle'), t('auth.recovery.otpResentMessage'));
    } catch (err: any) {
      Alert.alert(t('auth.recovery.otpResendFailedTitle'), err?.message ?? t('trips.error.tryAgainLater'));
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async () => {
    if (!isPasswordValid) {
      Alert.alert(t('auth.recovery.passwordWeakTitle'), t('auth.recovery.passwordWeakMessage'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('auth.recovery.passwordMismatchTitle'), t('auth.recovery.passwordMismatchMessage'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setCurrentStep('success');
    } catch (err: any) {
      Alert.alert(t('auth.recovery.passwordUpdateFailedTitle'), err?.message ?? t('trips.error.tryAgainLater'));
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign out errors and still return user to login.
    }
    router.replace('/login');
  };

  const renderProgress = () => {
    if (isSuccess) {
      return (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{t('auth.recovery.progressDone')}</Text>
        </View>
      );
    }

    const stepLabel = Math.min(progressStep, 3);

    return (
      <View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1, 2, 3].map((step) => (
            <View
              key={step}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 999,
                backgroundColor: step <= progressStep ? ExploreEaseColors.primary : colors.border,
              }}
            />
          ))}
        </View>

        <Text style={{ marginTop: 10, color: colors.muted, fontSize: 12, fontWeight: '700' }}>
          {t('auth.recovery.progressStep', { current: stepLabel })}
        </Text>
      </View>
    );
  };

  const renderEmailStep = () => {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.title }]}>{t('auth.recovery.forgotPasswordTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.body }]}>{t('auth.recovery.forgotPasswordSubtitle')}</Text>

        <Text style={[styles.label, { color: colors.body }]}>{t('auth.login.emailLabel')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('auth.login.emailPlaceholder')}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
              color: colors.inputText,
            },
          ]}
        />

        <Pressable
          onPress={() => void sendResetEmail()}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryBtn,
            loading ? { opacity: 0.7 } : null,
            pressed ? { opacity: 0.86 } : null,
          ]}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#001018" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('auth.profileSetup.continue')}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderOtpStep = () => {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.title }]}>{t('auth.recovery.verifyOtpTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.body }]}>{t('auth.recovery.verifyOtpSubtitle', { email })}</Text>

        <Text style={[styles.label, { color: colors.body }]}>{t('auth.recovery.otpLabel')}</Text>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          placeholder={t('auth.recovery.otpPlaceholder')}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
              color: colors.inputText,
            },
          ]}
        />

        <Pressable
          onPress={() => void verifyOtp()}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryBtn,
            loading ? { opacity: 0.7 } : null,
            pressed ? { opacity: 0.86 } : null,
          ]}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#001018" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('auth.recovery.verifyOtpAction')}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => void resendOtp()}
          disabled={loading}
          style={({ pressed }) => [styles.linkBtn, pressed ? { opacity: 0.8 } : null]}
          accessibilityRole="button"
        >
          <Text style={styles.linkBtnText}>{t('auth.recovery.resendOtpAction')}</Text>
        </Pressable>
      </View>
    );
  };

  const renderPasswordStep = () => {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.title }]}>{t('auth.recovery.newPasswordTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.body }]}>{t('auth.recovery.newPasswordSubtitle')}</Text>

        <Text style={[styles.label, { color: colors.body }]}>{t('auth.recovery.newPasswordLabel')}</Text>
        <View
          style={[
            styles.passwordWrap,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
            },
          ]}
        >
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPassword}
            placeholder={t('auth.login.passwordPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.passwordInput, { color: colors.inputText }]}
          />
          <Pressable onPress={() => setShowPassword((prev) => !prev)} accessibilityRole="button">
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        </View>

        <Text style={[styles.label, { color: colors.body }]}>{t('auth.recovery.confirmPasswordLabel')}</Text>
        <View
          style={[
            styles.passwordWrap,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
            },
          ]}
        >
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            placeholder={t('auth.recovery.confirmPasswordPlaceholder')}
            placeholderTextColor={colors.muted}
            style={[styles.passwordInput, { color: colors.inputText }]}
          />
          <Pressable onPress={() => setShowConfirmPassword((prev) => !prev)} accessibilityRole="button">
            <MaterialCommunityIcons
              name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        </View>

        <View style={styles.criteriaWrap}>
          <PasswordRule label={t('auth.recovery.ruleMinChar')} met={passwordCriteria.minChar} isDark={isDark} />
          <PasswordRule label={t('auth.recovery.ruleUpperLower')} met={passwordCriteria.hasUpper && passwordCriteria.hasLower} isDark={isDark} />
          <PasswordRule label={t('auth.recovery.ruleNumber')} met={passwordCriteria.hasNumber} isDark={isDark} />
          <PasswordRule label={t('auth.recovery.ruleSpecial')} met={passwordCriteria.hasSpecial} isDark={isDark} />
        </View>

        <Pressable
          onPress={() => void updatePassword()}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryBtn,
            loading ? { opacity: 0.7 } : null,
            pressed ? { opacity: 0.86 } : null,
          ]}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#001018" />
          ) : (
            <Text style={styles.primaryBtnText}>{t('auth.recovery.updatePasswordAction')}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderSuccessStep = () => {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <View style={styles.successIconWrap}>
          <View style={[styles.successIconInner, { backgroundColor: 'rgba(34, 211, 238, 0.16)' }]}> 
            <MaterialCommunityIcons name="check" size={34} color={ExploreEaseColors.primary} />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.title, textAlign: 'center' }]}>{t('auth.recovery.successTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.body, textAlign: 'center' }]}> 
          {t('auth.recovery.successSubtitle')}
        </Text>

        <Pressable
          onPress={() => void backToLogin()}
          style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.86 } : null]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>{t('auth.recovery.backToLogin')}</Text>
        </Pressable>

        <View
          style={{
            marginTop: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15, 23, 42, 0.03)',
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
            {t('auth.recovery.securityHint')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}> 
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backBtn, pressed ? { opacity: 0.8 } : null]}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="chevron-left" size={22} color={colors.title} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.title }]}>{t('auth.recovery.headerTitle')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{renderProgress()}</View>

          <View style={styles.contentWrap}>
            {currentStep === 'email' && renderEmailStep()}
            {currentStep === 'otp' && renderOtpStep()}
            {currentStep === 'password' && renderPasswordStep()}
            {currentStep === 'success' && renderSuccessStep()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type PasswordRuleProps = {
  label: string;
  met: boolean;
  isDark: boolean;
};

function PasswordRule({ label, met, isDark }: PasswordRuleProps) {
  return (
    <View style={styles.ruleRow}>
      <MaterialCommunityIcons
        name={met ? 'check-circle' : 'close-circle'}
        size={14}
        color={met ? '#10b981' : '#ef4444'}
      />
      <Text style={{ color: met ? (isDark ? '#a7f3d0' : '#065f46') : (isDark ? '#fca5a5' : '#991b1b'), fontSize: 11, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  progressCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  passwordWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 10,
    fontSize: 14,
  },
  criteriaWrap: {
    marginBottom: 10,
    gap: 6,
    paddingLeft: 2,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtn: {
    marginTop: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: ExploreEaseColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#001018',
    fontSize: 15,
    fontWeight: '900',
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  linkBtnText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '800',
  },
  successIconWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  successIconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
