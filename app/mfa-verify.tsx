import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { authService } from '@/src/services/authService';
import { supabase } from '@/src/services/supabase';
import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const AAL2_SYNC_MAX_ATTEMPTS = 12;
const AAL2_SYNC_DELAY_MS = 180;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export default function MfaVerifyScreen() {
  const { isDark } = useTheme();
  const { factorId: factorIdParam } = useLocalSearchParams<{ factorId?: string | string[] }>();
  const mountedRef = useRef(true);

  const initialFactorId = useMemo(
    () => (Array.isArray(factorIdParam) ? String(factorIdParam[0] ?? '').trim() : String(factorIdParam ?? '').trim()),
    [factorIdParam]
  );

  const [factorId, setFactorId] = useState(initialFactorId);
  const [otpCode, setOtpCode] = useState('');
  const [resolvingFactor, setResolvingFactor] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      cardBg: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      inputBg: isDark ? 'rgba(255,255,255,0.07)' : '#ffffff',
      inputText: isDark ? '#e2e8f0' : '#0f172a',
    }),
    [isDark]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const ensureFactorId = async () => {
      if (factorId) return;

      setResolvingFactor(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error || !data.session) {
          router.replace('/login');
          return;
        }

        const gate = await authService.getMfaGateInfo(data.session.user ?? null);
        if (!alive) return;

        if (!gate.requiresMfa) {
          router.replace('/(tabs)');
          return;
        }

        if (gate.factorId) {
          setFactorId(gate.factorId);
        }
      } catch (error: any) {
        if (!alive) return;
        const reason = String(error?.message ?? '').trim() || 'Unable to initialize OTP verification.';
        Alert.alert('2FA required', reason);
      } finally {
        if (alive) {
          setResolvingFactor(false);
        }
      }
    };

    void ensureFactorId();

    return () => {
      alive = false;
    };
  }, [factorId]);

  const onVerifyOtp = async () => {
    const normalizedCode = otpCode.replace(/\s+/g, '').trim();
    if (!factorId) {
      Alert.alert('2FA required', 'No MFA factor was found for this account.');
      return;
    }

    if (!/^\d{6}$/.test(normalizedCode)) {
      Alert.alert('Invalid code', 'Please enter a valid 6-digit OTP code.');
      return;
    }

    setVerifying(true);
    try {
      await authService.challengeAndVerifyTotp({
        factorId,
        code: normalizedCode,
      });

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      let isAal2Ready = false;
      for (let attempt = 0; attempt < AAL2_SYNC_MAX_ATTEMPTS; attempt += 1) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('mfa-verify getSession during AAL sync failed:', sessionError.message);
        }

        const gate = await authService.getMfaGateInfo(sessionData.session?.user ?? null);
        if (!gate.requiresMfa && gate.assuranceLevel === 'aal2') {
          isAal2Ready = true;
          break;
        }

        await delay(AAL2_SYNC_DELAY_MS);
      }

      if (!isAal2Ready) {
        throw new Error('Session is still syncing MFA state. Please try again.');
      }

      // Small buffer so AuthContext/onAuthStateChange can consume the AAL2 session before navigation.
      await delay(150);
      if (!mountedRef.current) return;

      router.replace('/(tabs)');
    } catch (error: any) {
      const reason = String(error?.message ?? '').trim() || 'OTP verification failed. Please try again.';
      Alert.alert('Verification failed', reason);
    } finally {
      if (mountedRef.current) {
        setVerifying(false);
      }
    }
  };

  const onCancel = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace('/login');
    }
  };

  const canVerify = /^\d{6}$/.test(otpCode.replace(/\s+/g, '').trim()) && !!factorId && !verifying;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.iconWrap}>
              <Feather name="shield" size={22} color={ExploreEaseColors.primary} />
            </View>

            <Text style={[styles.title, { color: colors.title }]}>Two-Factor Verification</Text>
            <Text style={[styles.subtitle, { color: colors.subtitle }]}>Enter the 6-digit code from your authenticator app to complete login.</Text>

            <TextInput
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="123456"
              placeholderTextColor={colors.subtitle}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.inputText,
                },
              ]}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              autoFocus
            />

            {resolvingFactor ? (
              <View style={styles.infoRow}>
                <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
                <Text style={[styles.infoText, { color: colors.subtitle }]}>Checking MFA factors...</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void onVerifyOtp()}
              disabled={!canVerify}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: canVerify ? ExploreEaseColors.primary : 'rgba(148,163,184,0.4)',
                  opacity: pressed ? 0.86 : 1,
                },
              ]}
            >
              {verifying ? (
                <ActivityIndicator size="small" color="#001018" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify and Continue</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => void onCancel()}
              style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.86 : 1 }]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.subtitle }]}>Cancel login</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,163,74,0.15)',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 2,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
