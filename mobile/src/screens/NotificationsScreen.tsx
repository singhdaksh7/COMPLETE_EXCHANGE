import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AsyncBoundary, EmptyState, Screen } from '@/components/ui';
import { GlassCard } from '@/components/premium';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, radius, spacing } from '@/theme';
import { fmtDate } from '@/utils/format';
import type { NotificationList } from '@/types/api';

export default function NotificationsScreen() {
  const { data, loading, error, reload } = useApi<NotificationList>(
    () => userApi.listNotifications().then((r) => r.data),
    [],
  );

  const markAll = async () => {
    try {
      await userApi.markAllNotificationsRead();
      reload();
    } catch {
      /* non-fatal */
    }
  };

  const markOne = async (id: string) => {
    try {
      await userApi.markNotificationRead(id);
      reload();
    } catch {
      /* non-fatal */
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={reload} contentStyle={{ gap: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        
        {/* Custom Header Bar */}
        <View style={styles.header}>
          <Text style={styles.title}>Notifications</Text>
          {data && data.unread > 0 ? (
            <Pressable onPress={markAll} style={styles.readAllBtn}>
              <Ionicons name="mail-open-outline" size={14} color="#1A1206" />
              <Text style={styles.readAllBtnText}>Read all ({data.unread})</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Notifications List Async Boundary */}
        <AsyncBoundary
          loading={loading}
          error={error}
          data={data}
          onRetry={reload}
        >
          {(list) =>
            list.items.length === 0 ? (
              <View style={{ marginTop: spacing.xl }}>
                <EmptyState
                  icon="notifications-outline"
                  title="You're all caught up"
                  hint="New account alerts and price warnings will show up here."
                />
              </View>
            ) : (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {list.items.map((n) => (
                  <Pressable key={n.id} onPress={() => !n.read && markOne(n.id)}>
                    <GlassCard
                      padded
                      style={{
                        ...styles.itemCard,
                        ...(!n.read ? styles.itemCardUnread : {}),
                      }}
                    >
                      <View style={styles.itemHeaderRow}>
                        <View style={styles.titleGlowRow}>
                          {!n.read && <View style={styles.unreadDot} />}
                          <Text style={[styles.itemTitle, !n.read && { color: '#fff' }]}>
                            {n.title}
                          </Text>
                        </View>
                        <Text style={styles.dateText}>{fmtDate(n.createdAt)}</Text>
                      </View>
                      <Text style={styles.itemMessage}>{n.message}</Text>
                    </GlassCard>
                  </Pressable>
                ))}
              </View>
            )
          }
        </AsyncBoundary>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  title: { color: '#fff', fontSize: font.xl, fontWeight: '900' },
  readAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  readAllBtnText: { color: '#1A1206', fontSize: 10, fontWeight: '800' },

  // List Cards
  itemCard: { gap: spacing.xs },
  itemCardUnread: {
    borderColor: 'rgba(245,194,66,0.15)',
    backgroundColor: 'rgba(245,194,66,0.02)',
  },
  itemHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleGlowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  itemTitle: { color: colors.ink, fontSize: font.sm, fontWeight: '800' },
  dateText: { color: colors.muted2, fontSize: 9 },
  itemMessage: { color: colors.muted, fontSize: font.xs, lineHeight: 16 },
});
