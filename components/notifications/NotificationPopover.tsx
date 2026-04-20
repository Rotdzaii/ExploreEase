import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import type { AppNotification } from '@/src/store/useNotificationStore';
import React, { useEffect, useMemo } from 'react';
import {
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type NotificationPopoverProps = {
  visible: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  top: number;
  right: number;
  onClose: () => void;
  onPressNotification: (id: string) => void;
  onPressViewAll: () => void;
  onPressClearAll: () => void;
  isClearingAll?: boolean;
  canClearAll?: boolean;
};

const formatNotificationTime = (createdAt: number, locale: string) => {
  if (!Number.isFinite(createdAt)) return '';

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
};

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

export function NotificationPopover({
  visible,
  notifications,
  unreadCount,
  top,
  right,
  onClose,
  onPressNotification,
  onPressViewAll,
  onPressClearAll,
  isClearingAll = false,
  canClearAll,
}: NotificationPopoverProps) {
  const { isDark } = useTheme();
  const { t, language } = useI18n();

  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const previewItems = useMemo(
    () =>
      [...notifications]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 24),
    [notifications]
  );
  const canUseClearAll = canClearAll ?? previewItems.length > 0;

  useEffect(() => {
    if (!visible) return;
    releaseOverlayTriggerFocus();
  }, [visible]);

  const surface = isDark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)';
  const border = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.08)';
  const titleColor = isDark ? '#ffffff' : '#0f172a';
  const subtitleColor = isDark ? '#94a3b8' : '#64748b';
  const rowBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15, 23, 42, 0.03)';
  const rowBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15, 23, 42, 0.06)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Pressable
            style={[
              styles.card,
              {
                top,
                right,
                backgroundColor: surface,
                borderColor: border,
              },
            ]}
            onPress={() => void 0}
            accessibilityRole="menu"
            accessibilityLabel={t('home.notifications')}
          >
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: titleColor }]}>{t('home.notifications')}</Text>
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.subtitle, { color: subtitleColor }]}>
              {previewItems.length > 0
                ? t('notifications.summary.withCount', {
                    total: previewItems.length,
                    unread: unreadCount,
                  })
                : t('notifications.summary.empty')}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                onPress={onPressClearAll}
                disabled={!canUseClearAll || isClearingAll}
                style={({ pressed, hovered }) => [
                  styles.clearAllBtn,
                  {
                    borderColor: rowBorder,
                    backgroundColor: rowBg,
                    opacity: !canUseClearAll || isClearingAll ? 0.5 : pressed ? 0.82 : 1,
                  },
                  Platform.OS === 'web' && hovered ? { opacity: 0.96 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.clearAllAccessibility')}
              >
                <Text style={[styles.clearAllText, { color: titleColor }]}>
                  {isClearingAll ? t('notifications.clearAllUpdating') : t('notifications.clearAll')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.listWrap}>
              {previewItems.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: subtitleColor }]}>
                    {t('notifications.popover.empty')}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {previewItems.map((item) => {
                    const timeText = formatNotificationTime(item.createdAt, locale);
                    const unread = !item.read;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => onPressNotification(item.id)}
                        style={({ pressed, hovered }) => [
                          styles.item,
                          {
                            backgroundColor: rowBg,
                            borderColor: rowBorder,
                          },
                          Platform.OS === 'web' && hovered ? { opacity: 0.98 } : null,
                          pressed ? { opacity: 0.85 } : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={unread ? t('notifications.item.accessibility.unread') : t('notifications.item.accessibility.read')}
                      >
                        <View style={styles.itemMain}>
                          <View style={[styles.itemDot, { backgroundColor: unread ? ExploreEaseColors.primary : 'transparent' }]} />
                          <View style={styles.itemContent}>
                            <Text style={[styles.itemMessage, { color: titleColor }]} numberOfLines={2}>
                              {item.message || t('notifications.item.defaultMessage')}
                            </Text>
                            <Text style={[styles.itemTime, { color: subtitleColor }]} numberOfLines={1}>
                              {timeText}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <Pressable
              onPress={onPressViewAll}
              style={({ pressed, hovered }) => [
                styles.viewAllBtn,
                { borderTopColor: rowBorder },
                Platform.OS === 'web' && hovered ? { opacity: 0.98 } : null,
                pressed ? { opacity: 0.84 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.popover.viewAll')}
            >
              <Text style={[styles.viewAllText, { color: ExploreEaseColors.primary }]}>
                {t('notifications.popover.viewAll')}
              </Text>
            </Pressable>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.18)',
  },
  card: {
    position: 'absolute',
    width: 340,
    maxWidth: '92%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    paddingTop: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  clearAllBtn: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: '900',
  },
  listWrap: {
    maxHeight: 350,
  },
  listContent: {
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  emptyWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  item: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  itemMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginTop: 6,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemMessage: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewAllBtn: {
    height: 48,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '900',
  },
});
