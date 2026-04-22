import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useMemo } from 'react';
import { Alert, Modal, Pressable, Share as RNShare, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

let NativeShare: typeof import('react-native-share') | null = null;
try {
  NativeShare = require('react-native-share');
} catch {
  NativeShare = null;
}

type QrShareModalProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  qrValue: string;
  shareMessage: string;
  onClose: () => void;
};

export function QrShareModal({
  visible,
  title,
  subtitle,
  qrValue,
  shareMessage,
  onClose,
}: QrShareModalProps) {
  const { isDark } = useTheme();

  const colors = useMemo(
    () => ({
      backdrop: 'rgba(2, 6, 23, 0.56)',
      card: isDark ? 'rgba(15, 23, 42, 0.98)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
    }),
    [isDark]
  );

  const handleShare = useCallback(async () => {
    try {
      if (NativeShare?.default?.open) {
        await NativeShare.default.open({ message: shareMessage });
      } else {
        await RNShare.share({ message: shareMessage });
      }
    } catch (error: any) {
      console.warn('QrShareModal handleShare failed:', error?.message ?? error);
      Alert.alert('Không thể chia sẻ', 'Vui lòng thử lại sau.');
    }
  }, [shareMessage]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.backdrop }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.title }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.iconBtn, { borderColor: colors.border }, pressed ? { opacity: 0.84 } : null]}
              accessibilityRole="button"
              accessibilityLabel="Đóng chia sẻ QR"
            >
              <Feather name="x" size={18} color={colors.title} />
            </Pressable>
          </View>

          <View style={[styles.qrCard, { borderColor: colors.border }]}>
            <QRCode value={qrValue} size={176} />
          </View>

          <Text style={[styles.urlText, { color: colors.text }]} numberOfLines={2}>
            {qrValue}
          </Text>

          <View style={styles.actionRow}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' },
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Đóng</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleShare()}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
            >
              <Feather name="share-2" size={16} color="#ffffff" />
              <Text style={styles.primaryBtnText}>Chia sẻ QR</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCard: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    padding: 18,
  },
  urlText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  primaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: ExploreEaseColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
});
