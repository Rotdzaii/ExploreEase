import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { supabase } from '@/src/services/supabase';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validatePassword = (pwd: string) => ({
  minChar: pwd.length >= 8,
  hasUpperAndLower: /[A-Z]/.test(pwd) && /[a-z]/.test(pwd),
  hasNumber: /\d/.test(pwd),
});

const maskEmail = (value: string) => {
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  const visible = local.slice(0, 2);
  const masked = `${visible}${'*'.repeat(Math.max(0, local.length - 2))}`;
  return `${masked}@${domain}`;
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

export default function ForgotPasswordScreen() {
  const { isDark } = useTheme();
  const { t } = useI18n();
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [step, setStep] = useState<RecoveryStep>('email');
  const [loading, setLoading] = useState(false);

  const [emailDraft, setEmailDraft] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const progressStep = getProgressStep(step);
  const strength = useMemo(() => {
    if (!password) return { level: 0, label: '' as '' | 'weak' | 'fair' | 'strong', text: '' };
    const criteria = validatePassword(password);
    if (!criteria.minChar) return { level: 1, label: 'weak' as const, text: t('auth.recovery.strengthWeak') };
    if (!criteria.hasUpperAndLower || !criteria.hasNumber) return { level: 2, label: 'fair' as const, text: t('auth.recovery.strengthFair') };
    return { level: 3, label: 'strong' as const, text: t('auth.recovery.strengthStrong') };
  }, [password, t]);

  const isPasswordValid = useMemo(() => {
    const c = validatePassword(password);
    return c.minChar && c.hasUpperAndLower && c.hasNumber;
  }, [password]);

  const isConfirmMatching = useMemo(
    () => password.length > 0 && password === confirmPassword,
    [confirmPassword, password]
  );

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      inputBg: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
      inputText: isDark ? '#ffffff' : '#0f172a',
      danger: '#ef4444',
      success: '#10b981',
      warning: '#d97706',
    }),
    [isDark]
  );

  const notify = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' | 'error') => {
      addNotification({ message, type, durationMs: 3200 });
    },
    [addNotification]
  );

  useEffect(() => {
    if (step !== 'otp') return;
    if (resendTimer <= 0) return;

    const timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer, step]);

  const handleSendCode = async () => {
    const clean = emailDraft.trim().toLowerCase();
    setEmailError('');

    if (!clean) {
      const msg = t('auth.recovery.emailRequiredMessage');
      setEmailError(msg);
      notify(msg, 'error');
      return;
    }

    if (!EMAIL_REGEX.test(clean)) {
      const msg = t('auth.recovery.invalidEmailMessage');
      setEmailError(msg);
      notify(msg, 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clean);
      if (error) throw error;

      setEmail(clean);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      setStep('otp');
      setResendTimer(60);
      notify(t('auth.recovery.codeSentIfExists'), 'info');
    } catch (err: any) {
      const message = String(err?.message ?? t('auth.recovery.sendCodeFailedMessage'));
      setEmailError(message);
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInputChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const next = [...otpDigits];
    next[index] = value.slice(-1);
    setOtpDigits(next);
    setOtpError('');

    if (value && index < otpRefs.current.length - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otpDigits.join('');

    if (otpCode.length !== 6) {
      const msg = t('auth.recovery.enterAllOtpDigits');
      setOtpError(msg);
      notify(msg, 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'recovery',
      });
      if (error) throw error;

      if (data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      setStep('password');
      setOtpError('');
      notify(t('auth.recovery.otpVerified'), 'success');
    } catch (err: any) {
      const raw = String(err?.message ?? '').toLowerCase();
      const message = raw.includes('token') || raw.includes('otp') || raw.includes('invalid')
        ? t('auth.recovery.otpInvalidMessage')
        : (err?.message ?? t('auth.recovery.verifyOtpFailedMessage'));
      setOtpError(message);
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (loading || resendTimer > 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      setResendTimer(60);
      otpRefs.current[0]?.focus();
      notify(t('auth.recovery.otpResentMessage'), 'info');
    } catch (err: any) {
      const message = String(err?.message ?? t('auth.recovery.otpResendFailedMessage'));
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordError('');

    if (!password.trim()) {
      const msg = t('auth.recovery.newPasswordRequired');
      setPasswordError(msg);
      notify(msg, 'error');
      return;
    }

    if (!isPasswordValid) {
      const msg = t('auth.recovery.passwordWeakMessage');
      setPasswordError(msg);
      notify(msg, 'error');
      return;
    }

    if (!isConfirmMatching) {
      const msg = t('auth.recovery.passwordMismatchMessage');
      setPasswordError(msg);
      notify(msg, 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setStep('success');
      notify(t('auth.recovery.passwordUpdatedSuccess'), 'success');
    } catch (err: any) {
      const message = String(err?.message ?? t('auth.recovery.passwordUpdateFailedMessage'));
      setPasswordError(message);
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const backToSignIn = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign-out failure and still route to login
    }
    router.replace('/login');
  };

  const renderEmailStep = () => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={styles.iconWrap}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(34, 211, 238, 0.12)' }]}> 
          <MaterialCommunityIcons name="email-outline" size={30} color={ExploreEaseColors.primary} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.title }]}>{t('auth.recovery.forgotPasswordTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{t('auth.recovery.forgotPasswordSubtitle')}</Text>

      <Text style={[styles.label, { color: colors.title }]}>{t('auth.login.emailLabel')}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
        <MaterialCommunityIcons name="email-outline" size={20} color={colors.muted} />
        <TextInput
          value={emailDraft}
          onChangeText={(value) => {
            setEmailDraft(value);
            setEmailError('');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('auth.login.emailPlaceholder')}
          placeholderTextColor={colors.muted}
          style={[styles.inputText, { color: colors.inputText }]}
          editable={!loading}
          onSubmitEditing={() => {
            if (!loading) {
              void handleSendCode();
            }
          }}
        />
      </View>

      {!!emailError ? <Text style={[styles.errorText, { color: colors.danger }]}>{emailError}</Text> : null}

      <Pressable
        onPress={() => void handleSendCode()}
        disabled={loading || !emailDraft.trim()}
        style={({ pressed }) => [
          styles.primaryBtn,
          (loading || !emailDraft.trim()) ? { opacity: 0.5 } : null,
          pressed ? { opacity: 0.86 } : null,
        ]}
        accessibilityRole="button"
      >
        {loading ? (
          <View style={styles.btnRow}>
            <ActivityIndicator color="#001018" />
            <Text style={styles.primaryBtnText}>{t('auth.recovery.sending')}</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <Text style={styles.primaryBtnText}>{t('auth.recovery.sendCodeAction')}</Text>
            <Feather name="arrow-right" size={18} color="#001018" />
          </View>
        )}
      </Pressable>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {t('auth.recovery.rememberPasswordPrompt')}{' '}
          <Text onPress={backToSignIn} style={{ color: ExploreEaseColors.primary, fontWeight: '800' }}>
            {t('common.login')}
          </Text>
        </Text>
      </View>
    </View>
  );

  const renderOtpStep = () => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={styles.iconWrap}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(34, 211, 238, 0.12)' }]}> 
          <MaterialCommunityIcons name="shield-check-outline" size={30} color={ExploreEaseColors.primary} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.title }]}>{t('auth.recovery.verifyOtpTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{t('auth.recovery.verifyOtpSubtitle', { email: maskEmail(email) })}</Text>

      <View style={styles.otpWrap}>
        {otpDigits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => {
              otpRefs.current[index] = ref;
            }}
            value={digit}
            onChangeText={(value) => handleOtpInputChange(index, value)}
            onKeyPress={(e) => handleOtpKeyPress(index, e.nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            placeholder="0"
            placeholderTextColor={colors.muted}
            editable={!loading}
            style={[
              styles.otpInput,
              {
                borderColor: colors.border,
                color: colors.inputText,
                backgroundColor: colors.inputBg,
              },
            ]}
          />
        ))}
      </View>

      {!!otpError ? <Text style={[styles.errorText, { color: colors.danger, textAlign: 'center' }]}>{otpError}</Text> : null}

      <Pressable
        onPress={() => void handleVerifyOtp()}
        disabled={loading || otpDigits.join('').length !== 6}
        style={({ pressed }) => [
          styles.primaryBtn,
          (loading || otpDigits.join('').length !== 6) ? { opacity: 0.5 } : null,
          pressed ? { opacity: 0.86 } : null,
        ]}
        accessibilityRole="button"
      >
        {loading ? (
          <View style={styles.btnRow}>
            <ActivityIndicator color="#001018" />
            <Text style={styles.primaryBtnText}>{t('auth.recovery.verifying')}</Text>
          </View>
        ) : (
          <Text style={styles.primaryBtnText}>{t('auth.recovery.verifyOtpAction')}</Text>
        )}
      </Pressable>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>{t('auth.recovery.didNotReceiveCode')}</Text>
        <Pressable
          onPress={() => void handleResendOtp()}
          disabled={loading || resendTimer > 0}
          style={({ pressed }) => [pressed ? { opacity: 0.82 } : null]}
          accessibilityRole="button"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="restore" size={16} color={ExploreEaseColors.primary} />
            <Text style={{ color: ExploreEaseColors.primary, fontSize: 13, fontWeight: '700', opacity: loading || resendTimer > 0 ? 0.5 : 1 }}>
              {resendTimer > 0 ? t('auth.recovery.resendIn', { seconds: resendTimer }) : t('auth.recovery.resendOtpAction')}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={[styles.noteCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }]}>
        <Text style={[styles.noteText, { color: colors.muted }]}>{t('auth.recovery.otpExpiryHint')}</Text>
      </View>
    </View>
  );

  const renderPasswordStep = () => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={styles.iconWrap}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(34, 211, 238, 0.12)' }]}> 
          <MaterialCommunityIcons name="lock-outline" size={30} color={ExploreEaseColors.primary} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.title }]}>{t('auth.recovery.newPasswordTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{t('auth.recovery.newPasswordSubtitle')}</Text>

      <Text style={[styles.label, { color: colors.title }]}>{t('auth.recovery.newPasswordLabel')}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
        <MaterialCommunityIcons name="lock-outline" size={20} color={colors.muted} />
        <TextInput
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError('');
          }}
          secureTextEntry={!showPassword}
          placeholder={t('auth.recovery.newPasswordPlaceholder')}
          placeholderTextColor={colors.muted}
          style={[styles.inputText, { color: colors.inputText }]}
          editable={!loading}
        />
        <Pressable onPress={() => setShowPassword((prev) => !prev)} accessibilityRole="button">
          <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>

      {!!password ? (
        <View style={{ marginTop: 4, marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.strengthTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]}>
              <View
                style={[
                  styles.strengthFill,
                  strength.label === 'weak'
                    ? { backgroundColor: colors.danger, width: '33%' }
                    : strength.label === 'fair'
                      ? { backgroundColor: colors.warning, width: '66%' }
                      : { backgroundColor: ExploreEaseColors.primary, width: '100%' },
                ]}
              />
            </View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                color: strength.label === 'weak' ? colors.danger : strength.label === 'fair' ? colors.warning : ExploreEaseColors.primary,
              }}
            >
              {strength.text}
            </Text>
          </View>

          <View style={{ marginTop: 8, gap: 6 }}>
            <PasswordRuleRow met={password.length >= 8} text={t('auth.recovery.ruleMinChar')} colors={colors} />
            <PasswordRuleRow met={/[A-Z]/.test(password) && /[a-z]/.test(password)} text={t('auth.recovery.ruleUpperLower')} colors={colors} />
            <PasswordRuleRow met={/\d/.test(password)} text={t('auth.recovery.ruleNumber')} colors={colors} />
          </View>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.title }]}>{t('auth.recovery.confirmPasswordLabel')}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
        <MaterialCommunityIcons name="lock-outline" size={20} color={colors.muted} />
        <TextInput
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setPasswordError('');
          }}
          secureTextEntry={!showConfirmPassword}
          placeholder={t('auth.recovery.confirmPasswordPlaceholder')}
          placeholderTextColor={colors.muted}
          style={[styles.inputText, { color: colors.inputText }]}
          editable={!loading}
        />
        <Pressable onPress={() => setShowConfirmPassword((prev) => !prev)} accessibilityRole="button">
          <MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>

      {!!confirmPassword ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          {isConfirmMatching ? (
            <MaterialCommunityIcons name="check-circle" size={16} color={colors.success} />
          ) : (
            <MaterialCommunityIcons name="close-circle" size={16} color={colors.danger} />
          )}
          <Text style={{ color: isConfirmMatching ? colors.success : colors.danger, fontSize: 12, fontWeight: '700' }}>
            {isConfirmMatching ? t('auth.recovery.passwordsMatch') : t('auth.recovery.passwordsDoNotMatch')}
          </Text>
        </View>
      ) : null}

      {!!passwordError ? (
        <View style={[styles.errorCard, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>{passwordError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void handleUpdatePassword()}
        disabled={loading || !isPasswordValid || !isConfirmMatching}
        style={({ pressed }) => [
          styles.primaryBtn,
          (loading || !isPasswordValid || !isConfirmMatching) ? { opacity: 0.5 } : null,
          pressed ? { opacity: 0.86 } : null,
        ]}
        accessibilityRole="button"
      >
        {loading ? (
          <View style={styles.btnRow}>
            <ActivityIndicator color="#001018" />
            <Text style={styles.primaryBtnText}>{t('auth.recovery.updating')}</Text>
          </View>
        ) : (
          <Text style={styles.primaryBtnText}>{t('auth.recovery.updatePasswordAction')}</Text>
        )}
      </Pressable>

      <View style={[styles.noteCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }]}>
        <Text style={[styles.noteText, { color: colors.muted }]}>{t('auth.recovery.encryptionHint')}</Text>
      </View>
    </View>
  );

  const renderSuccessStep = () => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={styles.iconWrap}>
        <View style={[styles.successCircle, { backgroundColor: 'rgba(34, 211, 238, 0.16)' }]}>
          <MaterialCommunityIcons name="check" size={40} color={ExploreEaseColors.primary} />
        </View>
      </View>

      <Text style={[styles.title, { color: colors.title, textAlign: 'center' }]}>{t('auth.recovery.successTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.muted, textAlign: 'center' }]}>{t('auth.recovery.successSubtitle')}</Text>

      <Pressable
        onPress={backToSignIn}
        style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.86 } : null]}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>{t('auth.recovery.backToLogin')}</Text>
      </Pressable>

      <View style={[styles.noteCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }]}>
        <Text style={[styles.noteText, { color: colors.muted }]}>{t('auth.recovery.securityHint')}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[styles.progressHeader, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(2,6,23,0.72)' : 'rgba(255,255,255,0.86)' }]}>
          <View style={styles.progressBarWrap}>
            {[1, 2, 3].map((item) => (
              <View
                key={item}
                style={[
                  styles.progressSegment,
                  { backgroundColor: item <= progressStep ? ExploreEaseColors.primary : colors.border },
                ]}
              />
            ))}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>
              {t('auth.recovery.progressStep', { current: Math.min(progressStep, 3) })}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step === 'email' ? renderEmailStep() : null}
          {step === 'otp' ? renderOtpStep() : null}
          {step === 'password' ? renderPasswordStep() : null}
          {step === 'success' ? renderSuccessStep() : null}

          <View style={[styles.footerWrap, { borderColor: colors.border }]}>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
              {t('auth.recovery.needHelp')}{' '}
              <Text style={{ color: ExploreEaseColors.primary, fontWeight: '700' }}>{t('auth.recovery.contactSupport')}</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type PasswordRuleRowProps = {
  met: boolean;
  text: string;
  colors: {
    muted: string;
    success: string;
    border: string;
  };
};

function PasswordRuleRow({ met, text, colors }: PasswordRuleRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {met ? (
        <MaterialCommunityIcons name="check-circle" size={16} color={colors.success} />
      ) : (
        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border }} />
      )}
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  progressHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 9,
  },
  progressBarWrap: {
    flexDirection: 'row',
    gap: 8,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    justifyContent: 'space-between',
    gap: 14,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  inputWrap: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 12,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: ExploreEaseColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  otpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
  },
  strengthTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 999,
  },
  errorCard: {
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
    marginBottom: 4,
  },
  noteCard: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  footerWrap: {
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 4,
    marginTop: 6,
  },
});
