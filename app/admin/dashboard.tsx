import { ExploreEaseColors } from '@/constants/exploreEaseTheme';
import { useTheme } from '@/src/context/theme';
import {
    adminService,
    type AdminEventRow,
    type AdminReviewReportRow,
} from '@/src/services/adminService';
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

type AdminTab = 'events' | 'moderation';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN');
};

const toStatusLabel = (status: string | null | undefined) => {
  const normalized = String(status ?? '').trim().toLowerCase();

  if (normalized === 'pending') return 'Pending';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'incoming') return 'Incoming';
  if (normalized === 'ongoing') return 'Ongoing';
  if (normalized === 'completed') return 'Completed';

  return normalized ? normalized : 'Unknown';
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
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [activeTab, setActiveTab] = useState<AdminTab>('events');

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [actingOnEventId, setActingOnEventId] = useState<string | null>(null);

  const [reports, setReports] = useState<AdminReviewReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
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
      const reason = String(error?.message ?? 'Unable to load events');
      notifyError(reason);
    } finally {
      setLoadingEvents(false);
    }
  }, [hasAccess, notifyError]);

  const loadReports = useCallback(async () => {
    if (!hasAccess) return;

    setLoadingReports(true);
    try {
      const rows = await adminService.getPendingReviewReports();
      setReports(rows);
    } catch (error: any) {
      const reason = String(error?.message ?? 'Unable to load pending reports');
      notifyError(reason);
    } finally {
      setLoadingReports(false);
    }
  }, [hasAccess, notifyError]);

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
    void loadReports();
  }, [hasAccess, loadEvents, loadReports]);

  const onApproveEvent = useCallback(
    async (eventId: string) => {
      if (actingOnEventId) return;

      setActingOnEventId(eventId);
      try {
        const updated = await adminService.updateEventApprovalStatus(eventId, 'approved');
        setEvents((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        notifySuccess('Event approved');
      } catch (error: any) {
        const reason = String(error?.message ?? 'Unable to approve event');
        notifyError(reason);
      } finally {
        setActingOnEventId(null);
      }
    },
    [actingOnEventId, notifyError, notifySuccess]
  );

  const onRejectEvent = useCallback(
    async (eventId: string) => {
      if (actingOnEventId) return;

      setActingOnEventId(eventId);
      try {
        const updated = await adminService.updateEventApprovalStatus(eventId, 'rejected');
        setEvents((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        notifySuccess('Event rejected');
      } catch (error: any) {
        const reason = String(error?.message ?? 'Unable to reject event');
        notifyError(reason);
      } finally {
        setActingOnEventId(null);
      }
    },
    [actingOnEventId, notifyError, notifySuccess]
  );

  const onDismissReport = useCallback(
    async (reportId: string) => {
      if (actingOnReportId) return;

      setActingOnReportId(reportId);
      try {
        await adminService.dismissReviewReport(reportId);
        setReports((prev) => prev.filter((row) => row.id !== reportId));
        notifySuccess('Report dismissed');
      } catch (error: any) {
        const reason = String(error?.message ?? 'Unable to dismiss report');
        notifyError(reason);
      } finally {
        setActingOnReportId(null);
      }
    },
    [actingOnReportId, notifyError, notifySuccess]
  );

  const onDeleteReview = useCallback(
    async (report: AdminReviewReportRow) => {
      if (actingOnReportId) return;

      if (!report.review) {
        notifyError('Review data is missing for this report');
        return;
      }

      setActingOnReportId(report.id);
      try {
        await adminService.deleteReviewAndResolveReport(report.id, report.review_id);
        setReports((prev) => prev.filter((row) => row.review_id !== report.review_id));
        notifySuccess('Review deleted and report resolved');
      } catch (error: any) {
        const reason = String(error?.message ?? 'Unable to delete review');
        notifyError(reason);
      } finally {
        setActingOnReportId(null);
      }
    },
    [actingOnReportId, notifyError, notifySuccess]
  );

  if (checkingAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.stateWrap}>
          <ActivityIndicator color={ExploreEaseColors.primary} />
          <Text style={[styles.stateText, { color: colors.muted }]}>Checking admin access...</Text>
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
            <Text style={[styles.pageTitle, { color: colors.title }]}>Admin Dashboard</Text>
            <Text style={[styles.pageSubtitle, { color: colors.muted }]}>Manage event approvals and moderation reports</Text>
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
            <Text style={[styles.tabText, { color: activeTab === 'events' ? '#001018' : colors.text }]}>Event Approval</Text>
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
            <Text style={[styles.tabText, { color: activeTab === 'moderation' ? '#001018' : colors.text }]}>Moderation</Text>
          </Pressable>
        </View>

        {activeTab === 'events' ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.title }]}>User Events</Text>
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
                <Text style={[styles.refreshText, { color: colors.text }]}>Refresh</Text>
              </Pressable>
            </View>

            {loadingEvents && events.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.stateText, { color: colors.muted }]}>Loading events...</Text>
              </View>
            ) : null}

            {!loadingEvents && events.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <Text style={[styles.stateText, { color: colors.muted }]}>No events found</Text>
              </View>
            ) : null}

            {events.map((event) => {
              const statusStyle = toStatusColor(String(event.status));

              return (
                <View key={event.id} style={[styles.itemCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={[styles.itemTitle, { color: colors.title }]} numberOfLines={2}>
                      {event.title || 'Untitled event'}
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
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>{toStatusLabel(String(event.status))}</Text>
                    </View>
                  </View>

                  <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                    Creator: {event.creator_name?.trim() || event.creator_id}
                  </Text>
                  <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                    Created: {formatDateTime(event.created_at ?? null)}
                  </Text>
                  <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                    Time: {formatDateTime(event.start_time)} - {formatDateTime(event.end_time)}
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
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        Alert.alert('Reject event', 'Do you want to reject this event?', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Reject',
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
                      <Text style={styles.rejectBtnText}>Reject</Text>
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
              <Text style={[styles.sectionTitle, { color: colors.title }]}>Pending Review Reports</Text>
              <Pressable
                onPress={() => void loadReports()}
                disabled={loadingReports}
                style={({ pressed }) => [
                  styles.refreshBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.tabIdle,
                    opacity: loadingReports ? 0.7 : pressed ? 0.84 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Feather name="refresh-cw" size={14} color={colors.text} />
                <Text style={[styles.refreshText, { color: colors.text }]}>Refresh</Text>
              </Pressable>
            </View>

            {loadingReports && reports.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <ActivityIndicator color={ExploreEaseColors.primary} />
                <Text style={[styles.stateText, { color: colors.muted }]}>Loading reports...</Text>
              </View>
            ) : null}

            {!loadingReports && reports.length === 0 ? (
              <View style={styles.stateWrapInner}>
                <Text style={[styles.stateText, { color: colors.muted }]}>No pending reports</Text>
              </View>
            ) : null}

            {reports.map((report) => (
              <View key={report.id} style={[styles.itemCard, { borderColor: colors.border, backgroundColor: colors.tabIdle }]}>
                <View style={styles.itemHeaderRow}>
                  <Text style={[styles.itemTitle, { color: colors.title }]} numberOfLines={1}>
                    Report #{report.id.slice(0, 8)}
                  </Text>
                  <Text style={[styles.reportDateText, { color: colors.muted }]}>{formatDateTime(report.created_at)}</Text>
                </View>

                <Text style={[styles.reportReasonText, { color: colors.text }]}>{report.reason}</Text>
                <Text style={[styles.itemMetaText, { color: colors.muted }]} numberOfLines={1}>
                  Reporter: {report.reporter_name?.trim() || report.reporter_id}
                </Text>

                <View style={[styles.flaggedReviewWrap, { borderColor: colors.border }]}>
                  <Text style={[styles.flaggedReviewTitle, { color: colors.title }]}>Flagged review</Text>
                  {report.review ? (
                    <>
                      <Text style={[styles.itemMetaText, { color: colors.muted }]}>Rating: {report.review.rating}/5</Text>
                      <Text style={[styles.itemMetaText, { color: colors.muted }]}>Author: {report.review.reviewer_name?.trim() || report.review.user_id}</Text>
                      <Text style={[styles.reportReasonText, { color: colors.text }]}>Comment: {report.review.comment || '(No comment)'}</Text>
                    </>
                  ) : (
                    <Text style={[styles.itemMetaText, { color: colors.muted }]}>Review record no longer exists</Text>
                  )}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => void onDismissReport(report.id)}
                    disabled={actingOnReportId === report.id}
                    style={({ pressed }) => [
                      styles.dismissBtn,
                      actingOnReportId === report.id ? { opacity: 0.65 } : null,
                      pressed ? { opacity: 0.84 } : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.dismissBtnText}>Dismiss Report</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (!report.review) {
                        Alert.alert('Review not found', 'This review was already removed. You can dismiss the report.');
                        return;
                      }

                      Alert.alert('Delete review', 'Delete flagged review and resolve this report?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            void onDeleteReview(report);
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
                    <Text style={styles.deleteBtnText}>Delete Review</Text>
                  </Pressable>
                </View>
              </View>
            ))}
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
