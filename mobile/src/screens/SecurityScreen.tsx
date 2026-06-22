import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AsyncBoundary, Button, Card, H2, Input, Muted, Row, Screen, StatusBadge } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/store/auth';
import { userApi } from '@/api/userApi';
import { actionErrorMessage } from '@/api/client';
import { colors, spacing } from '@/theme';
import { fmtDate } from '@/utils/format';
import type { UserSession } from '@/types/api';

export default function SecurityScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const sessions = useApi<UserSession[]>(
    () => userApi.listSessions().then((r) => r.data.items),
    [],
  );

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const changePassword = async () => {
    setPwMsg(null);
    setPwErr(null);
    setPwBusy(true);
    try {
      await userApi.changePassword({ currentPassword: current, newPassword: next });
      setPwMsg('Password changed.');
      setCurrent('');
      setNext('');
    } catch (e) {
      setPwErr(actionErrorMessage(e));
    } finally {
      setPwBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await userApi.revokeSession(id);
      sessions.reload();
    } catch {
      /* non-fatal */
    }
  };

  const doLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Screen refreshing={sessions.loading} onRefresh={sessions.reload}>
      <H2>Change password</H2>
      <Card>
        <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
        <Input label="New password" value={next} onChangeText={setNext} secureTextEntry placeholder="At least 8 characters" />
        {pwErr ? <Text style={{ color: colors.down }}>{pwErr}</Text> : null}
        {pwMsg ? <Text style={{ color: colors.up }}>{pwMsg}</Text> : null}
        <Button title="Update password" loading={pwBusy} disabled={!current || next.length < 8} onPress={changePassword} />
      </Card>

      <H2>Active sessions</H2>
      <AsyncBoundary loading={sessions.loading} error={sessions.error} data={sessions.data} onRetry={sessions.reload}>
        {(items) =>
          items.length === 0 ? (
            <Muted>No active sessions.</Muted>
          ) : (
            <>
              {items.map((s) => (
                <Card key={s.id}>
                  <Row label="IP" value={s.ip ?? '—'} />
                  <Row label="Started" value={fmtDate(s.createdAt)} />
                  <Row label="Expires" value={fmtDate(s.expiresAt)} />
                  {s.current ? (
                    <StatusBadge status="CURRENT" />
                  ) : (
                    <View style={{ marginTop: spacing.xs }}>
                      <Button title="Revoke session" variant="secondary" onPress={() => revoke(s.id)} />
                    </View>
                  )}
                </Card>
              ))}
            </>
          )
        }
      </AsyncBoundary>

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Log out" variant="danger" onPress={doLogout} />
      </View>
    </Screen>
  );
}
