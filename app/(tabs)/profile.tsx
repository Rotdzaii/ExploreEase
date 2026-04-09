import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { adminService } from '@/src/services/adminService';
import { itineraryService } from '@/src/services/itineraryService';
import { profileService } from '@/src/services/profileService';
import { reviewService } from '@/src/services/reviewService';
import { supabase } from '@/src/services/supabase';
import { useLanguageStore } from '@/src/store/useLanguageStore';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function ProfileScreen() {
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
              onPress={() => setLanguageModalVisible(true)}
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
