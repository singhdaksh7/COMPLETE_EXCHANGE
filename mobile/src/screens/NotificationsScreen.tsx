import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AsyncBoundary, Button, Card, EmptyState, Muted, Screen } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { userApi } from '@/api/userApi';
import { colors, font, spacing } from '@/theme';
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
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.head}>
        <Text style={styles.title}>Notifications</Text>
        {data && data.unread > 0 ? (
          <View style={{ width: 130 }}>
            <Button title={`Read all (${data.unread})`} variant="secondary" onPress={markAll} />
          </View>
        ) : null}
      </View>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={reload}
        empty={{ title: 'No notifications', hint: 'Account alerts will show up here.', icon: 'notifications-outline' }}
      >
        {(list) =>
          list.items.length === 0 ? (
            <EmptyState icon="notifications-outline" title="You're all caught up" hint="New account alerts will show up here." />
          ) : (
            <>
              {list.items.map((n) => (
                <Pressable key={n.id} onPress={() => !n.read && markOne(n.id)}>
                  <Card style={!n.read ? { borderColor: colors.brand } : undefined}>
                    <View style={styles.row}>
                      <Text style={styles.nTitle}>{n.title}</Text>
                      {!n.read ? <View style={styles.dot} /> : null}
                    </View>
                    <Text style={styles.msg}>{n.message}</Text>
                    <Muted>{fmtDate(n.createdAt)}</Muted>
                  </Card>
                </Pressable>
              ))}
            </>
          )
        }
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.ink, fontSize: font.xl, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nTitle: { color: colors.ink, fontSize: font.md, fontWeight: '700' },
  msg: { color: colors.muted, fontSize: font.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
