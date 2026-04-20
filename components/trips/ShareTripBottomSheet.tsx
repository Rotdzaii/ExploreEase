import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { Feather } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, Keyboard, Platform, Pressable, Share as RNShare, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

// react-native-share may not work in Expo Go; keep a safe fallback.
let NativeShare: typeof import('react-native-share') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeShare = require('react-native-share');
} catch {
  NativeShare = null;
}

type ShareTripBottomSheetProps = {
  isOpen: boolean;
  tripName: string;
  tripCode: string;
  onClose: () => void;
};

const releaseOverlayTriggerFocus = () => {
  Keyboard.dismiss();

  if (Platform.OS !== 'web') return;

  try {
    const activeElement = (globalThis as any)?.document?.activeElement as { blur?: () => void } | null | undefined;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur();
    }
  } catch {
    // Ignore focus release failures on unsupported environments.
  }
};

export function ShareTripBottomSheet({ isOpen, tripName, tripCode, onClose }: ShareTripBottomSheetProps) {
  const { isDark } = useTheme();
  const { t } = useI18n();
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ['48%'], []);

  const colors = useMemo(
    () => ({
      bg: isDark ? 'rgba(26, 38, 55, 0.98)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15, 23, 42, 0.04)',
    }),
    [isDark]
  );

  React.useEffect(() => {
    if (!sheetRef.current) return;
    if (isOpen) {
      releaseOverlayTriggerFocus();
      sheetRef.current.snapToIndex(0);
    }
    else sheetRef.current.close();
  }, [isOpen]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleShare = useCallback(async () => {
    const message = t('trips.share.message', { tripName, tripCode });

    try {
      if (NativeShare?.default?.open) {
        await NativeShare.default.open({ message });
        return;
      }

      await RNShare.share({ message });
    } catch (err: any) {
      // user cancelled -> ignore
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('cancel')) return;
      Alert.alert(t('trips.share.failedTitle'), t('trips.error.tryAgainLater'));
    }
  }, [t, tripCode, tripName]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.bg }}
      handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.18)' }}
    >
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.title }]}>{t('trips.share.title')}</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed, hovered }) => [
              styles.closeBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              hovered ? { opacity: 0.95 } : null,
              pressed ? { opacity: 0.8 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('trips.share.close')}
          >
            <Feather name="x" size={18} color={colors.title} />
          </Pressable>
        </View>

        <Text style={[styles.subtitle, { color: colors.subtitle }]} numberOfLines={2}>
          {t('trips.share.subtitle')}
        </Text>

        <View style={[styles.qrCard, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
          <QRCode value={tripCode} size={150} />
          <Text style={[styles.codeText, { color: '#0f172a' }]}>{tripCode}</Text>
        </View>

        <Pressable
          onPress={() => void handleShare()}
          style={({ pressed, hovered }) => [
            styles.shareBtn,
            { backgroundColor: ExploreEaseColors.primary },
            hovered ? { opacity: 0.95 } : null,
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityRole="button"
        >
          <Feather name="share-2" size={18} color="#001018" />
          <Text style={styles.shareText}>{t('trips.share.action')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  qrCard: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  codeText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  shareBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
  },
});
