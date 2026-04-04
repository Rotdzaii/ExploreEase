import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import { adminService } from '@/src/services/adminService';
import { profileService } from '@/src/services/profileService';
import { supabase } from '@/src/services/supabase';
import { useLanguageStore } from '@/src/store/useLanguageStore';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function ProfileScreen() {
  const { isDark, toggleColorScheme } = useTheme();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { language, t } = useI18n();
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const [profileName, setProfileName] = React.useState<string>('Nguyên');
  const [nationality, setNationality] = React.useState<string>('Việt Nam');
  const [nationalityCode, setNationalityCode] = React.useState<string>('VN');
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [languageModalVisible, setLanguageModalVisible] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [profile, hasAdminRole] = await Promise.all([
          profileService.getCurrentProfile(),
          adminService.isCurrentUserAdmin().catch(() => false),
        ]);

        if (!alive) return;

        setIsAdmin(hasAdminRole);
        if (!profile) return;

        const normalizedName = typeof profile.full_name === 'string' && profile.full_name.trim()
          ? profile.full_name.trim()
          : 'Nguyên';

        const rawNationality = (profile.nationality ?? '').toString().trim();
        const normalizedNationality = rawNationality === 'VN' || rawNationality.toLowerCase() === 'việt nam'
          ? 'Việt Nam'
          : (rawNationality || 'Việt Nam');

        const normalizedNationalityCode = rawNationality.toUpperCase() === 'VN' || rawNationality.toLowerCase() === 'việt nam'
          ? 'VN'
          : (rawNationality.length === 2 ? rawNationality.toUpperCase() : 'US');

        setProfileName(normalizedName);
        setNationality(normalizedNationality);
        setNationalityCode(normalizedNationalityCode);
      } catch {
        setIsAdmin(false);
        // keep fallbacks
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

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

  const currencyLabel = nationalityCode === 'VN' ? 'VNĐ' : 'USD';

  const handleEditProfile = React.useCallback(() => {
    router.push('/profile-setup');
  }, []);

  const handleLogout = React.useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace('/login');
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={[styles.pageTitle, { color: colors.title }]}>Hồ sơ</Text>
          <Text style={[styles.pageSubtitle, { color: colors.subtitle }]}>Quản lý thông tin cá nhân và cài đặt</Text>

          {/* Profile header */}
          <View style={[styles.profileCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.profileLeft}>
              <View style={[styles.avatarWrap, { borderColor: colors.border }]}>
                <Image
                  source={{ uri: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(profileName)}` }}
                  style={styles.avatar}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.profileName, { color: colors.title }]} numberOfLines={1}>
                  {profileName}
                </Text>
                <Text style={[styles.profileMeta, { color: colors.subtitle }]} numberOfLines={1}>
                  {nationality}
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
              accessibilityLabel="Chỉnh sửa hồ sơ"
            >
              <Feather name="edit-2" size={18} color={colors.title} />
            </Pressable>
          </View>

          {/* Interests */}
          <Text style={[styles.blockTitle, { color: colors.title }]}>Sở thích của tôi</Text>
          <View style={styles.chipsRow}>
            <View style={[styles.chip, { borderColor: colors.chipBorder, backgroundColor: colors.cardBg }]}>
              <Feather name="coffee" size={16} color={colors.title} />
              <Text style={[styles.chipText, { color: colors.title }]}>Ẩm thực</Text>
            </View>
            <View style={[styles.chip, { borderColor: colors.chipBorder, backgroundColor: colors.cardBg }]}>
              <Feather name="feather" size={16} color={colors.title} />
              <Text style={[styles.chipText, { color: colors.title }]}>Thiên nhiên</Text>
            </View>
            <View style={[styles.chip, { borderColor: colors.chipBorder, backgroundColor: colors.cardBg }]}>
              <Feather name="zap" size={16} color={colors.title} />
              <Text style={[styles.chipText, { color: colors.title }]}>Phiêu lưu</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.statCardBg, borderColor: colors.border }]}>
              <View style={styles.statTop}>
                <Feather name="map-pin" size={16} color={colors.title} />
                <Text style={[styles.statLabel, { color: colors.subtitle }]}>CHUYẾN ĐI ĐÃ LƯU</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.title }]}>12</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.statCardBg, borderColor: colors.border }]}>
              <View style={styles.statTop}>
                <Feather name="star" size={16} color={colors.title} />
                <Text style={[styles.statLabel, { color: colors.subtitle }]}>ĐÁNH GIÁ CỦA TÔI</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.title }]}>8</Text>
            </View>
          </View>

          {/* Settings */}
          <Text style={[styles.blockTitle, { color: colors.title, marginTop: 18 }]}>Cài đặt</Text>
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
                  <Text style={[styles.rowTitle, { color: colors.rowText }]}>Chế độ tối</Text>
                  <Text style={[styles.rowDesc, { color: colors.subtitle }]}>{isDark ? 'Bật' : 'Tắt'}</Text>
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
              accessibilityLabel="Ngôn ngữ"
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
              accessibilityLabel="Tiền tệ"
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { borderColor: colors.border, backgroundColor: 'transparent' }]}>
                  <Feather name="dollar-sign" size={18} color={colors.title} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.rowText }]}>Tiền tệ</Text>
                  <Text style={[styles.rowDesc, { color: colors.subtitle }]}>{currencyLabel}</Text>
                </View>
              </View>

              <Feather name="chevron-right" size={20} color={colors.subtitle} />
            </Pressable>

            {isAdmin ? (
              <Pressable
                onPress={() => router.push('/admin/dashboard')}
                style={({ pressed }) => [styles.settingRow, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Admin Dashboard"
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.iconWrap, { borderColor: colors.border, backgroundColor: 'transparent' }]}>
                    <Feather name="shield" size={18} color={colors.title} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.rowText }]}>Admin Dashboard</Text>
                    <Text style={[styles.rowDesc, { color: colors.subtitle }]}>Moderate events and review reports</Text>
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
              accessibilityLabel="Đăng xuất"
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                  <Feather name="log-out" size={18} color={colors.logout} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.logout }]}>Đăng xuất</Text>
                  <Text style={[styles.rowDesc, { color: 'rgba(239,68,68,0.75)' }]}>Thoát khỏi tài khoản của bạn</Text>
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
