import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import type { EventRow } from '@/src/services/eventService';
import { secureMessageService } from '@/src/services/secureMessageService';
import type { ConversationSummary } from '@/src/services/socialService';
import {
    buildEventPublicUrl,
    buildEventShareBody,
    buildSocialShareUrl,
    type EventSharePlatform,
} from '@/src/utils/eventShare';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type FestivalShareModalProps = {
  visible: boolean;
  event: EventRow | null;
  currentUserId: string | null;
  onClose: () => void;
};

type SocialOption = {
  id: EventSharePlatform;
  icon: string;
  labelKey: string;
};

const SOCIAL_OPTIONS: SocialOption[] = [
  { id: 'facebook', icon: 'facebook', labelKey: 'events.share.social.facebook' },
  { id: 'tiktok', icon: 'music-note-eighth', labelKey: 'events.share.social.tiktok' },
  { id: 'x', icon: 'alpha-x-circle-outline', labelKey: 'events.share.social.x' },
  { id: 'instagram', icon: 'instagram', labelKey: 'events.share.social.instagram' },
];

const toConversationTitle = (conversation: ConversationSummary, fallbackTitle: string) => {
  const safe = String(conversation.title ?? '').trim();
  if (safe) return safe;
  return fallbackTitle;
};

export function FestivalShareModal({
  visible,
  event,
  currentUserId,
  onClose,
}: FestivalShareModalProps) {
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null);
  const [sharingPlatform, setSharingPlatform] = useState<string | null>(null);

  const colors = useMemo(
    () => ({
      backdrop: 'rgba(2, 6, 23, 0.56)',
      card: isDark ? 'rgba(26, 38, 55, 0.98)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#cbd5e1' : '#334155',
      muted: isDark ? '#94a3b8' : '#64748b',
      buttonBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
      chipBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(34,211,238,0.12)',
    }),
    [isDark]
  );

  const sharePayload = useMemo(() => {
    if (!event) return null;

    const publicUrl = buildEventPublicUrl(event);
    const shareText = buildEventShareBody({
      event,
      locale,
      t,
      includePublicUrl: false,
    });

    return {
      publicUrl,
      shareText,
      message: `${shareText}\n\n${publicUrl}`,
    };
  }, [event, locale, t]);

  useEffect(() => {
    if (!visible) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    if (!currentUserId) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    let alive = true;

    const loadConversations = async () => {
      setLoadingConversations(true);
      try {
        const rows = await secureMessageService.getConversations();
        if (!alive) return;
        setConversations(rows);
      } catch (error: any) {
        if (!alive) return;
        console.warn('festival share loadConversations failed:', error?.message ?? error);
        setConversations([]);
      } finally {
        if (!alive) return;
        setLoadingConversations(false);
      }
    };

    void loadConversations();

    return () => {
      alive = false;
    };
  }, [currentUserId, visible]);

  const closeAndReset = useCallback(() => {
    setSendingConversationId(null);
    setSharingPlatform(null);
    onClose();
  }, [onClose]);

  const shareToSystem = useCallback(async () => {
    if (!event || !sharePayload || sharingPlatform) return;

    setSharingPlatform('system');

    try {
      await Share.share({
        title: event.title,
        message: sharePayload.message,
      });
      closeAndReset();
    } catch (error: any) {
      console.warn('festival shareToSystem failed:', error?.message ?? error);
      Alert.alert(t('event.detail.shareFailed'), t('events.share.systemFailed'));
    } finally {
      setSharingPlatform(null);
    }
  }, [closeAndReset, event, sharePayload, sharingPlatform, t]);

  const shareToSocial = useCallback(
    async (platform: EventSharePlatform) => {
      if (!event || !sharePayload || sharingPlatform) return;

      setSharingPlatform(platform);

      try {
        const socialUrl = buildSocialShareUrl({
          platform,
          shareText: sharePayload.shareText,
          publicUrl: sharePayload.publicUrl,
        });

        const canOpen = await Linking.canOpenURL(socialUrl);
        if (!canOpen) {
          await Share.share({
            title: event.title,
            message: sharePayload.message,
          });
          closeAndReset();
          return;
        }

        await Linking.openURL(socialUrl);
        closeAndReset();
      } catch (error: any) {
        console.warn('festival shareToSocial failed:', error?.message ?? error);
        Alert.alert(t('event.detail.shareFailed'), t('events.share.socialFailed'));
      } finally {
        setSharingPlatform(null);
      }
    },
    [closeAndReset, event, sharePayload, sharingPlatform, t]
  );

  const onPressLogin = useCallback(() => {
    closeAndReset();
    router.push('/login' as any);
  }, [closeAndReset]);

  const onPressOpenMessages = useCallback(() => {
    closeAndReset();
    router.push('/messages' as any);
  }, [closeAndReset]);

  const shareToConversation = useCallback(
    async (conversation: ConversationSummary) => {
      if (!sharePayload || !currentUserId || !event) return;

      const conversationId = String(conversation.id ?? '').trim();
      if (!conversationId || sendingConversationId) return;

      setSendingConversationId(conversationId);
      try {
        await secureMessageService.sendEncryptedTextMessage(conversationId, sharePayload.message);

        const conversationTitle = toConversationTitle(conversation, t('messages.chat.fallbackTitle'));
        Alert.alert(
          t('events.share.messageSentTitle'),
          t('events.share.messageSentBody', { name: conversationTitle })
        );
        closeAndReset();
      } catch (error: any) {
        console.warn('festival shareToConversation failed:', error?.message ?? error);
        Alert.alert(t('messages.chat.error.sendTitle'), t('events.share.messageSendFailed'));
      } finally {
        setSendingConversationId(null);
      }
    },
    [closeAndReset, currentUserId, event, sendingConversationId, sharePayload, t]
  );

  const hasConversations = conversations.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeAndReset}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}> 
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeAndReset} />

        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.title }]}>{t('events.share.sheetTitle')}</Text>
              {event ? (
                <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={2}>
                  {event.title}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={closeAndReset}
              style={({ pressed }) => [
                styles.closeBtn,
                { borderColor: colors.border, backgroundColor: colors.buttonBg },
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('event.detail.close')}
            >
              <Feather name="x" size={18} color={colors.title} />
            </Pressable>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.title }]}>
            {t('events.share.socialTitle')}
          </Text>

          <View style={styles.socialGrid}>
            {SOCIAL_OPTIONS.map((option) => {
              const busy = sharingPlatform === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => void shareToSocial(option.id)}
                  disabled={!!sharingPlatform}
                  style={({ pressed }) => [
                    styles.socialBtn,
                    { borderColor: colors.border, backgroundColor: colors.buttonBg },
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
                  ) : (
                    <MaterialCommunityIcons name={option.icon as any} size={18} color={ExploreEaseColors.primary} />
                  )}
                  <Text style={[styles.socialBtnText, { color: colors.text }]}>{t(option.labelKey)}</Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => void shareToSystem()}
              disabled={!!sharingPlatform}
              style={({ pressed }) => [
                styles.socialBtn,
                { borderColor: colors.border, backgroundColor: colors.buttonBg },
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              {sharingPlatform === 'system' ? (
                <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
              ) : (
                <Feather name="share-2" size={18} color={ExploreEaseColors.primary} />
              )}
              <Text style={[styles.socialBtnText, { color: colors.text }]}>{t('events.share.social.system')}</Text>
            </Pressable>
          </View>

          <View style={[styles.separator, { backgroundColor: colors.border }]} />

          <View style={styles.messageHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.title }]}>
              {t('events.share.messageTitle')}
            </Text>

            <Pressable
              onPress={onPressOpenMessages}
              style={({ pressed }) => [styles.openMessagesBtn, pressed ? { opacity: 0.85 } : null]}
            >
              <Text style={styles.openMessagesText}>{t('events.share.openMessages')}</Text>
            </Pressable>
          </View>

          {!currentUserId ? (
            <View style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.chipBg }]}> 
              <Text style={[styles.noticeText, { color: colors.text }]}>
                {t('events.share.messageLoginRequired')}
              </Text>
              <Pressable
                onPress={onPressLogin}
                style={({ pressed }) => [styles.loginBtn, pressed ? { opacity: 0.85 } : null]}
              >
                <Text style={styles.loginBtnText}>{t('common.login')}</Text>
              </Pressable>
            </View>
          ) : loadingConversations ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
              <Text style={[styles.loadingText, { color: colors.muted }]}>
                {t('events.share.loadingConversations')}
              </Text>
            </View>
          ) : !hasConversations ? (
            <View style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.buttonBg }]}> 
              <Text style={[styles.noticeText, { color: colors.text }]}>
                {t('events.share.noConversations')}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.conversationList}
              contentContainerStyle={styles.conversationContent}
              showsVerticalScrollIndicator={false}
            >
              {conversations.slice(0, 10).map((conversation) => {
                const conversationId = String(conversation.id ?? '').trim();
                const busy = sendingConversationId === conversationId;
                const title = toConversationTitle(conversation, t('messages.chat.fallbackTitle'));
                const subtitle = String(conversation.subtitle ?? '').trim();

                return (
                  <Pressable
                    key={conversationId}
                    onPress={() => void shareToConversation(conversation)}
                    disabled={!!sendingConversationId}
                    style={({ pressed }) => [
                      styles.conversationBtn,
                      { borderColor: colors.border, backgroundColor: colors.buttonBg },
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.conversationTitle, { color: colors.title }]} numberOfLines={1}>
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text style={[styles.conversationSubtitle, { color: colors.muted }]} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>

                    {busy ? (
                      <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
                    ) : (
                      <MaterialCommunityIcons name="send" size={18} color={ExploreEaseColors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  socialBtn: {
    minWidth: 110,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  socialBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  separator: {
    height: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  messageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  openMessagesBtn: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 211, 238, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.30)',
  },
  openMessagesText: {
    color: ExploreEaseColors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  loginBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  loginBtnText: {
    color: '#001018',
    fontSize: 12,
    fontWeight: '900',
  },
  loadingWrap: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  conversationList: {
    maxHeight: Platform.OS === 'web' ? 260 : 320,
  },
  conversationContent: {
    gap: 8,
    paddingBottom: 4,
  },
  conversationBtn: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conversationTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  conversationSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
  },
});
