import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useAuth } from '@/src/context/auth';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { authService, type TotpEnrollmentResult } from '@/src/services/authService';
import { supabase } from '@/src/services/supabase';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const BIOMETRIC_LOCK_STORAGE_KEY = 'exploreease.security.biometricLockEnabled';

export default function SecurityScreen() {
  const { session } = useAuth();
  const { isDark } = useTheme();
  const { t } = useI18n();

  const [enrollment, setEnrollment] = useState<TotpEnrollmentResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [biometricLockEnabled, setBiometricLockEnabled] = useState(false);
  const [loadingBiometricLock, setLoadingBiometricLock] = useState(true);
  const [updatingBiometricLock, setUpdatingBiometricLock] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [sessionRemainingMs, setSessionRemainingMs] = useState<number | null>(null);

  const normalizedOtpCode = otpCode.trim().replace(/\s+/g, '').trim();
  const canSubmitVerify = Boolean(enrollment?.factorId) && /^\d{6}$/.test(normalizedOtpCode);

  const sessionCountdownText = useMemo(() => {
    if (sessionRemainingMs == null) return '--:--';

    const totalSeconds = Math.max(0, Math.floor(sessionRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [sessionRemainingMs]);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      cardBg: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
      softCardBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15, 23, 42, 0.04)',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.09)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      text: isDark ? '#e2e8f0' : '#0f172a',
      inputBg: isDark ? 'rgba(15, 23, 42, 0.58)' : '#ffffff',
      success: '#16a34a',
      error: '#ef4444',
    }),
    [isDark]
  );

  const sessionTimerAccentColor =
    sessionRemainingMs == null
      ? colors.subtitle
      : sessionRemainingMs <= 60_000
        ? colors.error
        : sessionRemainingMs <= 300_000
          ? '#f59e0b'
          : colors.text;

  React.useEffect(() => {
    if (!session?.expires_at) {
      setSessionRemainingMs(null);
      return;
    }

    const expiresAtMs = Number(session.expires_at) * 1000;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
      setSessionRemainingMs(null);
      return;
    }

    const updateCountdown = () => {
      setSessionRemainingMs(Math.max(0, expiresAtMs - Date.now()));
    };

    updateCountdown();
    const timerId = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [session?.expires_at]);

  const handleEnroll = async () => {
    if (isEnrolling) return;

    setIsEnrolling(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await authService.enrollMfaTotp();
      setEnrollment(result);
      setOtpCode('');
      setIsVerified(false);
      setStatusMessage(t('security.success.enrolled'));
    } catch (error: any) {
      const reason = String(error?.message ?? '').trim() || t('security.error.enrollFailed');
      setErrorMessage(`${t('security.error.enrollFailed')} ${reason}`);
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleVerify = async () => {
    if (isVerifying) return;

    setErrorMessage(null);
    setStatusMessage(null);

    if (!enrollment?.factorId) {
      const message = t('security.error.missingEnrollment');
      setErrorMessage(message);
      Alert.alert(t('security.title'), message);
      return;
    }

    const normalizedCode = otpCode.trim().replace(/\s+/g, '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      const message = t('security.error.invalidCode');
      setErrorMessage(message);
      Alert.alert(t('security.verify.title'), message);
      return;
    }

    setIsVerifying(true);
    try {
      await authService.verifyMfaTotp({
        factorId: enrollment.factorId,
        code: normalizedCode,
      });

      setIsVerified(true);
      const successMessage = t('security.success.verified');
      setStatusMessage(successMessage);
      Alert.alert(t('security.verify.title'), successMessage);
    } catch (error: any) {
      const reason = String(error?.message ?? '').trim() || t('security.error.verifyFailed');
      const errorMessageWithReason = `${t('security.error.verifyFailed')} ${reason}`;
      setErrorMessage(errorMessageWithReason);
      Alert.alert(t('security.verify.title'), errorMessageWithReason);
      setIsVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  React.useEffect(() => {
    let alive = true;

    const loadBiometricSetting = async () => {
      try {
        const raw = await AsyncStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY);
        if (!alive) return;
        setBiometricLockEnabled(raw === 'true');
      } catch {
        if (!alive) return;
        setBiometricLockEnabled(false);
      } finally {
        if (alive) {
          setLoadingBiometricLock(false);
        }
      }
    };

    void loadBiometricSetting();

    return () => {
      alive = false;
    };
  }, []);

  const handleToggleBiometricLock = async (nextValue: boolean) => {
    if (updatingBiometricLock || loadingBiometricLock) return;

    setUpdatingBiometricLock(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      if (nextValue) {
        if (Platform.OS === 'web') {
          throw new Error(t('security.biometric.notSupported'));
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) {
          throw new Error(t('security.biometric.notSupported'));
        }

        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) {
          throw new Error(t('security.biometric.notEnrolled'));
        }

        const authResult = await LocalAuthentication.authenticateAsync({
          promptMessage: t('security.biometric.promptMessage'),
          cancelLabel: t('common.cancel'),
          fallbackLabel: t('security.biometric.fallbackLabel'),
          disableDeviceFallback: false,
        });

        if (!authResult.success) {
          throw new Error(t('security.biometric.enableFailed'));
        }
      }

      await AsyncStorage.setItem(BIOMETRIC_LOCK_STORAGE_KEY, nextValue ? 'true' : 'false');
      setBiometricLockEnabled(nextValue);
      setStatusMessage(nextValue ? t('security.biometric.enabled') : t('security.biometric.disabled'));
    } catch (error: any) {
      const reason = String(error?.message ?? '').trim() || t('security.biometric.saveFailed');
      setErrorMessage(reason);
    } finally {
      setUpdatingBiometricLock(false);
    }
  };

  const performDeleteAccount = async () => {
    if (deletingAccount) return;

    setDeletingAccount(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;

      try {
        await supabase.auth.signOut();
      } catch {
        // Best-effort sign out after server-side account deletion.
      }

      router.replace('/login');
    } catch (error: any) {
      const reason = String(error?.message ?? '').trim();
      setErrorMessage(
        reason
          ? t('security.delete.errorWithReason', { reason })
          : t('security.delete.error')
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      t('security.delete.confirmTitle'),
      t('security.delete.confirmMessage'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('security.delete.confirmAction'),
          style: 'destructive',
          onPress: () => {
            void performDeleteAccount();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.softCardBg,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Feather name="chevron-left" size={18} color={colors.text} />
            <Text style={[styles.backButtonText, { color: colors.text }]}>{t('itinerary.back')}</Text>
          </Pressable>

          <Text style={[styles.title, { color: colors.title }]}>{t('security.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.subtitle }]}>{t('security.subtitle')}</Text>

          {statusMessage ? (
            <View style={[styles.banner, { borderColor: 'rgba(22,163,74,0.35)', backgroundColor: 'rgba(22,163,74,0.12)' }]}>
              <Text style={[styles.bannerText, { color: colors.success }]}>{statusMessage}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={[styles.banner, { borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.10)' }]}>
              <Text style={[styles.bannerText, { color: colors.error }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.sessionTimerHeader}>
              <View style={styles.sessionTimerTitleWrap}>
                <Text style={[styles.cardTitle, { color: colors.title }]}>Session Timer (Debug)</Text>
                <Text style={[styles.cardDescription, { color: colors.subtitle }]}>Remaining time until session expiration.</Text>
              </View>
              <Feather name="clock" size={18} color={sessionTimerAccentColor} />
            </View>

            <View
              style={[
                styles.sessionTimerValueWrap,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.softCardBg,
                },
              ]}
            >
              <Text style={[styles.sessionTimerValue, { color: sessionTimerAccentColor }]}>{sessionCountdownText}</Text>
              <Text style={[styles.sessionTimerHint, { color: colors.subtitle }]}>until session expiry</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.title }]}>{t('security.setup.title')}</Text>
            <Text style={[styles.cardDescription, { color: colors.subtitle }]}>{t('security.setup.description')}</Text>

            <Pressable
              onPress={handleEnroll}
              disabled={isEnrolling}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: ExploreEaseColors.primary,
                  opacity: isEnrolling ? 0.72 : (pressed ? 0.86 : 1),
                },
              ]}
              accessibilityRole="button"
            >
              {isEnrolling ? <ActivityIndicator color="#001018" /> : <Feather name="shield" size={16} color="#001018" />}
              <Text style={styles.primaryButtonText}>
                {isEnrolling ? t('security.setup.loading') : t('security.setup.action')}
              </Text>
            </Pressable>

            {enrollment ? (
              <View style={[styles.generatedWrap, { borderColor: colors.border, backgroundColor: colors.softCardBg }]}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <QRCode
                    value={enrollment.uri}
                    size={168}
                    color={isDark ? '#ffffff' : '#0f172a'}
                    backgroundColor={isDark ? '#0f172a' : '#ffffff'}
                  />
                </View>

                <Text style={[styles.fieldLabel, { color: colors.subtitle }]}>{t('security.secretLabel')}</Text>
                <Text selectable style={[styles.fieldValue, { color: colors.text }]}>{enrollment.secret}</Text>

                <Text style={[styles.fieldLabel, { color: colors.subtitle }]}>{t('security.uriLabel')}</Text>
                <Text selectable style={[styles.fieldUri, { color: colors.text }]}>{enrollment.uri}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.title }]}>{t('security.verify.title')}</Text>
            <Text style={[styles.cardDescription, { color: colors.subtitle }]}>{t('security.verify.description')}</Text>

            <Text style={[styles.inputLabel, { color: colors.subtitle }]}>{t('security.verify.codeLabel')}</Text>
            <TextInput
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/\s+/g, '').trim())}
              placeholder={t('security.verify.codePlaceholder')}
              placeholderTextColor={colors.subtitle}
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              maxLength={6}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                },
              ]}
            />

            <TouchableOpacity
              onPress={handleVerify}
              disabled={isVerifying || !canSubmitVerify}
              activeOpacity={0.86}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: ExploreEaseColors.primary,
                  opacity: isVerifying || !canSubmitVerify ? 0.7 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              {isVerifying ? <ActivityIndicator color="#001018" /> : <Feather name="check-circle" size={16} color="#001018" />}
              <Text style={styles.primaryButtonText}>
                {isVerifying ? t('security.verify.loading') : t('security.verify.action')}
              </Text>
            </TouchableOpacity>

            {isVerified ? (
              <View style={styles.verifiedRow}>
                <Feather name="shield" size={16} color={colors.success} />
                <Text style={[styles.verifiedText, { color: colors.success }]}>{t('security.success.verified')}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.cardTitle, { color: colors.title }]}>{t('security.biometric.title')}</Text>
                <Text style={[styles.cardDescription, { color: colors.subtitle }]}>{t('security.biometric.subtitle')}</Text>
              </View>

              <Switch
                value={biometricLockEnabled}
                onValueChange={(nextValue) => {
                  void handleToggleBiometricLock(nextValue);
                }}
                disabled={loadingBiometricLock || updatingBiometricLock}
                trackColor={{ false: Platform.OS === 'ios' ? '#e2e8f0' : '#cbd5e1', true: 'rgba(34,211,238,0.55)' }}
                thumbColor={Platform.OS === 'android' ? (biometricLockEnabled ? ExploreEaseColors.primary : '#ffffff') : undefined}
              />
            </View>

            {updatingBiometricLock ? (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
                <Text style={[styles.inlineStatusText, { color: colors.subtitle }]}>{t('security.biometric.updating')}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: 'rgba(239,68,68,0.30)' }]}>
            <Text style={[styles.cardTitle, { color: '#ef4444' }]}>{t('security.delete.title')}</Text>
            <Text style={[styles.cardDescription, { color: colors.subtitle }]}>{t('security.delete.description')}</Text>

            <Pressable
              onPress={confirmDeleteAccount}
              disabled={deletingAccount}
              style={({ pressed }) => [
                styles.dangerButton,
                {
                  opacity: deletingAccount ? 0.75 : (pressed ? 0.86 : 1),
                },
              ]}
              accessibilityRole="button"
            >
              {deletingAccount ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Feather name="trash-2" size={16} color="#ffffff" />
              )}
              <Text style={styles.dangerButtonText}>{t('security.delete.action')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  sessionTimerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionTimerTitleWrap: {
    flex: 1,
    gap: 2,
  },
  sessionTimerValueWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  sessionTimerValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  sessionTimerHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#001018',
    fontWeight: '900',
    fontSize: 13,
  },
  generatedWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  fieldUri: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '800',
  },
  inlineStatusRow: {
    marginTop: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dangerButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
});
