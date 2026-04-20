import CryptoJS from 'crypto-js';

import {
    socialService,
    type ConversationMessage,
    type ConversationSummary,
    type MessageContentType,
} from './socialService';

const E2EE_PREFIX = 'e2ee';
const E2EE_VERSION = 'v1';
const UNREADABLE_MESSAGE_FALLBACK = '[Encrypted message]';
const DEV_FALLBACK_SECRET = 'exploreease-dev-e2ee-secret-change-me';

const getBaseSecret = () => {
  const envSecret = String(process.env.EXPO_PUBLIC_CHAT_E2EE_SECRET ?? '').trim();
  return envSecret || DEV_FALLBACK_SECRET;
};

const toConversationKey = (conversationId: string) => {
  const safeConversationId = String(conversationId ?? '').trim();
  if (!safeConversationId) throw new Error('Missing conversation ID for encryption key derivation');

  const seed = `${getBaseSecret()}:${safeConversationId}`;
  const hashHex = CryptoJS.SHA256(seed).toString(CryptoJS.enc.Hex);
  return CryptoJS.enc.Hex.parse(hashHex);
};

const encodePayload = (ivBase64: string, cipherBase64: string) => {
  return `${E2EE_PREFIX}:${E2EE_VERSION}:${ivBase64}:${cipherBase64}`;
};

const decodePayload = (value: string) => {
  const safeValue = String(value ?? '').trim();
  if (!safeValue.startsWith(`${E2EE_PREFIX}:${E2EE_VERSION}:`)) return null;

  const parts = safeValue.split(':');
  if (parts.length !== 4) return null;

  const ivBase64 = String(parts[2] ?? '').trim();
  const cipherBase64 = String(parts[3] ?? '').trim();
  if (!ivBase64 || !cipherBase64) return null;

  return { ivBase64, cipherBase64 };
};

const normalizeSenderName = (rawName: string | null | undefined, fallbackId: string) => {
  const safeName = String(rawName ?? '').trim();
  if (safeName) return safeName;

  const shortId = String(fallbackId ?? '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return shortId ? `User ${shortId}` : 'Traveler';
};

const normalizeMessageContentType = (value: unknown): MessageContentType => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'image') return 'image';
  if (normalized === 'location') return 'location';
  return 'text';
};

export type RealtimeInsertedMessageRow = {
  id?: string | null;
  conversation_id?: string | null;
  sender_id?: string | null;
  content_type?: string | null;
  content_text?: string | null;
  media_url?: string | null;
  created_at?: string | null;
};

export type RealtimeSenderProfile = {
  full_name?: string | null;
  avatar_url?: string | null;
};

export const secureMessageService = {
  encryptText(conversationId: string, plainText: string): string {
    const safePlainText = String(plainText ?? '').trim();
    if (!safePlainText) throw new Error('Message cannot be empty');

    const key = toConversationKey(conversationId);
    const iv = CryptoJS.lib.WordArray.random(16);

    const encrypted = CryptoJS.AES.encrypt(safePlainText, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const cipherBase64 = CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
    const ivBase64 = CryptoJS.enc.Base64.stringify(iv);

    return encodePayload(ivBase64, cipherBase64);
  },

  decryptText(conversationId: string, storedValue: string | null): string | null {
    if (storedValue == null) return null;

    const raw = String(storedValue ?? '');
    if (!raw.trim()) return '';

    const decoded = decodePayload(raw);
    if (!decoded) {
      // Legacy plaintext rows remain readable.
      return raw;
    }

    try {
      const key = toConversationKey(conversationId);
      const iv = CryptoJS.enc.Base64.parse(decoded.ivBase64);
      const ciphertext = CryptoJS.enc.Base64.parse(decoded.cipherBase64);

      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext,
      });

      const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const plain = decrypted.toString(CryptoJS.enc.Utf8);
      return plain || UNREADABLE_MESSAGE_FALLBACK;
    } catch (error) {
      console.warn('secureMessageService.decryptText failed:', error);
      return UNREADABLE_MESSAGE_FALLBACK;
    }
  },

  async getConversations(): Promise<ConversationSummary[]> {
    const rows = await socialService.getConversations();

    return rows.map((row) => {
      if (row.lastMessageType !== 'text') return row;

      return {
        ...row,
        lastMessageText: this.decryptText(row.id, row.lastMessageText),
      };
    });
  },

  async getConversationMessages(conversationId: string, limit: number = 200): Promise<ConversationMessage[]> {
    const rows = await socialService.getConversationMessages(conversationId, limit);

    return rows.map((row) => {
      if (row.contentType !== 'text') return row;

      return {
        ...row,
        contentText: this.decryptText(row.conversationId, row.contentText),
      };
    });
  },

  async sendEncryptedTextMessage(conversationId: string, plainText: string): Promise<ConversationMessage> {
    const safeText = String(plainText ?? '').trim();
    if (!safeText) throw new Error('Message cannot be empty');

    const cipherText = this.encryptText(conversationId, safeText);
    const created = await socialService.sendTextMessage(conversationId, cipherText);

    if (created.contentType !== 'text') return created;

    return {
      ...created,
      contentText: safeText,
    };
  },

  toConversationMessageFromInsert(
    row: RealtimeInsertedMessageRow,
    options: {
      currentUserId?: string | null;
      senderProfile?: RealtimeSenderProfile | null;
    } = {}
  ): ConversationMessage | null {
    const id = String(row?.id ?? '').trim();
    const conversationId = String(row?.conversation_id ?? '').trim();
    const senderId = String(row?.sender_id ?? '').trim();

    if (!id || !conversationId || !senderId) {
      return null;
    }

    const contentType = normalizeMessageContentType(row?.content_type);
    const rawContentText = row?.content_text == null ? null : String(row.content_text);
    const normalizedContentText =
      contentType === 'text'
        ? this.decryptText(conversationId, rawContentText)
        : rawContentText;

    const senderProfile = options.senderProfile ?? null;
    const currentUserId = String(options.currentUserId ?? '').trim();

    return {
      id,
      conversationId,
      senderId,
      senderName: normalizeSenderName(senderProfile?.full_name ?? null, senderId),
      senderAvatarUrl: senderProfile?.avatar_url ? String(senderProfile.avatar_url) : null,
      isMine: !!currentUserId && senderId === currentUserId,
      contentType,
      contentText: normalizedContentText,
      mediaUrl: row?.media_url == null ? null : String(row.media_url),
      createdAt: String(row?.created_at ?? new Date().toISOString()),
    };
  },
};
