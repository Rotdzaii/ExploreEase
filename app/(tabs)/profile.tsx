import { CreateEventForm, type EventFormData } from '@/components/events/CreateEventForm';
import { EditEventForm, type EventEditData } from '@/components/events/EditEventForm';
import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { adminService } from '@/src/services/adminService';
import { eventService, type EventRow } from '@/src/services/eventService';
import { itineraryService } from '@/src/services/itineraryService';
import { profileService } from '@/src/services/profileService';
import { reviewService } from '@/src/services/reviewService';
import { storageService } from '@/src/services/storageService';
import { supabase } from '@/src/services/supabase';
import { useLanguageStore } from '@/src/store/useLanguageStore';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

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

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInput = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const combineLocalDateTime = (dateText: string, timeText: string): Date | null => {
  const dt = new Date(`${dateText.trim()}T${timeText.trim()}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ openCreateEvent?: string | string[] }>();
  const { isDark, toggleColorScheme } = useTheme();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { language, t } = useI18n();
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const [profileName, setProfileName] = React.useState<string>('');
  const [nationality, setNationality] = React.useState<string>('');
  const [nationalityCode, setNationalityCode] = React.useState<string>('VN');
  const [interests, setInterests] = React.useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = React.useState<string>('');
  const [tripCount, setTripCount] = React.useState<number>(0);
  const [reviewCount, setReviewCount] = React.useState<number>(0);
  const [loadingStats, setLoadingStats] = React.useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [myEvents, setMyEvents] = React.useState<EventRow[]>([]);
  const [loadingMyEvents, setLoadingMyEvents] = React.useState<boolean>(true);
  const [createEventModalVisible, setCreateEventModalVisible] = React.useState(false);
  const [editingEvent, setEditingEvent] = React.useState<EventRow | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [languageModalVisible, setLanguageModalVisible] = React.useState(false);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);

  const toInterestLabel = React.useCallback((value: string) => {
    const normalized = value.trim().toLowerCase();

    if (!normalized) return '';
    if (normalized.includes('food') || normalized.includes('ẩm thực')) return t('profile.interests.food');
    if (normalized.includes('nature') || normalized.includes('thiên nhiên')) return t('profile.interests.nature');
    if (normalized.includes('adventure') || normalized.includes('phiêu lưu')) return t('profile.interests.adventure');
    if (normalized.includes('culture') || normalized.includes('văn hóa')) return t('profile.interests.culture');
    if (normalized.includes('shopping') || normalized.includes('mua sắm')) return t('profile.interests.shopping');
    if (normalized.includes('history') || normalized.includes('lịch sử')) return t('profile.interests.history');

    return value.trim();
  }, [t]);

  const toInterestIcon = React.useCallback((value: string): React.ComponentProps<typeof Feather>['name'] => {
    const normalized = value.trim().toLowerCase();

    if (normalized.includes('food') || normalized.includes('ẩm thực')) return 'coffee';
    if (normalized.includes('nature') || normalized.includes('thiên nhiên')) return 'feather';
    if (normalized.includes('adventure') || normalized.includes('phiêu lưu')) return 'zap';
    if (normalized.includes('culture') || normalized.includes('văn hóa')) return 'globe';
    if (normalized.includes('shopping') || normalized.includes('mua sắm')) return 'shopping-bag';
    if (normalized.includes('history') || normalized.includes('lịch sử')) return 'book-open';

    return 'tag';
  }, []);

  const displayInterests = React.useMemo(
    () => interests.map(toInterestLabel).filter(Boolean),
    [interests, toInterestLabel]
  );

  const resolvedProfileName = profileName.trim() || t('profile.defaultName');
  const resolvedNationality = nationality.trim() || t('profile.defaultNationality');
  const resolvedAvatarUri = avatarUrl.trim()
    ? avatarUrl.trim()
    : `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(resolvedProfileName)}`;

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [profileResult, hasAdminRoleResult, tripCountResult, reviewCountResult] = await Promise.allSettled([
          profileService.getCurrentProfile(),
          adminService.isCurrentUserAdmin(),
          itineraryService.countTripsForCurrentUser(),
          reviewService.countReviewsForCurrentUser(),
        ]);

        if (!alive) return;

        setIsAdmin(hasAdminRoleResult.status === 'fulfilled' ? hasAdminRoleResult.value : false);
        setTripCount(tripCountResult.status === 'fulfilled' ? tripCountResult.value : 0);
        setReviewCount(reviewCountResult.status === 'fulfilled' ? reviewCountResult.value : 0);
        setLoadingStats(false);

        const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
        if (!profile) return;

        const normalizedName = typeof profile.full_name === 'string' && profile.full_name.trim()
          ? profile.full_name.trim()
          : '';

        const rawNationality = (profile.nationality ?? '').toString().trim();
        const normalizedNationality = rawNationality.toUpperCase() === 'VN'
          ? t('profile.defaultNationality')
          : rawNationality;

        const normalizedNationalityCode = rawNationality.toUpperCase() === 'VN'
          ? 'VN'
          : (rawNationality.length === 2 ? rawNationality.toUpperCase() : 'VN');

        setProfileName(normalizedName);
        setNationality(normalizedNationality);
        setNationalityCode(normalizedNationalityCode);
        setAvatarUrl(typeof profile.avatar_url === 'string' ? profile.avatar_url : '');
        setInterests(Array.isArray(profile.interests) ? profile.interests : []);
      } catch {
        setIsAdmin(false);
        setTripCount(0);
        setReviewCount(0);
        setAvatarUrl('');
        setInterests([]);
      } finally {
        setLoadingStats(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [t]);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      softCardBg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15, 23, 42, 0.04)',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.08)',
      title: isDark ? '#ffffff' : '#0f172a',
      subtitle: isDark ? '#94a3b8' : '#64748b',
      rowText: isDark ? '#e2e8f0' : '#0f172a',
      chipBorder: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15, 23, 42, 0.14)',
      statCardBg: isDark ? 'rgba(34,211,238,0.10)' : 'rgba(34,211,238,0.10)',
      logout: '#ef4444',
    }),
    [isDark]
  );

  const currencyLabel = nationalityCode === 'VN' ? t('profile.currency.vnd') : t('profile.currency.usd');

  const getEventStatusTone = React.useCallback((event: EventRow) => {
    const status = String(event.approval_status ?? event.moderation_status ?? 'pending').trim().toLowerCase();

    if (status === 'approved') {
      return {
        label: 'Đã duyệt',
        textColor: '#047857',
        borderColor: 'rgba(16, 185, 129, 0.28)',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
      };
    }

    if (status === 'rejected') {
      return {
        label: 'Bị từ chối',
        textColor: '#b91c1c',
        borderColor: 'rgba(239, 68, 68, 0.28)',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
      };
    }

    return {
      label: 'Chờ duyệt',
      textColor: '#b45309',
      borderColor: 'rgba(245, 158, 11, 0.28)',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
    };
  }, []);

  const formatEventSchedule = React.useCallback((event: EventRow) => {
    const dateLabel = toDateInput(event.start_time);
    const startLabel = toTimeInput(event.start_time);
    const endLabel = toTimeInput(event.end_time);
    const timeLabel = startLabel && endLabel ? `${startLabel} - ${endLabel}` : (startLabel || endLabel);
    return [dateLabel, timeLabel].filter(Boolean).join(' • ') || 'Chưa có lịch cụ thể';
  }, []);

  const loadMyEvents = React.useCallback(async () => {
    setLoadingMyEvents(true);

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id ?? null;
      setCurrentUserId(userId);

      if (!userId) {
        setMyEvents([]);
        return;
      }

      const rows = await eventService.getEvents({
        creatorId: userId,
        orderBy: 'created_at',
        ascending: false,
        limit: 30,
      });

      setMyEvents(rows);
    } catch (error) {
      console.warn('loadMyEvents failed:', error);
      setCurrentUserId(null);
      setMyEvents([]);
    } finally {
      setLoadingMyEvents(false);
    }
  }, []);

  const editingEventFormData = React.useMemo<EventEditData | null>(() => {
    if (!editingEvent) return null;

    return {
      title: editingEvent.title ?? '',
      category: editingEvent.category ?? '',
      location: editingEvent.location ?? '',
      startDate: toDateInput(editingEvent.start_time),
      startTime: toTimeInput(editingEvent.start_time),
      endDate: toDateInput(editingEvent.end_time),
      endTime: toTimeInput(editingEvent.end_time),
      price: String(typeof editingEvent.price === 'number' ? editingEvent.price : 0),
      imageUrl: typeof editingEvent.image_url === 'string' ? editingEvent.image_url : '',
      description: typeof editingEvent.description === 'string' ? editingEvent.description : '',
    };
  }, [editingEvent]);

  React.useEffect(() => {
    void loadMyEvents();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadMyEvents();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [loadMyEvents]);

  React.useEffect(() => {
    const shouldOpen = Array.isArray(params.openCreateEvent)
      ? params.openCreateEvent[0] === '1'
      : params.openCreateEvent === '1';

    if (!shouldOpen || !currentUserId) return;

    releaseOverlayTriggerFocus();
    setCreateEventModalVisible(true);
  }, [currentUserId, params.openCreateEvent]);

  const handleEditProfile = React.useCallback(() => {
    router.push('/profile-setup');
  }, []);

  const handleEditInterests = React.useCallback(() => {
    router.push('/interests?mode=edit');
  }, []);

  const handleLogout = React.useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace('/login');
    }
  }, []);

  const handlePickAvatar = React.useCallback(async () => {
    if (uploadingAvatar) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      addNotification({
        message: t('profile.avatar.permissionDenied'),
        type: 'warning',
        durationMs: 3200,
      });
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      allowsMultipleSelection: false,
    });

    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    if (!asset?.uri) {
      addNotification({
        message: t('profile.avatar.pickFailed'),
        type: 'error',
        durationMs: 3200,
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error(t('profile.avatar.missingAuth'));

      const extensionFromFileName =
        typeof asset.fileName === 'string' && asset.fileName.includes('.')
          ? asset.fileName.split('.').pop()?.trim().toLowerCase()
          : null;
      const extensionFromMime =
        asset.mimeType === 'image/png'
          ? 'png'
          : asset.mimeType === 'image/webp'
            ? 'webp'
            : 'jpg';
      const extension = extensionFromFileName || extensionFromMime || 'jpg';

      const avatarPath = `${userId}/${Date.now()}-avatar.${extension}`;
      const uploadResponse = await fetch(asset.uri);
      const avatarBlob = await uploadResponse.blob();
      const avatarBuffer = await avatarBlob.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(avatarPath, avatarBuffer, {
          cacheControl: '3600',
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
      const nextAvatarUrl = publicData.publicUrl;
      if (!nextAvatarUrl) {
        throw new Error(t('profile.avatar.uploadFailed'));
      }

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ avatar_url: nextAvatarUrl })
        .eq('id', userId);

      if (profileErr) throw profileErr;

      setAvatarUrl(nextAvatarUrl);
      addNotification({
        message: t('profile.avatar.updated'),
        type: 'success',
        durationMs: 2400,
      });
    } catch (err: any) {
      const reason = String(err?.message ?? '').trim() || t('profile.avatar.uploadFailed');
      addNotification({
        message: t('profile.avatar.uploadFailedWithReason', { reason }),
        type: 'error',
        durationMs: 4200,
      });
    } finally {
      setUploadingAvatar(false);
    }
  }, [addNotification, t, uploadingAvatar]);

  const handleOpenCreateEvent = React.useCallback(() => {
    if (!currentUserId) {
      Alert.alert('Cần đăng nhập', 'Hãy đăng nhập để tạo và quản lý sự kiện của bạn.');
      return;
    }

    releaseOverlayTriggerFocus();
    setCreateEventModalVisible(true);
  }, [currentUserId]);

  const handleCreateEvent = React.useCallback(async (form: EventFormData) => {
    const start = combineLocalDateTime(form.startDate, form.startTime);
    const end = combineLocalDateTime(form.endDate, form.endTime);

    if (!start || !end) {
      Alert.alert('Không thể tạo sự kiện', 'Ngày giờ sự kiện chưa hợp lệ.');
      throw new Error('Invalid datetime format');
    }

    if (end <= start) {
      Alert.alert('Không thể tạo sự kiện', 'Ngày kết thúc phải sau ngày bắt đầu.');
      throw new Error('end_time must be greater than start_time');
    }

    const price = Number(form.price || '0');
    if (Number.isNaN(price) || price < 0) {
      Alert.alert('Không thể tạo sự kiện', 'Giá vé phải lớn hơn hoặc bằng 0.');
      throw new Error('Invalid price');
    }

    try {
      let uploadedImageUrl: string | null = null;
      if (form.imageUri.trim()) {
        const uploaded = await storageService.uploadEventImage({
          uri: form.imageUri.trim(),
          fileName: form.imageFileName || undefined,
          contentType: form.imageMimeType || undefined,
        });
        uploadedImageUrl = uploaded.publicUrl;
      }

      await eventService.createEventForCurrentUser({
        title: form.title,
        category: form.category,
        location: form.location,
        start_time: start,
        end_time: end,
        price,
        image_url: uploadedImageUrl,
        description: form.description.trim() ? form.description.trim() : null,
      });

      setCreateEventModalVisible(false);
      addNotification({
        message: `Đã tạo sự kiện "${form.title.trim() || 'mới'}"`,
        type: 'success',
        durationMs: 2600,
      });
      await loadMyEvents();
    } catch (error: any) {
      const message = String(error?.message ?? '').trim() || 'Không thể tạo sự kiện lúc này.';
      Alert.alert('Không thể tạo sự kiện', message);
      throw error;
    }
  }, [addNotification, loadMyEvents]);

  const handleSubmitEditEvent = React.useCallback(async (form: EventEditData) => {
    if (!editingEvent) return;

    const start = combineLocalDateTime(form.startDate, form.startTime);
    const end = combineLocalDateTime(form.endDate, form.endTime);

    if (!start || !end) {
      Alert.alert('Không thể cập nhật sự kiện', 'Ngày giờ sự kiện chưa hợp lệ.');
      throw new Error('Invalid datetime format');
    }

    if (end <= start) {
      Alert.alert('Không thể cập nhật sự kiện', 'Ngày kết thúc phải sau ngày bắt đầu.');
      throw new Error('end_time must be greater than start_time');
    }

    const price = Number(form.price || '0');
    if (Number.isNaN(price) || price < 0) {
      Alert.alert('Không thể cập nhật sự kiện', 'Giá vé phải lớn hơn hoặc bằng 0.');
      throw new Error('Invalid price');
    }

    try {
      await eventService.updateEvent(editingEvent.id, {
        title: form.title,
        category: form.category,
        location: form.location,
        start_time: start,
        end_time: end,
        price,
        image_url: form.imageUrl.trim() || null,
        description: form.description.trim() || null,
      });

      const eventTitle = form.title.trim() || editingEvent.title || 'sự kiện';
      setEditingEvent(null);
      addNotification({
        message: `Đã cập nhật sự kiện "${eventTitle}"`,
        type: 'success',
        durationMs: 2600,
      });
      await loadMyEvents();
    } catch (error: any) {
      const message = String(error?.message ?? '').trim() || 'Không thể cập nhật sự kiện lúc này.';
      Alert.alert('Không thể cập nhật sự kiện', message);
      throw error;
    }
  }, [addNotification, editingEvent, loadMyEvents]);

  const handleDeleteEvent = React.useCallback(async (eventId: string) => {
    const targetEvent = myEvents.find((item) => item.id === eventId) ?? editingEvent ?? null;
    const eventTitle = targetEvent?.title?.trim() || 'sự kiện này';

    await new Promise<void>((resolve, reject) => {
      Alert.alert(
        'Xóa sự kiện',
        `Bạn có chắc muốn xóa "${eventTitle}" không?`,
        [
          {
            text: 'Hủy',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Xóa',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await eventService.deleteEvent(eventId);
                  setEditingEvent(null);
                  addNotification({
                    message: `Đã xóa sự kiện "${eventTitle}"`,
                    type: 'success',
                    durationMs: 2600,
                  });
                  await loadMyEvents();
                  resolve();
                } catch (error: any) {
                  const message = String(error?.message ?? '').trim() || 'Không thể xóa sự kiện lúc này.';
                  Alert.alert('Không thể xóa sự kiện', message);
                  reject(error);
                }
              })();
            },
          },
        ]
      );
    });
  }, [addNotification, editingEvent, loadMyEvents, myEvents]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={[styles.pageTitle, { color: colors.title }]}>{t('profile.title')}</Text>
          <Text style={[styles.pageSubtitle, { color: colors.subtitle }]}>{t('profile.subtitle')}</Text>

          {/* Profile header */}
          <View style={[styles.profileCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.profileLeft}>
              <Pressable
                onPress={() => void handlePickAvatar()}
                disabled={uploadingAvatar}
                style={({ pressed }) => [
                  styles.avatarActionWrap,
                  pressed ? { opacity: 0.84 } : null,
                  uploadingAvatar ? { opacity: 0.7 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.avatar.change')}
              >
                <View style={[styles.avatarWrap, { borderColor: colors.border }]}>
                  <Image
                    source={{ uri: resolvedAvatarUri }}
                    style={styles.avatar}
                  />
                </View>

                <View style={[styles.avatarActionBadge, { borderColor: colors.border, backgroundColor: colors.cardBg }]}> 
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color={ExploreEaseColors.primary} />
                  ) : (
                    <Feather name="camera" size={14} color={ExploreEaseColors.primary} />
                  )}
                </View>
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text style={[styles.profileName, { color: colors.title }]} numberOfLines={1}>
                  {resolvedProfileName}
                </Text>
                <Text style={[styles.profileMeta, { color: colors.subtitle }]} numberOfLines={1}>
                  {resolvedNationality}
                </Text>
                <Text style={{ marginTop: 6, color: colors.subtitle, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                  {uploadingAvatar ? t('profile.avatar.uploading') : t('profile.avatar.change')}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleEditProfile}
              style={({ pressed }) => [
                styles.editBtn,
                { borderColor: colors.border, backgroundColor: colors.cardBg, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.edit')}
            >
              <Feather name="edit-2" size={18} color={colors.title} />
            </Pressable>
          </View>

          <Text style={[styles.blockTitle, { color: colors.title }]}>{t('profile.interests.title')}</Text>
          {displayInterests.length > 0 ? (
            <View style={styles.chipsRow}>
              {displayInterests.map((item) => (
                <View key={item} style={[styles.chip, { borderColor: colors.chipBorder, backgroundColor: colors.cardBg }]}>
                  <Feather name={toInterestIcon(item)} size={16} color={colors.title} />
                  <Text style={[styles.chipText, { color: colors.title }]}>{item}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyInterestsCard, { borderColor: colors.border, backgroundColor: colors.softCardBg }]}>
              <Text style={[styles.emptyInterestsText, { color: colors.subtitle }]}>{t('auth.interests.selectSubtitle')}</Text>
            </View>
          )}

          <Pressable
            onPress={handleEditInterests}
            style={({ pressed }) => [
              styles.editInterestsButton,
              {
                backgroundColor: ExploreEaseColors.primary,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${t('profile.edit')} ${t('profile.interests.title')}`}
          >
            <Feather name="sliders" size={16} color="#001018" />
            <Text style={styles.editInterestsButtonText}>{`${t('profile.edit')} ${t('profile.interests.title')}`}</Text>
          </Pressable>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.statCardBg, borderColor: colors.border }]}>
              <View style={styles.statTop}>
                <Feather name="map-pin" size={16} color={colors.title} />
                <Text style={[styles.statLabel, { color: colors.subtitle }]}>{t('profile.stats.savedTrips')}</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.title }]}>{loadingStats ? '...' : tripCount}</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.statCardBg, borderColor: colors.border }]}>
              <View style={styles.statTop}>
                <Feather name="star" size={16} color={colors.title} />
                <Text style={[styles.statLabel, { color: colors.subtitle }]}>{t('profile.stats.myReviews')}</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.title }]}>{loadingStats ? '...' : reviewCount}</Text>
            </View>
          </View>

          <Text style={[styles.blockTitle, { color: colors.title, marginTop: 22 }]}>Sự kiện của tôi</Text>
          <Text style={[styles.myEventsSubtitle, { color: colors.subtitle }]}>
            {loadingMyEvents ? 'Đang tải danh sách sự kiện bạn quản lý...' : `${myEvents.length} sự kiện bạn đang quản lý`}
          </Text>

          <Pressable
            onPress={handleOpenCreateEvent}
            style={({ pressed }) => [
              styles.createEventButton,
              pressed ? { opacity: 0.86 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tạo sự kiện mới"
          >
            <Feather name="plus" size={18} color="#ffffff" />
            <Text style={styles.createEventButtonText}>Tạo sự kiện mới</Text>
          </Pressable>

          <View style={[styles.myEventsCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            {loadingMyEvents ? (
              <View style={styles.myEventsStateWrap}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.myEventsStateText, { color: colors.subtitle }]}>Đang đồng bộ sự kiện của bạn...</Text>
              </View>
            ) : !currentUserId ? (
              <View style={styles.myEventsStateWrap}>
                <Text style={[styles.myEventsStateText, { color: colors.subtitle }]}>
                  Đăng nhập để quản lý các sự kiện bạn đã tạo.
                </Text>
              </View>
            ) : myEvents.length === 0 ? (
              <View style={styles.myEventsStateWrap}>
                <Text style={[styles.myEventsStateText, { color: colors.subtitle }]}>
                  Bạn chưa có sự kiện nào. Hãy tạo sự kiện mới để gửi duyệt.
                </Text>
              </View>
            ) : (
              myEvents.map((event, index) => {
                const tone = getEventStatusTone(event);

                return (
                  <View
                    key={event.id}
                    style={[
                      styles.myEventRow,
                      {
                        borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.myEventBody}>
                      <View style={styles.myEventTopRow}>
                        <Text style={[styles.myEventTitle, { color: colors.title }]} numberOfLines={2}>
                          {event.title}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: tone.backgroundColor,
                              borderColor: tone.borderColor,
                            },
                          ]}
                        >
                          <Text style={[styles.statusBadgeText, { color: tone.textColor }]}>{tone.label}</Text>
                        </View>
                      </View>

                      <Text style={[styles.myEventMeta, { color: colors.subtitle }]} numberOfLines={2}>
                        {event.location || 'Chưa có địa điểm'}
                      </Text>
                      <Text style={[styles.myEventMeta, { color: colors.subtitle }]}>
                        {formatEventSchedule(event)}
                      </Text>
                    </View>

                    <View style={styles.myEventActions}>
                      <Pressable
                        onPress={() => {
                          releaseOverlayTriggerFocus();
                          setEditingEvent(event);
                        }}
                        style={({ pressed }) => [
                          styles.myEventIconBtn,
                          { borderColor: colors.border, backgroundColor: colors.softCardBg },
                          pressed ? { opacity: 0.84 } : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Chỉnh sửa sự kiện ${event.title}`}
                      >
                        <Feather name="edit-2" size={16} color={ExploreEaseColors.primary} />
                      </Pressable>

                      <Pressable
                        onPress={() => void handleDeleteEvent(event.id)}
                        style={({ pressed }) => [
                          styles.myEventIconBtn,
                          {
                            borderColor: 'rgba(239, 68, 68, 0.24)',
                            backgroundColor: 'rgba(239, 68, 68, 0.10)',
                          },
                          pressed ? { opacity: 0.84 } : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Xóa sự kiện ${event.title}`}
                      >
                        <Feather name="trash-2" size={16} color="#ef4444" />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Settings */}
          <Text style={[styles.blockTitle, { color: colors.title, marginTop: 18 }]}>{t('profile.settings.title')}</Text>
          <View style={[styles.settingsCard, { backgroundColor: colors.softCardBg, borderColor: colors.border }]}>
            {/* Dark mode */}
            <View style={[styles.settingRow, styles.settingRowFirst, { borderColor: colors.border }]}>
              <View style={styles.rowLeft}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? 'rgba(34,211,238,0.10)' : 'rgba(34,211,238,0.12)',
                    },
                  ]}
                >
                  <Feather name="moon" size={18} color={ExploreEaseColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.rowText }]}>{t('profile.settings.darkMode')}</Text>
                  <Text style={[styles.rowDesc, { color: colors.subtitle }]}>{isDark ? t('common.on') : t('common.off')}</Text>
                </View>
              </View>

              <Switch
                value={isDark}
                onValueChange={toggleColorScheme}
                trackColor={{ false: Platform.OS === 'ios' ? '#e2e8f0' : '#cbd5e1', true: 'rgba(34,211,238,0.55)' }}
                thumbColor={Platform.OS === 'android' ? (isDark ? ExploreEaseColors.primary : '#ffffff') : undefined}
              />
            </View>

            {/* Language */}
            <Pressable
              onPress={() => {
                releaseOverlayTriggerFocus();
                setLanguageModalVisible(true);
              }}
              style={({ pressed }) => [styles.settingRow, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.settings.language')}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { borderColor: colors.border, backgroundColor: 'transparent' }]}>
                  <Feather name="globe" size={18} color={colors.title} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.rowText }]}>{t('language.selectTitle')}</Text>
                  <Text style={[styles.rowDesc, { color: colors.subtitle }]}>
                    {language === 'en' ? t('language.en') : t('language.vi')}
                  </Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color={colors.subtitle} />
            </Pressable>

            {/* Currency */}
            <Pressable
              onPress={() => {}}
              style={({ pressed }) => [styles.settingRow, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.settings.currency')}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { borderColor: colors.border, backgroundColor: 'transparent' }]}>
                  <Feather name="dollar-sign" size={18} color={colors.title} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.rowText }]}>{t('profile.settings.currency')}</Text>
                  <Text style={[styles.rowDesc, { color: colors.subtitle }]}>{currencyLabel}</Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color={colors.subtitle} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/security' as any)}
              style={({ pressed }) => [styles.settingRow, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.settings.security')}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { borderColor: colors.border, backgroundColor: 'transparent' }]}>
                  <Feather name="shield" size={18} color={colors.title} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.rowText }]}>{t('profile.settings.security')}</Text>
                  <Text style={[styles.rowDesc, { color: colors.subtitle }]}>{t('profile.settings.securitySubtitle')}</Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color={colors.subtitle} />
            </Pressable>

            {isAdmin ? (
              <Pressable
                onPress={() => router.push('/admin/dashboard')}
                style={({ pressed }) => [styles.settingRow, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.settings.adminTitle')}
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.iconWrap, { borderColor: colors.border, backgroundColor: 'transparent' }]}>
                    <Feather name="shield" size={18} color={colors.title} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.rowText }]}>{t('profile.settings.adminTitle')}</Text>
                    <Text style={[styles.rowDesc, { color: colors.subtitle }]}>{t('profile.settings.adminSubtitle')}</Text>
                  </View>
                </View>

                <Feather name="chevron-right" size={20} color={colors.subtitle} />
              </Pressable>
            ) : null}

            {/* Logout */}
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [styles.settingRow, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.settings.logout')}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                  <Feather name="log-out" size={18} color={colors.logout} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.logout }]}>{t('profile.settings.logout')}</Text>
                  <Text style={[styles.rowDesc, { color: 'rgba(239,68,68,0.75)' }]}>{t('profile.settings.logoutSubtitle')}</Text>
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={createEventModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setCreateEventModalVisible(false)}
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          <CreateEventForm
            onCancel={() => setCreateEventModalVisible(false)}
            onSubmit={handleCreateEvent}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={!!editingEvent && !!editingEventFormData}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setEditingEvent(null)}
      >
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          {editingEvent && editingEventFormData ? (
            <EditEventForm
              eventId={editingEvent.id}
              initialData={editingEventFormData}
              onSubmit={handleSubmitEditEvent}
              onDelete={handleDeleteEvent}
              onCancel={() => setEditingEvent(null)}
            />
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={languageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <Pressable
          onPress={() => setLanguageModalVisible(false)}
          style={styles.modalBackdrop}
        >
          <Pressable
            onPress={() => void 0}
            style={[
              styles.languageModalCard,
              {
                backgroundColor: colors.cardBg,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.languageModalTitle, { color: colors.title }]}>{t('language.selectTitle')}</Text>
            <Text style={[styles.languageModalSubtitle, { color: colors.subtitle }]}>{t('language.selectSubtitle')}</Text>

            {([
              { code: 'vi' as const, label: t('language.vi') },
              { code: 'en' as const, label: t('language.en') },
            ]).map((item) => {
              const selected = language === item.code;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    setLanguage(item.code);
                    setLanguageModalVisible(false);
                    addNotification({
                      message: t('language.changeSuccess'),
                      type: 'success',
                      durationMs: 2200,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.languageOption,
                    {
                      borderColor: selected ? ExploreEaseColors.primary : colors.border,
                      backgroundColor: selected
                        ? 'rgba(34,211,238,0.14)'
                        : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'),
                    },
                    pressed ? { opacity: 0.84 } : null,
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? ExploreEaseColors.primary : colors.rowText,
                      fontSize: 14,
                      fontWeight: '800',
                    }}
                  >
                    {item.label}
                  </Text>
                  {selected ? <Feather name="check" size={16} color={ExploreEaseColors.primary} /> : null}
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => setLanguageModalVisible(false)}
              style={({ pressed }) => [
                styles.languageCloseBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                },
                pressed ? { opacity: 0.84 } : null,
              ]}
            >
              <Text style={{ color: colors.rowText, fontWeight: '800', fontSize: 13 }}>{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { paddingBottom: 140 },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 10 },
  pageTitle: { fontSize: 28, fontWeight: '900', letterSpacing: 0.2 },
  pageSubtitle: { marginTop: 6, fontSize: 13, fontWeight: '600' },

  profileCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, paddingRight: 12 },
  avatarActionWrap: {
    position: 'relative',
  },
  avatarWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarActionBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { fontSize: 36, fontWeight: '900', letterSpacing: 0.2 },
  profileMeta: { marginTop: 2, fontSize: 14, fontWeight: '700' },
  editBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  blockTitle: { marginTop: 18, fontSize: 20, fontWeight: '900' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, fontWeight: '800' },
  emptyInterestsCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyInterestsText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  editInterestsButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editInterestsButtonText: {
    color: '#001018',
    fontWeight: '900',
    fontSize: 13,
  },

  statsRow: { flexDirection: 'row', gap: 14, marginTop: 16 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },
  statValue: { marginTop: 16, fontSize: 32, fontWeight: '900' },
  myEventsSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  createEventButton: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: ExploreEaseColors.primary,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  createEventButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  myEventsCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  myEventsStateWrap: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  myEventsStateText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  myEventRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  myEventBody: {
    flex: 1,
    gap: 4,
  },
  myEventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  myEventTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  myEventMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  myEventActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  myEventIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  settingsCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  settingRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingRowFirst: {
    borderTopWidth: 0,
  },

  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowDesc: { marginTop: 2, fontSize: 12, fontWeight: '600' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  languageModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  languageModalTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  languageModalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  languageOption: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageCloseBtn: {
    marginTop: 4,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
