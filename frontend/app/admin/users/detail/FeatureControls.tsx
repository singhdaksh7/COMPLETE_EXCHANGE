'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin-api';
import { errorMessage } from '@/lib/api';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
import type { UserControlFlag, UserFeatureControls } from '@/lib/types';

interface FlagDef {
  key: UserControlFlag;
  label: string;
  /** Restriction flags read "blocked" when ON; positive flags read "allowed". */
  restriction?: boolean;
}

interface FlagGroup {
  title: string;
  flags: FlagDef[];
}

const GROUPS: FlagGroup[] = [
  {
    title: 'Trading controls',
    flags: [
      { key: 'canTradeSpot', label: 'Can trade spot' },
      { key: 'canPlaceBuyOrders', label: 'Can place buy orders' },
      { key: 'canPlaceSellOrders', label: 'Can place sell orders' },
      { key: 'canCancelOrders', label: 'Can cancel orders' },
    ],
  },
  {
    title: 'INR controls',
    flags: [
      { key: 'canDepositInr', label: 'Can deposit INR' },
      { key: 'canWithdrawInr', label: 'Can withdraw INR' },
    ],
  },
  {
    title: 'Crypto controls',
    flags: [
      { key: 'canDepositCrypto', label: 'Can deposit crypto' },
      { key: 'canWithdrawCrypto', label: 'Can withdraw crypto' },
    ],
  },
  {
    title: 'Compliance controls',
    flags: [
      { key: 'forceKycReview', label: 'Force KYC review', restriction: true },
      { key: 'requireEnhancedKyc', label: 'Require enhanced KYC', restriction: true },
      { key: 'underComplianceReview', label: 'Under compliance review', restriction: true },
    ],
  },
  {
    title: 'Risk controls',
    flags: [
      { key: 'blockHighRiskActivity', label: 'Block high-risk activity', restriction: true },
      { key: 'manualReviewBeforeWithdrawal', label: 'Manual review before withdrawal', restriction: true },
    ],
  },
];

const ALL_FLAGS: UserControlFlag[] = GROUPS.flatMap((g) => g.flags.map((f) => f.key));

function Toggle({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? 'bg-brand' : 'bg-line'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function extractFlags(c: UserFeatureControls): Record<UserControlFlag, boolean> {
  const out = {} as Record<UserControlFlag, boolean>;
  for (const f of ALL_FLAGS) out[f] = c[f];
  return out;
}

export function FeatureControls({
  userId,
  canView,
  canUpdate,
}: {
  userId: string;
  canView: boolean;
  canUpdate: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<UserControlFlag, boolean> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['user-controls', userId],
    queryFn: () => adminApi.userControls(userId),
    enabled: canView && !!userId,
  });
  const audit = useQuery({
    queryKey: ['user-controls-audit', userId],
    queryFn: () => adminApi.userControlsAudit(userId),
    enabled: canView && !!userId,
  });

  const controls = q.data?.data;

  useEffect(() => {
    if (controls) setDraft(extractFlags(controls));
  }, [controls]);

  const changed = useMemo(() => {
    if (!controls || !draft) return [] as UserControlFlag[];
    return ALL_FLAGS.filter((f) => draft[f] !== controls[f]);
  }, [controls, draft]);

  const save = useMutation({
    mutationFn: () => {
      const body: Partial<Record<UserControlFlag, boolean>> & { reason: string } = {
        reason: reason.trim(),
      };
      for (const f of changed) body[f] = draft![f];
      return adminApi.updateUserControls(userId, body);
    },
    onSuccess: () => {
      setError(null);
      setSuccess('Controls updated.');
      setReason('');
      qc.invalidateQueries({ queryKey: ['user-controls', userId] });
      qc.invalidateQueries({ queryKey: ['user-controls-audit', userId] });
    },
    onError: (e) => {
      setSuccess(null);
      setError(errorMessage(e));
    },
  });

  if (!canView) {
    return (
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Feature Controls
        </h2>
        <p className="text-sm text-muted">
          Your admin role cannot view per-user feature controls.
        </p>
      </Card>
    );
  }

  const canSave =
    canUpdate && changed.length > 0 && reason.trim().length >= 3 && !save.isPending;

  function onSave() {
    if (!canSave) return;
    if (
      window.confirm('Are you sure you want to update controls for this user?')
    ) {
      save.mutate();
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Feature Controls
        </h2>
        {controls && !controls.exists && (
          <span className="rounded bg-panel-2 px-2 py-0.5 text-[11px] text-muted">
            defaults (no saved record)
          </span>
        )}
      </div>

      {q.isLoading && <p className="text-sm text-muted">Loading controls…</p>}
      {q.isError && <Alert>{errorMessage(q.error)}</Alert>}
      {success && (
        <div className="mb-3">
          <Alert kind="success">{success}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {controls && draft && (
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-xs font-semibold text-muted">{group.title}</div>
              <div className="space-y-2">
                {group.flags.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0"
                  >
                    <div className="text-sm text-ink">
                      {f.label}
                      {draft[f.key] !== controls[f.key] && (
                        <span className="ml-2 text-[11px] text-brand">changed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted">
                        {draft[f.key] ? 'ON' : 'OFF'}
                      </span>
                      <Toggle
                        on={draft[f.key]}
                        disabled={!canUpdate || save.isPending}
                        onChange={(next) =>
                          setDraft((d) => (d ? { ...d, [f.key]: next } : d))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">
              Reason / note (required)
            </label>
            <textarea
              value={reason}
              disabled={!canUpdate || save.isPending}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are these controls being changed? (min 3 characters)"
              className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={onSave} disabled={!canSave}>
              {save.isPending ? 'Saving…' : 'Save controls'}
            </Button>
            <span className="text-xs text-muted">
              {changed.length === 0
                ? 'No changes'
                : `${changed.length} change${changed.length === 1 ? '' : 's'} pending`}
            </span>
          </div>
          {!canUpdate && (
            <p className="text-xs text-muted">
              Your admin role can view controls but cannot change them
              (requires users.controls.update).
            </p>
          )}
        </div>
      )}

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold text-muted">
          Control change history
        </div>
        {audit.isLoading && <p className="text-sm text-muted">Loading history…</p>}
        {audit.data && audit.data.data.items.length === 0 && (
          <EmptyState title="No control changes yet" />
        )}
        {audit.data && audit.data.data.items.length > 0 && (
          <div className="space-y-2">
            {audit.data.data.items.map((l) => (
              <div key={l.id} className="border-b border-line pb-2 text-xs last:border-0">
                <div className="font-mono text-ink">{l.action}</div>
                {l.reason && <div className="text-muted">Reason: {l.reason}</div>}
                <div className="text-muted-2">
                  {new Date(l.occurredAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
