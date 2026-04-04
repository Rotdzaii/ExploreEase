import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useI18n } from '@/src/i18n/useI18n';

type ReviewFormProps = {
  isDark: boolean;
  scale: (value: number) => number;
  rating: number;
  comment: string;
  photoUris: string[];
  maxPhotos: number;
  submitting: boolean;
  uploadingPhotos: boolean;
  onChangeRating: (value: number) => void;
  onChangeComment: (value: string) => void;
  onPickPhotos: () => void;
  onRemovePhoto: (uri: string) => void;
  onSubmit: () => void;
};

export function ReviewForm({
  isDark,
  scale,
  rating,
  comment,
  photoUris,
  maxPhotos,
  submitting,
  uploadingPhotos,
  onChangeRating,
  onChangeComment,
  onPickPhotos,
  onRemovePhoto,
  onSubmit,
}: ReviewFormProps) {
  const { t } = useI18n();
  const muted = isDark ? 'rgba(148,163,184,0.82)' : 'rgba(71,85,105,0.62)';
  const text = isDark ? '#f8fafc' : '#0f172a';

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: scale(16),
          padding: scale(14),
          marginTop: scale(12),
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.12)',
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
        },
      ]}
    >
      <Text style={[styles.label, { fontSize: scale(12), color: muted }]}>{t('review.form.rating')}</Text>
      <View style={[styles.starsRow, { marginTop: scale(8) }]}>
        {Array.from({ length: 5 }).map((_, idx) => {
          const value = idx + 1;
          const filled = value <= rating;
          return (
            <Pressable
              key={value}
              onPress={() => onChangeRating(value)}
              style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={filled ? 'star' : 'star-outline'}
                size={scale(22)}
                color={ExploreEaseColors.primary}
              />
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { fontSize: scale(12), marginTop: scale(12), color: muted }]}>{t('review.form.comment')}</Text>
      <TextInput
        value={comment}
        onChangeText={onChangeComment}
        placeholder={t('review.form.commentPlaceholder')}
        placeholderTextColor={isDark ? 'rgba(148,163,184,0.65)' : 'rgba(71,85,105,0.55)'}
        multiline
        style={[
          styles.commentInput,
          {
            minHeight: scale(88),
            borderRadius: scale(14),
            padding: scale(12),
            fontSize: scale(13),
            color: text,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
          },
        ]}
      />

      <Text style={[styles.label, { fontSize: scale(12), marginTop: scale(12), color: muted }]}>{t('review.form.photos')}</Text>
      <Pressable
        onPress={onPickPhotos}
        style={({ pressed, hovered }) => [
          styles.pickPhotoBtn,
          {
            marginTop: scale(8),
            minHeight: scale(40),
            borderRadius: scale(12),
            paddingHorizontal: scale(12),
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
          },
          Platform.OS === 'web' && hovered ? { opacity: 0.96 } : null,
          pressed ? { opacity: 0.84 } : null,
        ]}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="image-plus" size={scale(16)} color={ExploreEaseColors.primary} />
        <Text style={{ fontWeight: '800', fontSize: scale(12), color: text }}>
          {photoUris.length > 0
            ? t('review.form.selectedPhotos', { count: photoUris.length, max: maxPhotos })
            : t('review.form.pickPhotos')}
        </Text>
      </Pressable>

      {photoUris.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scale(8), marginTop: scale(8) }}>
          {photoUris.map((uri) => (
            <View key={uri} style={{ position: 'relative' }}>
              <Image
                source={{ uri }}
                style={{
                  width: scale(70),
                  height: scale(70),
                  borderRadius: scale(10),
                  backgroundColor: 'rgba(15,23,42,0.08)',
                }}
              />
              <Pressable
                onPress={() => onRemovePhoto(uri)}
                style={({ pressed }) => [
                  {
                    position: 'absolute',
                    top: -scale(5),
                    right: -scale(5),
                    width: scale(22),
                    height: scale(22),
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ef4444',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.75)',
                  },
                  pressed ? { opacity: 0.84 } : null,
                ]}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="close" size={scale(12)} color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Pressable
        onPress={onSubmit}
        disabled={submitting || uploadingPhotos}
        style={({ pressed, hovered }) => [
          styles.submitBtn,
          { height: scale(44), borderRadius: scale(14), marginTop: scale(12) },
          Platform.OS === 'web' && hovered ? { opacity: 0.96 } : null,
          pressed ? { opacity: 0.86 } : null,
          submitting || uploadingPhotos ? { opacity: 0.7 } : null,
        ]}
        accessibilityRole="button"
      >
        <Text style={[styles.submitText, { fontSize: scale(14) }]}>
          {submitting
            ? (uploadingPhotos ? t('review.form.uploading') : t('review.form.submitting'))
            : t('review.form.submit')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  label: {
    fontWeight: '900',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    marginTop: 8,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  pickPhotoBtn: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtn: {
    backgroundColor: ExploreEaseColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: {
    color: ExploreEaseColors.background,
    fontWeight: '900',
  },
});
