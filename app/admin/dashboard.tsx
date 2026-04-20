import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import { useI18n } from '@/src/i18n/useI18n';
import {
    adminService,
    type AdminAnalyticsCounts,
    type AdminEventRow,
    type AdminReviewReportRow,
} from '@/src/services/adminService';
import { eventService } from '@/src/services/eventService';
import { useNotificationStore } from '@/src/store/useNotificationStore';
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type AdminTab = 'events' | 'moderation' | 'analytics';

const DEFAULT_ANALYTICS: AdminAnalyticsCounts = {
  usersCount: 0,
  eventsCount: 0,
  reviewsCount: 0,
  pendingEventsCount: 0,
  approvedEventsCount: 0,
  rejectedEventsCount: 0,
};

const formatDateTime = (
  value: string | null | undefined,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string
) => {
  if (!value) return t('common.na');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(locale);
};

const toStatusLabel = (
  status: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
) => {
  const normalized = String(status ?? '').trim().toLowerCase();

  if (normalized === 'pending') return t('admin.status.pending');
  if (normalized === 'approved') return t('admin.status.approved');
  if (normalized === 'rejected') return t('admin.status.rejected');
  if (normalized === 'incoming') return t('event.status.incoming');
  if (normalized === 'ongoing') return t('event.status.ongoing');
  if (normalized === 'completed') return t('event.status.completed');

  return normalized ? normalized : t('admin.status.unknown');
};

const toStatusColor = (status: string | null | undefined) => {
  const normalized = String(status ?? '').trim().toLowerCase();

  if (normalized === 'approved' || normalized === 'incoming' || normalized === 'ongoing') {
    return {
      text: '#065f46',
      bg: 'rgba(16,185,129,0.18)',
      border: 'rgba(16,185,129,0.34)',
    };
  }

  if (normalized === 'rejected' || normalized === 'completed') {
    return {
      text: '#991b1b',
      bg: 'rgba(239,68,68,0.16)',
      border: 'rgba(239,68,68,0.34)',
    };
  }

  return {
    text: '#0c4a6e',
    bg: 'rgba(14,165,233,0.14)',
    border: 'rgba(14,165,233,0.32)',
  };
};

export default function AdminDashboardScreen() {
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [activeTab, setActiveTab] = useState<AdminTab>('events');

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [actingOnEventId, setActingOnEventId] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<AdminAnalyticsCounts>(DEFAULT_ANALYTICS);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const [moderationReports, setModerationReports] = useState<AdminReviewReportRow[]>([]);
  const [loadingModerationReports, setLoadingModerationReports] = useState(false);
  const [actingOnReportId, setActingOnReportId] = useState<string | null>(null);

  const colors = useMemo(
    () => ({
      background: isDark ? ExploreEaseColors.background : '#f8fafc',
      card: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
      border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      title: isDark ? '#ffffff' : '#0f172a',
      text: isDark ? '#e2e8f0' : '#0f172a',
      muted: isDark ? '#94a3b8' : '#64748b',
      tabIdle: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
    }),
    [isDark]
  );

  const notifyError = useCallback(
    (message: string) => {
      addNotification({
        message,
        type: 'error',
        durationMs: 3600,
      });
    },
    [addNotification]
  );

  const notifySuccess = useCallback(
    (message: string) => {
      addNotification({
        message,
        type: 'success',
        durationMs: 2400,
      });
    },
    [addNotification]
  );

  const loadEvents = useCallback(async () => {
    if (!hasAccess) return;

    setLoadingEvents(true);
    try {
      const rows = await adminService.getEventsForApproval();
      setEvents(rows);
    } catch (error: any) {
      const reason = String(error?.message ?? t('admin.error.loadEvents'));
      notifyError(reason);
    } finally {
      setLoadingEvents(false);
    }
  }, [hasAccess, notifyError, t]);

  const loadAnalytics = useCallback(async () => {
    if (!hasAccess) return;

    setLoadingAnalytics(true);
    try {
      const summary = await adminService.getAnalyticsCounts();
      setAnalytics(summary);
    } catch (error: any) {
      const reason = String(error?.message ?? t('admin.error.loadAnalytics'));
      notifyError(reason);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [hasAccess, notifyError, t]);

  const loadModerationReports = useCallback(async () => {
    if (!hasAccess) return;

    setLoadingModerationReports(true);
    try {
      const rows = await adminService.getPendingReviewReports();
      setModerationReports(rows);
    } catch (error: any) {
      const reason = String(error?.message ?? t('admin.error.loadReports'));
      notifyError(reason);
    } finally {
      setLoadingModerationReports(false);
    }
  }, [hasAccess, notifyError, t]);

  useEffect(() => {
    let alive = true;

    const verifyAccess = async () => {
      try {
        const isAdmin = await adminService.isCurrentUserAdmin();
        if (!alive) return;

        if (!isAdmin) {
          router.replace('/');
          return;
        }

        setHasAccess(true);
      } catch {
        if (alive) {
          router.replace('/');
        }
      } finally {
        if (alive) {
          setCheckingAccess(false);
        }
      }
    };

    void verifyAccess();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hasAccess) return;

    void loadEvents();
    void loadModerationReports();
    void loadAnalytics();
  }, [hasAccess, loadEvents, loadModerationReports, loadAnalytics]);

  const onApproveEvent = useCallback(
    async (eventId: string) => {
      if (actingOnEventId) return;

      setActingOnEventId(eventId);
      try {
        await eventService.updateEventApprovalStatus(eventId, 'approved');
        setEvents((prev) => prev.filter((row) => row.id !== eventId));
        notifySuccess(t('admin.success.eventApproved'));
      } catch (error: any) {
        const reason = String(error?.message ?? t('admin.error.approveEvent'));
        notifyError(reason);
      } finally {
        setActingOnEventId(null);
      }
    },
    [actingOnEventId, notifyError, notifySuccess, t]
  );

  const onRejectEvent = useCallback(
    async (eventId: string) => {
      if (actingOnEventId) return;

      setActingOnEventId(eventId);
      try {
        await eventService.updateEventApprovalStatus(eventId, 'rejected');
        setEvents((prev) => prev.filter((row) => row.id !== eventId));
        notifySuccess(t('admin.success.eventRejected'));
      } catch (error: any) {
        const reason = String(error?.message ?? t('admin.error.rejectEvent'));
        notifyError(reason);
      } finally {
        setActingOnEventId(null);
      }
    },
    [actingOnEventId, notifyError, notifySuccess, t]
  );

  const onDismissReport = useCallback(
    async (report: AdminReviewReportRow) => {
      if (actingOnReportId) return;

      setActingOnReportId(report.id);
      try {
        await adminService.dismissReviewReport(report.id, report.source);
        setModerationReports((prev) => prev.filter((row) => row.id !== report.id));
        notifySuccess(t('admin.success.reportDismissed'));
      } catch (error: any) {
        const reason = String(error?.message ?? t('admin.error.dismissReport'));
        notifyError(reason);
      } finally {
        setActingOnReportId(null);
      }
    },
    [actingOnReportId, notifyError, notifySuccess, t]
  );

  const onDeleteReportedReview = useCallback(
    async (report: AdminReviewReportRow) => {
      if (actingOnReportId) return;

      const reviewId = String(report.review?.id ?? '').trim();
      if (!reviewId) {
        Alert.alert(t('admin.alert.reviewNotFoundTitle'), t('admin.alert.reviewNotFoundMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('admin.actions.dismissReport'),
            onPress: () => {
              void onDismissReport(report);
            },
          },
        ]);
        return;
      }

      setActingOnReportId(report.id);
      try {
        await adminService.deleteReviewAndResolveReport(report.id, reviewId, report.source);
        setModerationReports((prev) =>
          prev.filter((row) => !(row.source === report.source && row.review_id === report.review_id))
        );
        notifySuccess(t('admin.success.reviewDeleted'));
      } catch (error: any) {
        const reason = String(error?.message ?? t('admin.error.deleteReview'));
        notifyError(reason);
      } finally {
        setActingOnReportId(null);
      }
    },
    [actingOnReportId, notifyError, notifySuccess, onDismissReport, t]
  );

  if (checkingAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: colors.muted }]}>{t('admin.accessChecking')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.title }]}>{t('admin.title')}</Text>
            <Text style={[styles.pageSubtitle, { color: colors.muted }]}>{t('admin.subtitle')}</Text>
          </View>

          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [
              styles.backBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.84 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Feather name="home" size={16} color={colors.title} />
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('events')}
            style={({ pressed }) => [
              styles.tabBtn,
              {
                backgroundColor: activeTab === 'events' ? ExploreEaseColors.primary : colors.tabIdle,
                borderColor: activeTab === 'events' ? ExploreEaseColors.primary : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, { color: activeTab === 'events' ? '#001018' : colors.text }]}>{t('admin.tabs.eventApproval')}</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('moderation')}
            style={({ pressed }) => [
              styles.tabBtn,
              {
                backgroundColor: activeTab === 'moderation' ? ExploreEaseColors.primary : colors.tabIdle,
                borderColor: activeTab === 'moderation' ? ExploreEaseColors.primary : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, { color: activeTab === 'moderation' ? '#001018' : colors.text }]}>{t('admin.tabs.moderation')}</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('analytics')}
            style={({ pressed }) => [
              styles.tabBtn,
              {
                backgroundColor: activeTab === 'analytics' ? ExploreEaseColors.primary : colors.tabIdle,
                borderColor: activeTab === 'analytics' ? ExploreEaseColors.primary : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, { color: activeTab === 'analytics' ? '#001018' : colors.text }]}>{t('admin.tabs.analytics')}</Text>
          </Pressable>
        </View>

        {activeTab === 'events' ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('admin.events.sectionTitle')}</Text>
              <Pressable
                onPress={() => void loadEvents()}
                disabled={loadingEvents}
                style={({ pressed }) => [
                  styles.refreshBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.tabIdle,
                    opacity: loadingEvents ? 0.7 : pressed ? 0.84 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Feather name="refresh-cw" size={14} color={colors.text} />
                <Text style={[styles.refreshText, { color: colors.text }]}>{t('admin.refresh')}</Text>
              </Pressable>
            </View>

            {loadingEvents && events.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.stateText, { color: colors.muted }]}>{t('admin.events.loading')}</Text>
              </View>
            ) : null}

            {!loadingEvents && events.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <Text style={[styles.stateText, { color: colors.muted }]}>{t('admin.events.empty')}</Text>
              </View>
            ) : null}

            {events.map((event) => {
              const approvalStatus = String(event.approval_status ?? 'pending');
              const statusStyle = toStatusColor(approvalStatus);

              return (
                <View key={event.id} style={[styles.itemCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={[styles.itemTitle, { color: colors.title }]} numberOfLines={2}>
                      {event.title || t('admin.events.untitled')}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: statusStyle.bg,
                          borderColor: statusStyle.border,
                        },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>{toStatusLabel(approvalStatus, t)}</Text>
                    </View>
                  </View>

                  <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                    {t('admin.events.creatorLabel', { creator: event.creator_name?.trim() || event.creator_id })}
                  </Text>
                  <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                    {t('admin.events.createdLabel', { value: formatDateTime(event.created_at ?? null, locale, t) })}
                  </Text>
                  <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                    {t('admin.events.timeLabel', {
                      start: formatDateTime(event.start_time, locale, t),
                      end: formatDateTime(event.end_time, locale, t),
                    })}
                  </Text>

                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => void onApproveEvent(event.id)}
                      disabled={actingOnEventId === event.id}
                      style={({ pressed }) => [
                        styles.approveBtn,
                        actingOnEventId === event.id ? { opacity: 0.65 } : null,
                        pressed ? { opacity: 0.84 } : null,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.approveBtnText}>{t('admin.actions.approve')}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        Alert.alert(t('admin.alert.rejectEventTitle'), t('admin.alert.rejectEventMessage'), [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('admin.actions.reject'),
                            style: 'destructive',
                            onPress: () => {
                              void onRejectEvent(event.id);
                            },
                          },
                        ]);
                      }}
                      disabled={actingOnEventId === event.id}
                      style={({ pressed }) => [
                        styles.rejectBtn,
                        actingOnEventId === event.id ? { opacity: 0.65 } : null,
                        pressed ? { opacity: 0.84 } : null,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.rejectBtnText}>{t('admin.actions.reject')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {activeTab === 'moderation' ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('admin.reports.sectionTitle')}</Text>
              <Pressable
                onPress={() => void loadModerationReports()}
                disabled={loadingModerationReports}
                style={({ pressed }) => [
                  styles.refreshBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.tabIdle,
                    opacity: loadingModerationReports ? 0.7 : pressed ? 0.84 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Feather name="refresh-cw" size={14} color={colors.text} />
                <Text style={[styles.refreshText, { color: colors.text }]}>{t('admin.refresh')}</Text>
              </Pressable>
            </View>

            {loadingModerationReports && moderationReports.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.stateText, { color: colors.muted }]}>{t('admin.reports.loading')}</Text>
              </View>
            ) : null}

            {!loadingModerationReports && moderationReports.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <Text style={[styles.stateText, { color: colors.muted }]}>{t('admin.reports.empty')}</Text>
              </View>
            ) : null}

            {moderationReports.map((report) => (
              <View key={report.id} style={[styles.itemCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}> 
                <View style={styles.itemHeaderRow}>
                  <Text style={[styles.itemTitle, { color: colors.title }]} numberOfLines={1}>
                    {t('admin.reports.reportId', { id: report.id.slice(0, 8) })}
                  </Text>
                  <Text style={[styles.reportDateText, { color: colors.muted }]}>{formatDateTime(report.created_at, locale, t)}</Text>
                </View>

                <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                  {t('admin.reports.reporterLabel', { reporter: report.reporter_name?.trim() || report.reporter_id })}
                </Text>
                <Text style={[styles.itemMetaText, { color: colors.muted }]}>
                  {t('admin.reports.sourceLabel', {
                    source: report.source === 'event'
                      ? t('admin.reports.sourceEvent')
                      : t('admin.reports.sourceDestination'),
                  })}
                </Text>
                <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={2}>
                  {t('admin.reports.reasonLabel', { reason: report.reason })}
                </Text>

                <View style={[styles.flaggedReviewWrap, { borderColor: colors.border }]}>
                  <Text style={[styles.flaggedReviewTitle, { color: colors.title }]}>{t('admin.reports.flaggedReview')}</Text>

                  {report.review ? (
                    <>
                      <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                        {t('admin.reports.authorLabel', {
                          author: report.review.reviewer_name?.trim() || report.review.user_id,
                        })}
                      </Text>
                      <Text style={[styles.itemMetaText, { color: colors.muted }]}>
                        {t('admin.reports.ratingLabel', { rating: report.review.rating })}
                      </Text>
                      <Text style={[styles.reportReasonText, { color: colors.text }]}>
                        {t('admin.reports.commentLabel', {
                          comment: report.review.comment || t('review.card.noComment'),
                        })}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.reportReasonText, { color: colors.muted }]}>
                      {t('admin.reports.reviewMissing')}
                    </Text>
                  )}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => {
                      void onDismissReport(report);
                    }}
                    disabled={actingOnReportId === report.id}
                    style={({ pressed }) => [
                      styles.dismissBtn,
                      actingOnReportId === report.id ? { opacity: 0.5 } : null,
                      pressed ? { opacity: 0.84 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.dismissBtnText}>{t('admin.actions.dismissReport')}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      Alert.alert(t('admin.alert.deleteReviewTitle'), t('admin.alert.deleteReviewMessage'), [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('admin.actions.deleteReview'),
                          style: 'destructive',
                          onPress: () => {
                            void onDeleteReportedReview(report);
                          },
                        },
                      ]);
                    }}
                    disabled={actingOnReportId === report.id || !report.review}
                    style={({ pressed }) => [
                      styles.deleteBtn,
                      actingOnReportId === report.id || !report.review ? { opacity: 0.5 } : null,
                      pressed ? { opacity: 0.84 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.deleteBtnText}>{t('admin.actions.deleteReview')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === 'analytics' ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>{t('admin.analytics.sectionTitle')}</Text>
              <Pressable
                onPress={() => void loadAnalytics()}
                disabled={loadingAnalytics}
                style={({ pressed }) => [
                  styles.refreshBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.tabIdle,
                    opacity: loadingAnalytics ? 0.7 : pressed ? 0.84 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Feather name="refresh-cw" size={14} color={colors.text} />
                <Text style={[styles.refreshText, { color: colors.text }]}>{t('admin.refresh')}</Text>
              </Pressable>
            </View>

            {loadingAnalytics ? (
              <View style={styles.stateWrapInner}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.stateText, { color: colors.muted }]}>{t('admin.analytics.loading')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.analyticsGrid}>
                  <View style={[styles.analyticsCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                    <View style={styles.analyticsIconWrap}>
                      <Feather name="users" size={16} color={colors.title} />
                    </View>
                    <Text style={[styles.analyticsValue, { color: colors.title }]}>{analytics.usersCount.toLocaleString(locale)}</Text>
                    <Text style={[styles.analyticsLabel, { color: colors.muted }]}>{t('admin.analytics.users')}</Text>
                  </View>

                  <View style={[styles.analyticsCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                    <View style={styles.analyticsIconWrap}>
                      <Feather name="calendar" size={16} color={colors.title} />
                    </View>
                    <Text style={[styles.analyticsValue, { color: colors.title }]}>{analytics.eventsCount.toLocaleString(locale)}</Text>
                    <Text style={[styles.analyticsLabel, { color: colors.muted }]}>{t('admin.analytics.events')}</Text>
                  </View>

                  <View style={[styles.analyticsCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                    <View style={styles.analyticsIconWrap}>
                      <Feather name="message-square" size={16} color={colors.title} />
                    </View>
                    <Text style={[styles.analyticsValue, { color: colors.title }]}>{analytics.reviewsCount.toLocaleString(locale)}</Text>
                    <Text style={[styles.analyticsLabel, { color: colors.muted }]}>{t('admin.analytics.reviews')}</Text>
                  </View>
                </View>

                <View style={[styles.analyticsSummaryCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                  <Text style={[styles.analyticsSummaryTitle, { color: colors.title }]}>{t('admin.analytics.eventApprovalBreakdown')}</Text>
                  <Text style={[styles.analyticsSummaryText, { color: colors.muted }]}>
                    {t('admin.analytics.pendingEventsLabel', { count: analytics.pendingEventsCount.toLocaleString(locale) })}
                  </Text>
                  <Text style={[styles.analyticsSummaryText, { color: colors.muted }]}>
                    {t('admin.analytics.approvedEventsLabel', { count: analytics.approvedEventsCount.toLocaleString(locale) })}
                  </Text>
                  <Text style={[styles.analyticsSummaryText, { color: colors.muted }]}>
                    {t('admin.analytics.rejectedEventsLabel', { count: analytics.rejectedEventsCount.toLocaleString(locale) })}
                  </Text>
                </View>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '900',
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    flex: 1,
  },
  refreshBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '800',
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
  },
  statusPill: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  itemMetaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
  },
  approveBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  rejectBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  dismissBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  deleteBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  reportDateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reportReasonText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  analyticsGrid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  analyticsCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 102,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    gap: 4,
  },
  analyticsIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  analyticsLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  analyticsSummaryCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  analyticsSummaryTitle: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  analyticsSummaryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  flaggedReviewWrap: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  flaggedReviewTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateWrapInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
