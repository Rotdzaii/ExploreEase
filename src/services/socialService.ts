import { supabase } from './supabase';

export type ActivityActionType = 'review' | 'bookmark' | 'attend_event' | 'follow' | 'message';
export type ActivityTargetType =
  | 'destination'
  | 'event'
  | 'review'
  | 'event_review'
  | 'user'
  | 'conversation'
  | 'message';

export type MessageContentType = 'text' | 'image' | 'location';
export type ConversationType = 'direct' | 'group';

type ActivityRow = {
  id: string;
  user_id: string;
  action_type: ActivityActionType;
  target_id: string;
  target_type: ActivityTargetType;
  created_at: string;
};

type ConversationRow = {
  id: string;
  type: ConversationType;
  event_id: string | null;
  created_at: string;
};

type ConversationParticipantRow = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content_type: MessageContentType;
  content_text: string | null;
  media_url: string | null;
  created_at: string;
};

type ProfilePreview = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type EventPreview = {
  id: string;
  title: string | null;
};

export type SocialFeedItem = {
  id: string;
  userId: string;
  actorName: string;
  actorAvatarUrl: string | null;
  actionType: ActivityActionType;
  targetId: string;
  targetType: ActivityTargetType;
  targetDisplayName: string | null;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  participantIds: string[];
  participantCount: number;
  lastMessageType: MessageContentType | 'none';
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastSenderId: string | null;
  lastSenderName: string | null;
  eventId: string | null;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  isMine: boolean;
  contentType: MessageContentType;
  contentText: string | null;
  mediaUrl: string | null;
  createdAt: string;
};

export type FollowStats = {
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
};

const FALLBACK_NAME = 'Traveler';

const normalizeName = (raw: unknown, fallbackId?: string): string => {
  const trimmed = String(raw ?? '').trim();
  if (trimmed) return trimmed;

  if (fallbackId) {
    const short = fallbackId.replace(/-/g, '').slice(0, 6).toUpperCase();
    if (short) return `User ${short}`;
  }

  return FALLBACK_NAME;
};

const toUniqueIds = (ids: (string | null | undefined)[]) => {
  return Array.from(new Set(ids.map((value) => String(value ?? '').trim()).filter(Boolean)));
};

const ensureAuthenticatedUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Not authenticated');

  return userId;
};

const fetchProfilesByIds = async (userIds: string[]): Promise<Map<string, ProfilePreview>> => {
  const uniqueIds = toUniqueIds(userIds);
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', uniqueIds);

  if (error) {
    console.warn('fetchProfilesByIds failed:', error.message);
    return new Map();
  }

  const map = new Map<string, ProfilePreview>();
  for (const row of data ?? []) {
    const id = String((row as any)?.id ?? '').trim();
    if (!id) continue;

    map.set(id, {
      id,
      full_name: ((row as any)?.full_name ?? null) as string | null,
      avatar_url: ((row as any)?.avatar_url ?? null) as string | null,
    });
  }

  return map;
};

const fetchEventsByIds = async (eventIds: string[]): Promise<Map<string, EventPreview>> => {
  const uniqueIds = toUniqueIds(eventIds);
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from('events').select('id, title').in('id', uniqueIds);
  if (error) {
    console.warn('fetchEventsByIds failed:', error.message);
    return new Map();
  }

  const map = new Map<string, EventPreview>();
  for (const row of data ?? []) {
    const id = String((row as any)?.id ?? '').trim();
    if (!id) continue;

    map.set(id, {
      id,
      title: ((row as any)?.title ?? null) as string | null,
    });
  }

  return map;
};

const compareIsoDesc = (a: string | null, b: string | null) => {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;

  if (aTime === bTime) return 0;
  return aTime > bTime ? -1 : 1;
};

const buildConversationSummaries = async (
  currentUserId: string,
  conversationRows: ConversationRow[],
  participantRows: ConversationParticipantRow[]
): Promise<ConversationSummary[]> => {
  if (conversationRows.length === 0) return [];

  const conversationIds = toUniqueIds(conversationRows.map((row) => row.id));
  const participantIds = toUniqueIds(participantRows.map((row) => row.user_id));

  const [profileById, eventById, latestMessagesRes] = await Promise.all([
    fetchProfilesByIds(participantIds),
    fetchEventsByIds(toUniqueIds(conversationRows.map((row) => row.event_id))),
    supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content_type, content_text, media_url, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(800),
  ]);

  if (latestMessagesRes.error) throw latestMessagesRes.error;

  const latestMessageByConversation = new Map<string, MessageRow>();
  for (const row of (latestMessagesRes.data ?? []) as MessageRow[]) {
    const conversationId = String(row.conversation_id ?? '').trim();
    if (!conversationId || latestMessageByConversation.has(conversationId)) continue;
    latestMessageByConversation.set(conversationId, row);
  }

  const participantsByConversation = new Map<string, string[]>();
  for (const row of participantRows) {
    const conversationId = String(row.conversation_id ?? '').trim();
    const userId = String(row.user_id ?? '').trim();
    if (!conversationId || !userId) continue;

    const next = participantsByConversation.get(conversationId) ?? [];
    next.push(userId);
    participantsByConversation.set(conversationId, next);
  }

  const summaries: ConversationSummary[] = conversationRows.map((conversation) => {
    const participantIdsForConversation = toUniqueIds(participantsByConversation.get(conversation.id) ?? []);

    const participantNames = participantIdsForConversation
      .map((id) => {
        const profile = profileById.get(id);
        return normalizeName(profile?.full_name, id);
      })
      .filter(Boolean);

    const lastMessage = latestMessageByConversation.get(conversation.id) ?? null;
    const lastSenderProfile = lastMessage ? profileById.get(lastMessage.sender_id) : undefined;

    let title = '';
    let subtitle = '';
    let avatarUrl: string | null = null;

    if (conversation.type === 'direct') {
      const otherParticipantId = participantIdsForConversation.find((id) => id !== currentUserId)
        ?? participantIdsForConversation[0]
        ?? currentUserId;
      const otherProfile = profileById.get(otherParticipantId);

      title = normalizeName(otherProfile?.full_name, otherParticipantId);
      subtitle = '';
      avatarUrl = otherProfile?.avatar_url ?? null;
    } else {
      const eventTitle = conversation.event_id ? eventById.get(conversation.event_id)?.title : null;
      title = String(eventTitle ?? '').trim();

      const namePreview = participantNames.slice(0, 3).join(', ');
      const extraCount = Math.max(participantNames.length - 3, 0);
      const participantText = extraCount > 0 ? `${namePreview} +${extraCount}` : namePreview;
      subtitle = participantText || '';
      avatarUrl = null;
    }

    const normalizedLastMessageText = lastMessage
      ? String(lastMessage.content_text ?? '').trim() || null
      : null;

    const lastMessageType: MessageContentType | 'none' = lastMessage
      ? lastMessage.content_type
      : 'none';

    return {
      id: conversation.id,
      type: conversation.type,
      title,
      subtitle,
      avatarUrl,
      participantIds: participantIdsForConversation,
      participantCount: participantIdsForConversation.length,
      lastMessageType,
      lastMessageText: normalizedLastMessageText,
      lastMessageAt: lastMessage?.created_at ?? conversation.created_at,
      lastSenderId: lastMessage?.sender_id ?? null,
      lastSenderName: lastSenderProfile
        ? normalizeName(lastSenderProfile.full_name, lastMessage?.sender_id)
        : null,
      eventId: conversation.event_id,
    };
  });

  return summaries.sort((a, b) => compareIsoDesc(a.lastMessageAt, b.lastMessageAt));
};

const isUniqueViolationError = (error: unknown) => {
  const code = String((error as any)?.code ?? '').trim();
  const message = String((error as any)?.message ?? '').toLowerCase();
  return code === '23505' || message.includes('duplicate key');
};

const getFollowStatsInternal = async (currentUserId: string, targetUserId: string): Promise<FollowStats> => {
  const safeTargetUserId = String(targetUserId ?? '').trim();
  if (!safeTargetUserId) throw new Error('Missing user ID');

  const [relationRes, followerCountRes, followingCountRes] = await Promise.all([
    supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUserId)
      .eq('following_id', safeTargetUserId)
      .maybeSingle(),
    supabase
      .from('follows')
      .select('following_id', { head: true, count: 'exact' })
      .eq('following_id', safeTargetUserId),
    supabase
      .from('follows')
      .select('follower_id', { head: true, count: 'exact' })
      .eq('follower_id', safeTargetUserId),
  ]);

  if (relationRes.error) throw relationRes.error;
  if (followerCountRes.error) throw followerCountRes.error;
  if (followingCountRes.error) throw followingCountRes.error;

  return {
    isFollowing: !!relationRes.data,
    followerCount: typeof followerCountRes.count === 'number' ? followerCountRes.count : 0,
    followingCount: typeof followingCountRes.count === 'number' ? followingCountRes.count : 0,
  };
};

const findDirectConversationId = async (currentUserId: string, partnerUserId: string): Promise<string | null> => {
  const { data: ownParticipantRows, error: ownParticipantsError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', currentUserId)
    .limit(240);

  if (ownParticipantsError) throw ownParticipantsError;

  const conversationIds = toUniqueIds((ownParticipantRows ?? []).map((row: any) => row?.conversation_id));
  if (conversationIds.length === 0) return null;

  const { data: directConversationRows, error: directConversationError } = await supabase
    .from('conversations')
    .select('id, type, event_id, created_at')
    .in('id', conversationIds)
    .eq('type', 'direct');

  if (directConversationError) throw directConversationError;

  const directIds = toUniqueIds((directConversationRows ?? []).map((row: any) => row?.id));
  if (directIds.length === 0) return null;

  const { data: participantRows, error: participantError } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id, joined_at')
    .in('conversation_id', directIds);

  if (participantError) throw participantError;

  const participantsByConversation = new Map<string, string[]>();
  for (const row of (participantRows ?? []) as ConversationParticipantRow[]) {
    const conversationId = String(row.conversation_id ?? '').trim();
    const userId = String(row.user_id ?? '').trim();
    if (!conversationId || !userId) continue;

    const current = participantsByConversation.get(conversationId) ?? [];
    current.push(userId);
    participantsByConversation.set(conversationId, current);
  }

  for (const [conversationId, participantIds] of participantsByConversation.entries()) {
    const uniqueParticipantIds = toUniqueIds(participantIds);
    if (uniqueParticipantIds.length !== 2) continue;

    if (uniqueParticipantIds.includes(currentUserId) && uniqueParticipantIds.includes(partnerUserId)) {
      return conversationId;
    }
  }

  return null;
};

const getOrCreateDirectConversationInternal = async (currentUserId: string, partnerUserId: string): Promise<string> => {
  const safePartnerUserId = String(partnerUserId ?? '').trim();
  if (!safePartnerUserId) throw new Error('Missing partner user ID');
  if (safePartnerUserId === currentUserId) throw new Error('Cannot create a direct conversation with yourself');

  const existingConversationId = await findDirectConversationId(currentUserId, safePartnerUserId);
  if (existingConversationId) return existingConversationId;

  const { data: createdConversation, error: createConversationError } = await supabase
    .from('conversations')
    .insert({
      type: 'direct',
      event_id: null,
    })
    .select('id')
    .single();

  if (createConversationError) throw createConversationError;

  const conversationId = String((createdConversation as any)?.id ?? '').trim();
  if (!conversationId) throw new Error('Unable to create direct conversation');

  const { error: participantsError } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: conversationId, user_id: currentUserId },
      { conversation_id: conversationId, user_id: safePartnerUserId },
    ]);

  if (participantsError) {
    if (!isUniqueViolationError(participantsError)) throw participantsError;

    const dedupConversationId = await findDirectConversationId(currentUserId, safePartnerUserId);
    if (dedupConversationId) return dedupConversationId;
    throw participantsError;
  }

  return conversationId;
};

export const socialService = {
  async getActivityFeed(limit: number = 40): Promise<SocialFeedItem[]> {
    await ensureAuthenticatedUserId();

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(120, Math.floor(limit))) : 40;

    const { data, error } = await supabase
      .from('activities')
      .select('id, user_id, action_type, target_id, target_type, created_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) throw error;

    const rows = (data ?? []) as ActivityRow[];
    const profileIds = toUniqueIds([
      ...rows.map((row) => row.user_id),
      ...rows.filter((row) => row.target_type === 'user').map((row) => row.target_id),
    ]);
    const profileById = await fetchProfilesByIds(profileIds);

    return rows.map((row) => {
      const actorProfile = profileById.get(row.user_id);
      const targetProfile = row.target_type === 'user' ? profileById.get(row.target_id) : undefined;
      const actorName = normalizeName(actorProfile?.full_name, row.user_id);
      const targetDisplayName = targetProfile
        ? normalizeName(targetProfile.full_name, row.target_id)
        : null;

      return {
        id: row.id,
        userId: row.user_id,
        actorName,
        actorAvatarUrl: actorProfile?.avatar_url ?? null,
        actionType: row.action_type,
        targetId: row.target_id,
        targetType: row.target_type,
        targetDisplayName,
        createdAt: row.created_at,
      };
    });
  },

    async getFollowStats(targetUserId: string): Promise<FollowStats> {
      const currentUserId = await ensureAuthenticatedUserId();
      return getFollowStatsInternal(currentUserId, targetUserId);
    },

    async followUser(targetUserId: string): Promise<FollowStats> {
      const currentUserId = await ensureAuthenticatedUserId();
      const safeTargetUserId = String(targetUserId ?? '').trim();

      if (!safeTargetUserId) throw new Error('Missing user ID');
      if (safeTargetUserId === currentUserId) throw new Error('Cannot follow yourself');

      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: currentUserId,
          following_id: safeTargetUserId,
        });

      if (error && !isUniqueViolationError(error)) throw error;

      const { error: activityError } = await supabase.from('activities').insert({
        user_id: currentUserId,
        action_type: 'follow',
        target_id: safeTargetUserId,
        target_type: 'user',
      });

      if (activityError) {
        console.warn('followUser activity insert failed:', activityError.message);
      }

      return getFollowStatsInternal(currentUserId, safeTargetUserId);
    },

    async unfollowUser(targetUserId: string): Promise<FollowStats> {
      const currentUserId = await ensureAuthenticatedUserId();
      const safeTargetUserId = String(targetUserId ?? '').trim();

      if (!safeTargetUserId) throw new Error('Missing user ID');
      if (safeTargetUserId === currentUserId) {
        return getFollowStatsInternal(currentUserId, safeTargetUserId);
      }

      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', safeTargetUserId);

      if (error) throw error;

      return getFollowStatsInternal(currentUserId, safeTargetUserId);
    },

    async resolveConversationIdFromRouteParam(routeParam: string): Promise<string> {
      const currentUserId = await ensureAuthenticatedUserId();
      const safeRouteParam = String(routeParam ?? '').trim();
      if (!safeRouteParam) throw new Error('Missing conversation or user ID');

      const membershipRes = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', safeRouteParam)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (membershipRes.error) {
        const errorCode = String((membershipRes.error as any)?.code ?? '').trim();
        if (errorCode !== '22P02') {
          throw membershipRes.error;
        }
      }

      if (membershipRes.data?.conversation_id) {
        return safeRouteParam;
      }

      return getOrCreateDirectConversationInternal(currentUserId, safeRouteParam);
    },

  async getConversations(): Promise<ConversationSummary[]> {
    const currentUserId = await ensureAuthenticatedUserId();

    const { data: ownParticipants, error: ownParticipantsError } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, joined_at')
      .eq('user_id', currentUserId)
      .order('joined_at', { ascending: false })
      .limit(120);

    if (ownParticipantsError) throw ownParticipantsError;

    const ownRows = (ownParticipants ?? []) as ConversationParticipantRow[];
    const conversationIds = toUniqueIds(ownRows.map((row) => row.conversation_id));
    if (conversationIds.length === 0) return [];

    const [{ data: conversationData, error: conversationError }, { data: participantData, error: participantError }] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, type, event_id, created_at')
        .in('id', conversationIds),
      supabase
        .from('conversation_participants')
        .select('conversation_id, user_id, joined_at')
        .in('conversation_id', conversationIds),
    ]);

    if (conversationError) throw conversationError;
    if (participantError) throw participantError;

    const conversations = (conversationData ?? []) as ConversationRow[];
    const participants = (participantData ?? []) as ConversationParticipantRow[];

    return buildConversationSummaries(currentUserId, conversations, participants);
  },

  async getConversationMessages(conversationId: string, limit: number = 200): Promise<ConversationMessage[]> {
    const currentUserId = await ensureAuthenticatedUserId();

    const safeConversationId = String(conversationId ?? '').trim();
    if (!safeConversationId) throw new Error('Missing conversation ID');

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200;

    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content_type, content_text, media_url, created_at')
      .eq('conversation_id', safeConversationId)
      .order('created_at', { ascending: true })
      .limit(safeLimit);

    if (error) throw error;

    const rows = (data ?? []) as MessageRow[];
    const profileById = await fetchProfilesByIds(rows.map((row) => row.sender_id));

    return rows.map((row) => {
      const profile = profileById.get(row.sender_id);

      return {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: normalizeName(profile?.full_name, row.sender_id),
        senderAvatarUrl: profile?.avatar_url ?? null,
        isMine: row.sender_id === currentUserId,
        contentType: row.content_type,
        contentText: row.content_text,
        mediaUrl: row.media_url,
        createdAt: row.created_at,
      };
    });
  },

  async sendTextMessage(conversationId: string, contentText: string): Promise<ConversationMessage> {
    const senderId = await ensureAuthenticatedUserId();

    const safeConversationId = String(conversationId ?? '').trim();
    if (!safeConversationId) throw new Error('Missing conversation ID');

    const safeText = String(contentText ?? '').trim();
    if (!safeText) throw new Error('Message cannot be empty');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: safeConversationId,
        sender_id: senderId,
        content_type: 'text',
        content_text: safeText,
        media_url: null,
      })
      .select('id, conversation_id, sender_id, content_type, content_text, media_url, created_at')
      .single();

    if (error) throw error;

    // Keep social feed lively for message events even without a DB trigger.
    const { error: activityError } = await supabase.from('activities').insert({
      user_id: senderId,
      action_type: 'message',
      target_id: safeConversationId,
      target_type: 'conversation',
    });
    if (activityError) {
      console.warn('sendTextMessage activity insert failed:', activityError.message);
    }

    const profileById = await fetchProfilesByIds([senderId]);
    const profile = profileById.get(senderId);

    const row = data as MessageRow;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: normalizeName(profile?.full_name, senderId),
      senderAvatarUrl: profile?.avatar_url ?? null,
      isMine: true,
      contentType: row.content_type,
      contentText: row.content_text,
      mediaUrl: row.media_url,
      createdAt: row.created_at,
    };
  },
};
