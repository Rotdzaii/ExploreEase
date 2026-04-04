import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useI18n } from '@/src/i18n/useI18n';

type ReviewCardProps = {
  isDark: boolean;
  scale: (value: number) => number;
  reviewerName: string;
  avatarUrl?: string | null;
  rating: number;
  comment?: string | null;
  createdAt?: string | null;
  imageUrls?: string[];
  helpfulCount: number;
  isHelpful: boolean;
  helpfulLoading: boolean;
  canReply: boolean;
  replyText?: string | null;
  replyDraft: string;
  replyLoading: boolean;
  onChangeReplyDraft: (value: string) => void;
  onSubmitReply: () => void;
  onToggleHelpful: () => void;
  onReport: () => void;
};

const formatReviewDate = (value: string | null | undefined, locale: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale);
};

export function ReviewCard({
  isDark,
  scale,
  reviewerName,
  avatarUrl,
  rating,
  comment,
  createdAt,
  imageUrls = [],
  helpfulCount,
  isHelpful,
  helpfulLoading,
  canReply,
  replyText,
  replyDraft,
  replyLoading,
  onChangeReplyDraft,
  onSubmitReply,
  onToggleHelpful,
  onReport,
}: ReviewCardProps) {
  const { t, language } = useI18n();
  const cardBg = isDark ? 'rgba(255,255,255,0.92)' : '#ffffff';
  const cardBorder = 'rgba(15, 23, 42, 0.10)';
  const reviewDateText = formatReviewDate(createdAt, language === 'en' ? 'en-US' : 'vi-VN');

  return (
    <View
      style={[
        styles.reviewCard,
        {
          borderRadius: scale(16),
          padding: scale(14),
          marginHorizontal: scale(16),
          backgroundColor: cardBg,
          borderColor: cardBorder,
        },
      ]}
    >
      <View style={styles.reviewTopRow}>
        <View
          style={[
            styles.avatarWrap,
            {
              width: scale(40),
              height: scale(40),
              borderRadius: scale(20),
              borderColor: 'rgba(15, 23, 42, 0.10)',
              backgroundColor: 'rgba(15, 23, 42, 0.04)',
            },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: scale(20) }} />
          ) : (
            <View style={{ flex: 1, borderRadius: scale(20), backgroundColor: 'rgba(15, 23, 42, 0.10)' }} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: '#020617', fontWeight: '900', fontSize: scale(14) }} numberOfLines={1}>
            {reviewerName}
          </Text>
          <View style={styles.reviewStarsRow}>
            <View style={styles.starsRow}>
              {Array.from({ length: 5 }).map((_, idx) => {
                const filled = idx < Math.round(rating);
                return (
                  <MaterialCommunityIcons
                    key={idx}
                    name={filled ? 'star' : 'star-outline'}
                    size={scale(14)}
                    color={ExploreEaseColors.primary}
                  />
                );
              })}
            </View>
            <Text style={{ color: '#020617', fontWeight: '800', fontSize: scale(12) }}>
              {Number(rating).toFixed(1)}
            </Text>
          </View>
        </View>

        {reviewDateText ? (
          <Text style={{ fontWeight: '700', fontSize: scale(11), color: 'rgba(15,23,42,0.56)' }}>
            {reviewDateText}
          </Text>
        ) : null}
      </View>

      {comment ? (
        <Text style={{ color: '#020617', fontWeight: '700', fontSize: scale(13), marginTop: scale(10), lineHeight: scale(18) }}>
          {comment}
        </Text>
      ) : (
        <Text style={{ color: '#020617', fontWeight: '700', fontSize: scale(13), marginTop: scale(10), opacity: 0.6 }}>
          {t('review.card.noComment')}
        </Text>
      )}

      {imageUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scale(8), marginTop: scale(10) }}>
          {imageUrls.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{
                width: scale(82),
                height: scale(82),
                borderRadius: scale(10),
                backgroundColor: 'rgba(15,23,42,0.06)',
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.reviewActionsRow, { marginTop: scale(10) }]}>
        <Pressable
          onPress={onToggleHelpful}
          disabled={helpfulLoading}
          style={({ pressed }) => [
            styles.reviewActionBtn,
            isHelpful ? styles.reviewActionBtnActive : null,
            helpfulLoading ? { opacity: 0.65 } : null,
            pressed ? { opacity: 0.82 } : null,
          ]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={isHelpful ? 'thumb-up' : 'thumb-up-outline'}
            size={scale(14)}
            color={isHelpful ? '#0369a1' : '#334155'}
          />
          <Text style={[styles.reviewActionText, isHelpful ? { color: '#0369a1' } : null]}>
            {t('review.card.helpful', { count: helpfulCount })}
          </Text>
        </Pressable>

        <Pressable
          onPress={onReport}
          style={({ pressed }) => [styles.reviewActionBtn, pressed ? { opacity: 0.82 } : null]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="flag-outline" size={scale(14)} color="#b91c1c" />
          <Text style={[styles.reviewActionText, { color: '#b91c1c' }]}>{t('review.card.report')}</Text>
        </Pressable>
      </View>

      {replyText ? (
        <View style={[styles.replyCard, { marginTop: scale(10), borderRadius: scale(10), padding: scale(10) }]}>
          <Text style={{ fontWeight: '900', fontSize: scale(12), color: '#0369a1' }}>
            {t('review.card.replyAdmin')}
          </Text>
          <Text style={{ marginTop: scale(4), fontWeight: '700', fontSize: scale(12), color: '#0f172a', lineHeight: scale(18) }}>
            {replyText}
          </Text>
        </View>
      ) : null}

      {canReply ? (
        <View style={{ marginTop: scale(10), gap: scale(8) }}>
          <Text style={{ fontWeight: '800', fontSize: scale(12), color: 'rgba(15,23,42,0.62)' }}>
            {replyText ? t('review.card.replyEdit') : t('review.card.replyCreate')}
          </Text>
          <TextInput
            value={replyDraft}
            onChangeText={onChangeReplyDraft}
            placeholder={replyText ? t('review.card.replyPlaceholderEdit') : t('review.card.replyPlaceholderCreate')}
            placeholderTextColor="rgba(71,85,105,0.55)"
            multiline
            style={{
              minHeight: scale(64),
              borderRadius: scale(10),
              borderWidth: 1,
              borderColor: 'rgba(15,23,42,0.12)',
              backgroundColor: 'rgba(15,23,42,0.03)',
              paddingHorizontal: scale(10),
              paddingVertical: scale(8),
              fontSize: scale(12),
              fontWeight: '600',
              color: '#0f172a',
              textAlignVertical: 'top',
            }}
          />

          <Pressable
            onPress={onSubmitReply}
            disabled={replyLoading || !replyDraft.trim()}
            style={({ pressed }) => [
              styles.replySubmitBtn,
              replyLoading || !replyDraft.trim() ? { opacity: 0.65 } : null,
              pressed ? { opacity: 0.82 } : null,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.replySubmitText}>
              {replyLoading
                ? t('review.card.replySending')
                : replyText
                  ? t('review.card.replySubmitEdit')
                  : t('review.card.replySubmitCreate')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reviewCard: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reviewActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewActionBtn: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewActionBtnActive: {
    borderColor: 'rgba(3,105,161,0.35)',
    backgroundColor: 'rgba(3,105,161,0.10)',
  },
  reviewActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  replyCard: {
    borderWidth: 1,
    borderColor: 'rgba(3,105,161,0.28)',
    backgroundColor: 'rgba(3,105,161,0.08)',
  },
  replySubmitBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: ExploreEaseColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySubmitText: {
    color: '#001018',
    fontSize: 12,
    fontWeight: '900',
  },
});
