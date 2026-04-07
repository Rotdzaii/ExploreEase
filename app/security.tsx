import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { authService, type TotpEnrollmentResult } from '@/src/services/authService';
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export default function SecurityScreen() {
  const { isDark } = useTheme();
  const { t } = useI18n();

  const [enrollment, setEnrollment] = useState<TotpEnrollmentResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(t('security.error.missingEnrollment'));
      return;
    }

    const normalizedCode = otpCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setErrorMessage(t('security.error.invalidCode'));
      return;
    }

    setIsVerifying(true);
    try {
      await authService.verifyMfaTotp({
        factorId: enrollment.factorId,
        code: normalizedCode,
      });

      setIsVerified(true);
      setStatusMessage(t('security.success.verified'));
    } catch (error: any) {
      const reason = String(error?.message ?? '').trim() || t('security.error.verifyFailed');
      setErrorMessage(`${t('security.error.verifyFailed')} ${reason}`);
      setIsVerified(false);
    } finally {
      setIsVerifying(false);
    }
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
              onChangeText={setOtpCode}
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

            <Pressable
              onPress={handleVerify}
              disabled={isVerifying || !enrollment}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: ExploreEaseColors.primary,
                  opacity: isVerifying || !enrollment ? 0.7 : (pressed ? 0.86 : 1),
                },
              ]}
              accessibilityRole="button"
            >
              {isVerifying ? <ActivityIndicator color="#001018" /> : <Feather name="check-circle" size={16} color="#001018" />}
              <Text style={styles.primaryButtonText}>
                {isVerifying ? t('security.verify.loading') : t('security.verify.action')}
              </Text>
            </Pressable>

            {isVerified ? (
              <View style={styles.verifiedRow}>
                <Feather name="shield" size={16} color={colors.success} />
                <Text style={[styles.verifiedText, { color: colors.success }]}>{t('security.success.verified')}</Text>
              </View>
            ) : null}
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
});
