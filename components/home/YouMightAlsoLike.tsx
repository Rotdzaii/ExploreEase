import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import {
    type PersonalizedSuggestionItem,
    type TimeOfDay,
} from '@/src/services/recommendationService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import {
    ActivityIndicator,
    ImageBackground,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const FALLBACK_DESTINATION_IMAGE =
  'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=80';
const FALLBACK_EVENT_IMAGE =
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=80';

export type YouMightAlsoLikeItem = PersonalizedSuggestionItem & {
  displayPrice: string;
};

type YouMightAlsoLikeProps = {
  items: YouMightAlsoLikeItem[];
  loading: boolean;
  timeOfDay: TimeOfDay;
  travelStyle?: string | null;
  onPressItem: (item: YouMightAlsoLikeItem) => void;
  title?: string;
  subtitle?: string;
};

const resolveTravelStyleKey = (travelStyle?: string | null) => {
  if (!travelStyle) return null;

  const normalized = travelStyle.trim().toLowerCase();
  if (normalized.includes('family')) return 'recommendation.travelStyle.family';
  if (normalized.includes('group')) return 'recommendation.travelStyle.group';
  if (normalized.includes('solo')) return 'recommendation.travelStyle.solo';

  return null;
};

export function YouMightAlsoLike({
  items,
  loading,
  timeOfDay,
  travelStyle,
  onPressItem,
  title,
  subtitle,
}: YouMightAlsoLikeProps) {
  const { isDark } = useTheme();
  const { t } = useI18n();
  const resolvedTitle = title ?? t('recommendation.suggestions.title');

  const palette = useMemo(
    () => ({
      title: isDark ? '#ffffff' : '#0f172a',
      sub: isDark ? '#94a3b8' : '#64748b',
      cardBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
      sectionBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.74)',
    }),
    [isDark]
  );

  const derivedSubtitle = useMemo(() => {
    // Dynamic i18n key: keep recommendation.timing.{auto,morning,afternoon,evening,night} in translations.ts.
    const timeOfDayLabel = t(`recommendation.timing.${timeOfDay}`);
    const travelStyleKey = resolveTravelStyleKey(travelStyle);
    if (!travelStyleKey) {
      return t('recommendation.suggestions.subtitleTailored', { timeOfDay: timeOfDayLabel });
    }

    return t('recommendation.suggestions.subtitleTailoredWithStyle', {
      timeOfDay: timeOfDayLabel,
      travelStyle: t(travelStyleKey),
    });
  }, [t, timeOfDay, travelStyle]);

  return (
    <View style={[styles.sectionWrap, { backgroundColor: palette.sectionBg, borderColor: palette.cardBorder }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: palette.title }]}>{resolvedTitle}</Text>
        <Text style={[styles.sectionSubtitle, { color: palette.sub }]}>{subtitle ?? derivedSubtitle}</Text>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: palette.sub }]}>{t('recommendation.suggestions.loading')}</Text>
        </View>
      ) : null}

      {!loading && items.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: palette.sub }]}>{t('recommendation.suggestions.empty')}</Text>
        </View>
      ) : null}

      {!loading && items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {items.map((item) => {
            const imageUrl = item.imageUrl || (item.kind === 'event' ? FALLBACK_EVENT_IMAGE : FALLBACK_DESTINATION_IMAGE);

            return (
              <Pressable
                key={`${item.kind}:${item.id}`}
                onPress={() => onPressItem(item)}
                style={({ pressed }) => [styles.card, { borderColor: palette.cardBorder }, pressed ? { opacity: 0.9 } : null]}
                accessibilityRole="button"
              >
                <ImageBackground source={{ uri: imageUrl }} style={styles.image} imageStyle={styles.imageInner}>
                  <LinearGradient
                    colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.74)']}
                    style={StyleSheet.absoluteFill}
                  />

                  <View style={styles.topBadgeRow}>
                    <View style={styles.kindBadge}>
                      <Text style={styles.kindBadgeText}>
                        {item.kind === 'event' ? t('recommendation.suggestions.kindEvent') : t('recommendation.suggestions.kindPlace')}
                      </Text>
                    </View>
                    {item.category ? (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText} numberOfLines={1}>{item.category}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.bodyWrap}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.locRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={13} color={'rgba(226,232,240,0.95)'} />
                      <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
                    </View>

                    <View style={styles.bottomRow}>
                      <Text style={styles.priceText}>{item.displayPrice}</Text>
                      {typeof item.rating === 'number' ? (
                        <View style={styles.ratingPill}>
                          <MaterialCommunityIcons name="star" size={12} color={ExploreEaseColors.primary} />
                          <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.reasonText} numberOfLines={1}>
                      {item.recommendationReasons[0] || t('recommendation.suggestions.reasonFallback')}
                    </Text>
                  </View>
                </ImageBackground>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 20,
  },
  headerRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 246,
    height: 190,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 24px rgba(2,6,23,0.14)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 7,
        }),
  },
  image: {
    flex: 1,
    justifyContent: 'space-between',
  },
  imageInner: {
    borderRadius: 16,
  },
  topBadgeRow: {
    marginTop: 10,
    marginHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  kindBadge: {
    borderRadius: 999,
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  kindBadgeText: {
    color: '#001018',
    fontSize: 10,
    fontWeight: '900',
  },
  categoryBadge: {
    maxWidth: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  categoryBadgeText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '700',
  },
  bodyWrap: {
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    minHeight: 40,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    flex: 1,
    color: 'rgba(226,232,240,0.95)',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  priceText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  ratingPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.20)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.34)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: ExploreEaseColors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  reasonText: {
    marginTop: 2,
    color: 'rgba(148, 163, 184, 0.95)',
    fontSize: 11,
    fontWeight: '700',
  },
  stateWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
