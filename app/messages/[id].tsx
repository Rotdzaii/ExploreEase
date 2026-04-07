import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import {
    socialService,
    type ConversationMessage,
    type ConversationSummary,
} from '@/src/services/socialService';
import { supabase } from '@/src/services/supabase';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const formatClock = (isoValue: string, locale: string) => {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toMessageBody = (message: ConversationMessage, t: TranslateFn) => {
  if (message.contentType === 'text') return String(message.contentText ?? '').trim();
  if (message.contentType === 'image') return t('messages.chat.media.image');
  if (message.contentType === 'location') return t('messages.chat.media.location');
  return '';
};

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = useMemo(
    () => (Array.isArray(id) ? String(id[0] ?? '').trim() : String(id ?? '').trim()),
    [id]
  );

  const { isDark } = useTheme();
  const { language, t } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';

  const listRef = useRef<FlatList<ConversationMessage> | null>(null);

  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      myBubble: ExploreEaseColors.primary,
      theirBubble: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
      myText: '#001018',
      theirText: isDark ? '#e2e8f0' : '#0f172a',
      inputBg: isDark ? 'rgba(255,255,255,0.07)' : '#ffffff',
    }),
    [isDark]
  );

  const loadConversation = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);

    try {
      const [conversationRows, messageRows] = await Promise.all([
        socialService.getConversations(),
        socialService.getConversationMessages(conversationId, 300),
      ]);

      setConversation(conversationRows.find((row) => row.id === conversationId) ?? null);
      setMessages(messageRows);
    } catch (err: any) {
      console.warn('load chat room failed:', err?.message ?? err);
      setConversation(null);
      setMessages([]);
      Alert.alert(t('messages.chat.error.loadTitle'), t('messages.chat.error.loadBody'));
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  useFocusEffect(
    useCallback(() => {
      void loadConversation();
      return () => {};
    }, [loadConversation])
  );

  const refreshMessagesRealtime = useCallback(async () => {
    if (!conversationId) return;

    try {
      const rows = await socialService.getConversationMessages(conversationId, 300);
      setMessages(rows);
    } catch (err: any) {
      console.warn('realtime message refresh failed:', err?.message ?? err);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    let active = true;

    const channel = supabase
      .channel(`chat-room:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          if (!active) return;
          void refreshMessagesRealtime();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, refreshMessagesRealtime]);

  const onRefresh = useCallback(async () => {
    if (!conversationId) return;

    setRefreshing(true);
    try {
      const rows = await socialService.getConversationMessages(conversationId, 300);
      setMessages(rows);
    } catch (err: any) {
      console.warn('refresh chat failed:', err?.message ?? err);
    } finally {
      setRefreshing(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (messages.length === 0) return;

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const onSend = useCallback(async () => {
    if (sending || !conversationId) return;

    const safeDraft = draft.trim();
    if (!safeDraft) return;

    setSending(true);
    setDraft('');

    try {
      const created = await socialService.sendTextMessage(conversationId, safeDraft);
      setMessages((prev) => [...prev, created]);
    } catch (err: any) {
      console.warn('send message failed:', err?.message ?? err);
      setDraft(safeDraft);
      Alert.alert(t('messages.chat.error.sendTitle'), t('messages.chat.error.sendBody'));
    } finally {
      setSending(false);
    }
  }, [conversationId, draft, sending, t]);

  const canSend = draft.trim().length > 0 && !sending;

  const chatTitle = conversation?.title || t('messages.chat.fallbackTitle');
  const chatSubtitle = conversation?.subtitle || t('messages.chat.connecting');

  const renderItem = useCallback(
    ({ item }: { item: ConversationMessage }) => {
      const isMine = item.isMine;
      const body = toMessageBody(item, t);

      return (
        <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: isMine ? colors.myBubble : colors.theirBubble,
                borderColor: isMine ? 'transparent' : colors.border,
                alignSelf: isMine ? 'flex-end' : 'flex-start',
              },
            ]}
          >
            {!isMine ? (
              <Text style={[styles.senderName, { color: colors.subtitle }]} numberOfLines={1}>
                {item.senderName}
              </Text>
            ) : null}

            <Text
              style={[
                styles.messageText,
                {
                  color: isMine ? colors.myText : colors.theirText,
                },
              ]}
            >
              {body}
            </Text>

            <Text
              style={[
                styles.messageTime,
                {
                  color: isMine ? 'rgba(0,16,24,0.70)' : colors.subtitle,
                },
              ]}
            >
              {formatClock(item.createdAt, locale)}
            </Text>
          </View>
        </View>
      );
    },
    [colors, locale, t]
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}> 
            <Pressable
              onPress={() => router.back()}
              style={({ pressed, hovered }) => [
                styles.backBtn,
                { borderColor: colors.border, backgroundColor: colors.cardBg },
                Platform.OS === 'web' && hovered ? { opacity: 0.98 } : null,
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.back')}
            >
              <Feather name="chevron-left" size={20} color={colors.title} />
            </Pressable>

            <View style={styles.headerTextWrap}>
              <Text style={[styles.chatTitle, { color: colors.title }]} numberOfLines={1}>
                {chatTitle}
              </Text>
              <Text style={[styles.chatSubtitle, { color: colors.subtitle }]} numberOfLines={1}>
                {chatSubtitle}
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={ExploreEaseColors.primary} />
              <Text style={[styles.loadingText, { color: colors.subtitle }]}>
                {t('messages.chat.loading')}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              ListEmptyComponent={
                <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}> 
                  <Feather name="message-square" size={24} color={ExploreEaseColors.primary} />
                  <Text style={[styles.emptyTitle, { color: colors.title }]}>
                    {t('messages.chat.emptyTitle')}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
                    {t('messages.chat.emptySubtitle')}
                  </Text>
                </View>
              }
            />
          )}

          <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}> 
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('messages.chat.inputPlaceholder')}
              placeholderTextColor={colors.subtitle}
              style={[
                styles.input,
                {
                  color: colors.title,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                },
              ]}
              multiline
              maxLength={1200}
              textAlignVertical="top"
              onSubmitEditing={() => {
                if (Platform.OS !== 'ios') {
                  void onSend();
                }
              }}
            />

            <Pressable
              onPress={() => void onSend()}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: canSend ? ExploreEaseColors.primary : 'rgba(148,163,184,0.35)',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('messages.chat.sendA11y')}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#001018" />
              ) : (
                <Feather name="send" size={16} color="#001018" />
              )}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  chatSubtitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 8,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '800',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  messageTime: {
    fontSize: 10,
    fontWeight: '800',
    alignSelf: 'flex-end',
  },
  emptyWrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputBar: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
