import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
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
    if (!criteria.minChar) return { level: 1, label: 'weak' as const, text: 'Weak' };
    if (!criteria.hasUpperAndLower || !criteria.hasNumber) return { level: 2, label: 'fair' as const, text: 'Fair' };
    return { level: 3, label: 'strong' as const, text: 'Strong' };
  }, [password]);

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
      const msg = 'Please enter your email address';
      setEmailError(msg);
      notify(msg, 'error');
      return;
    }

    if (!EMAIL_REGEX.test(clean)) {
      const msg = 'Please enter a valid email address';
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
      notify('If this email exists, a recovery code has been sent.', 'info');
    } catch (err: any) {
      const message = String(err?.message ?? 'Unable to send code. Please try again.');
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
      const msg = 'Please enter all 6 digits';
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
      notify('OTP verified successfully.', 'success');
    } catch (err: any) {
      const raw = String(err?.message ?? '').toLowerCase();
      const message = raw.includes('token') || raw.includes('otp') || raw.includes('invalid')
        ? 'Wrong or expired OTP. Please try again.'
        : (err?.message ?? 'Unable to verify OTP. Please try again.');
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
      notify('Recovery code resent.', 'info');
    } catch (err: any) {
      const message = String(err?.message ?? 'Unable to resend code. Please try again.');
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordError('');

    if (!password.trim()) {
      const msg = 'Please enter a new password';
      setPasswordError(msg);
      notify(msg, 'error');
      return;
    }

    if (!isPasswordValid) {
      const msg = 'Password must have 8+ characters, uppercase/lowercase letters, and a number';
      setPasswordError(msg);
      notify(msg, 'error');
      return;
    }

    if (!isConfirmMatching) {
      const msg = 'Passwords do not match';
      setPasswordError(msg);
      notify(msg, 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setStep('success');
      notify('Password updated successfully.', 'success');
    } catch (err: any) {
      const message = String(err?.message ?? 'Unable to update password. Please try again.');
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

      <Text style={[styles.title, { color: colors.title }]}>Forgot your password?</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>No worries! Enter your email and we will send you a recovery code.</Text>

      <Text style={[styles.label, { color: colors.title }]}>Email Address</Text>
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
          placeholder="you@example.com"
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
            <Text style={styles.primaryBtnText}>Sending...</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <Text style={styles.primaryBtnText}>Send Code</Text>
            <Feather name="arrow-right" size={18} color="#001018" />
          </View>
        )}
      </Pressable>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Remember your password?{' '}
          <Text onPress={backToSignIn} style={{ color: ExploreEaseColors.primary, fontWeight: '800' }}>
            Sign in
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

      <Text style={[styles.title, { color: colors.title }]}>Enter the verification code</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>We sent a 6-digit code to {maskEmail(email)}</Text>

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
            <Text style={styles.primaryBtnText}>Verifying...</Text>
          </View>
        ) : (
          <Text style={styles.primaryBtnText}>Verify Code</Text>
        )}
      </Pressable>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>Didn&apos;t receive the code?</Text>
        <Pressable
          onPress={() => void handleResendOtp()}
          disabled={loading || resendTimer > 0}
          style={({ pressed }) => [pressed ? { opacity: 0.82 } : null]}
          accessibilityRole="button"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="restore" size={16} color={ExploreEaseColors.primary} />
            <Text style={{ color: ExploreEaseColors.primary, fontSize: 13, fontWeight: '700', opacity: loading || resendTimer > 0 ? 0.5 : 1 }}>
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={[styles.noteCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }]}>
        <Text style={[styles.noteText, { color: colors.muted }]}>The code expires in 10 minutes. If you need help, contact support.</Text>
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

      <Text style={[styles.title, { color: colors.title }]}>Create a new password</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Make it strong to protect your account</Text>

      <Text style={[styles.label, { color: colors.title }]}>New Password</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
        <MaterialCommunityIcons name="lock-outline" size={20} color={colors.muted} />
        <TextInput
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError('');
          }}
          secureTextEntry={!showPassword}
          placeholder="Enter new password"
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
            <PasswordRuleRow met={password.length >= 8} text="At least 8 characters" colors={colors} />
            <PasswordRuleRow met={/[A-Z]/.test(password) && /[a-z]/.test(password)} text="Uppercase and lowercase letters" colors={colors} />
            <PasswordRuleRow met={/\d/.test(password)} text="At least one number" colors={colors} />
          </View>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.title }]}>Confirm Password</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}> 
        <MaterialCommunityIcons name="lock-outline" size={20} color={colors.muted} />
        <TextInput
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setPasswordError('');
          }}
          secureTextEntry={!showConfirmPassword}
          placeholder="Confirm password"
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
            {isConfirmMatching ? 'Passwords match' : 'Passwords do not match'}
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
            <Text style={styles.primaryBtnText}>Updating...</Text>
          </View>
        ) : (
          <Text style={styles.primaryBtnText}>Update Password</Text>
        )}
      </Pressable>

      <View style={[styles.noteCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }]}>
        <Text style={[styles.noteText, { color: colors.muted }]}>Your password is encrypted and protected with industry-leading security standards.</Text>
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

      <Text style={[styles.title, { color: colors.title, textAlign: 'center' }]}>Password reset!</Text>
      <Text style={[styles.subtitle, { color: colors.muted, textAlign: 'center' }]}>Your password has been updated successfully. Please sign in with your new password.</Text>

      <Pressable
        onPress={backToSignIn}
        style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.86 } : null]}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>Back to Sign In</Text>
      </Pressable>

      <View style={[styles.noteCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }]}>
        <Text style={[styles.noteText, { color: colors.muted }]}>If you didn&apos;t make this change, please contact support immediately.</Text>
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
            Step {Math.min(progressStep, 3)} of 3
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step === 'email' ? renderEmailStep() : null}
          {step === 'otp' ? renderOtpStep() : null}
          {step === 'password' ? renderPasswordStep() : null}
          {step === 'success' ? renderSuccessStep() : null}

          <View style={[styles.footerWrap, { borderColor: colors.border }]}>
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
              Need help?{' '}
              <Text style={{ color: ExploreEaseColors.primary, fontWeight: '700' }}>Contact support</Text>
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
