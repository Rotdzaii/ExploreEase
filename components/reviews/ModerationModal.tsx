import React from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    Text,
    TextInput,
    View,
} from 'react-native';

import { useI18n } from '@/src/i18n/useI18n';

type ModerationModalProps = {
  visible: boolean;
  isDark: boolean;
  reason: string;
  submitting: boolean;
  onClose: () => void;
  onChangeReason: (value: string) => void;
  onSubmit: () => void;
  title?: string;
  description?: string;
  submitLabel?: string;
};

export function ModerationModal({
  visible,
  isDark,
  reason,
  submitting,
  onClose,
  onChangeReason,
  onSubmit,
  title,
  description,
  submitLabel,
}: ModerationModalProps) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t('review.report.title');
  const resolvedDescription = description ?? t('review.report.description');
  const resolvedSubmitLabel = submitLabel ?? t('review.report.submit');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18,
        }}
      >
        <Pressable
          onPress={() => void 0}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.10)',
            backgroundColor: isDark ? 'rgba(26, 38, 55, 0.98)' : '#ffffff',
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a' }}>
            {resolvedTitle}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b', lineHeight: 18 }}>
            {resolvedDescription}
          </Text>

          <TextInput
            value={reason}
            onChangeText={onChangeReason}
            placeholder={t('review.report.placeholder')}
            placeholderTextColor={isDark ? 'rgba(148,163,184,0.72)' : 'rgba(71,85,105,0.55)'}
            multiline
            style={{
              minHeight: 96,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
              color: isDark ? '#ffffff' : '#0f172a',
              fontSize: 13,
              fontWeight: '600',
              paddingHorizontal: 12,
              paddingVertical: 10,
              textAlignVertical: 'top',
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: submitting ? 0.7 : 1,
                },
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={{ fontWeight: '800', fontSize: 13, color: isDark ? '#ffffff' : '#0f172a' }}>
                {t('common.cancel')}
              </Text>
            </Pressable>

            <Pressable
              onPress={onSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#ef4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: submitting ? 0.7 : 1,
                },
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ fontWeight: '900', fontSize: 13, color: '#ffffff' }}>{resolvedSubmitLabel}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
