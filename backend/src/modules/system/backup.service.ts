import { config } from '../../config';

/**
 * Stage 9B — Backup / Restore verification FOUNDATION.
 *
 * IMPORTANT: this module NEVER takes, deletes, or restores a backup, and it does
 * NOT call any AWS API. Automated backups + snapshots are owned by Amazon RDS;
 * restore drills are an operator runbook. This endpoint is a READ-ONLY status /
 * documentation surface: it reflects operator-published metadata (via OPTIONAL
 * env vars) and a fixed checklist so the admin console can show backup posture
 * and flag anything still "unknown".
 *
 * Hard rule (shared across the system module): no secrets, no connection
 * strings. Only coarse status + operator-supplied non-sensitive metadata.
 */

export type BackupItemStatus = 'ok' | 'unknown' | 'action_required';

export interface BackupChecklistItem {
  key: string;
  label: string;
  status: BackupItemStatus;
  detail: string;
}

export interface BackupStatusReport {
  /** Overall posture derived from the checklist. */
  status: 'ok' | 'attention';
  database: {
    provider: string;
    automatedBackups: 'enabled' | 'disabled' | 'unknown';
    retentionDays: number | null;
  };
  latestBackup: {
    snapshotId: string | null;
    takenAt: string | null;
    /** True only when a snapshot id + timestamp were published by the operator. */
    known: boolean;
  };
  restoreDrill: {
    lastTestedAt: string | null;
    documented: boolean;
  };
  backupChecklist: BackupChecklistItem[];
  restoreDrillChecklist: BackupChecklistItem[];
  /** Operator-facing warnings about missing/unknown metadata. */
  warnings: string[];
  notes: string | null;
  environment: string;
  timestamp: string;
}

/** Resolve the operator-published 'true'|'false'|undefined tri-state. */
function automatedState(): 'enabled' | 'disabled' | 'unknown' {
  if (config.backup.automated === undefined) return 'unknown';
  return config.backup.automated === 'true' ? 'enabled' : 'disabled';
}

export const backupService = {
  status(): BackupStatusReport {
    const automated = automatedState();
    const latestKnown = Boolean(
      config.backup.latestSnapshotId && config.backup.latestSnapshotAt,
    );
    const restoreDocumented = Boolean(config.backup.restoreTestAt);

    const warnings: string[] = [];
    if (automated === 'unknown') {
      warnings.push(
        'DB_BACKUP_AUTOMATED is not set — automated backup status is unknown.',
      );
    } else if (automated === 'disabled') {
      warnings.push('Automated backups are reported DISABLED — enable RDS automated backups.');
    }
    if (config.backup.retentionDays === null) {
      warnings.push('DB_BACKUP_RETENTION_DAYS is not set — backup retention is unknown.');
    }
    if (!latestKnown) {
      warnings.push(
        'No latest snapshot metadata published (DB_LATEST_SNAPSHOT_ID / DB_LATEST_SNAPSHOT_AT).',
      );
    }
    if (!restoreDocumented) {
      warnings.push('No restore drill recorded (DB_RESTORE_TEST_AT) — run and document a restore test.');
    }

    const backupChecklist: BackupChecklistItem[] = [
      {
        key: 'rds_automated_backups',
        label: 'RDS automated backups enabled',
        status:
          automated === 'enabled' ? 'ok' : automated === 'disabled' ? 'action_required' : 'unknown',
        detail:
          automated === 'enabled'
            ? `Automated backups enabled${
                config.backup.retentionDays !== null
                  ? ` (retention ${config.backup.retentionDays}d)`
                  : ''
              }.`
            : automated === 'disabled'
              ? 'Automated backups reported disabled.'
              : 'Set DB_BACKUP_AUTOMATED=true once RDS automated backups are confirmed.',
      },
      {
        key: 'manual_snapshot',
        label: 'Manual snapshot created',
        status: latestKnown ? 'ok' : 'unknown',
        detail: latestKnown
          ? `Latest snapshot ${config.backup.latestSnapshotId} at ${config.backup.latestSnapshotAt}.`
          : 'Publish DB_LATEST_SNAPSHOT_ID and DB_LATEST_SNAPSHOT_AT after taking a manual snapshot.',
      },
      {
        key: 'retention_configured',
        label: 'Backup retention configured',
        status: config.backup.retentionDays !== null ? 'ok' : 'unknown',
        detail:
          config.backup.retentionDays !== null
            ? `Retention window ${config.backup.retentionDays} days.`
            : 'Set DB_BACKUP_RETENTION_DAYS to the configured RDS retention period.',
      },
    ];

    const restoreDrillChecklist: BackupChecklistItem[] = [
      {
        key: 'restore_test_documented',
        label: 'Restore test documented',
        status: restoreDocumented ? 'ok' : 'action_required',
        detail: restoreDocumented
          ? `Last restore drill: ${config.backup.restoreTestAt}.`
          : 'Restore a snapshot into a scratch instance, verify integrity, then set DB_RESTORE_TEST_AT.',
      },
      {
        key: 'secrets_recovery_documented',
        label: 'Secrets recovery documented',
        status: 'unknown',
        detail:
          'Confirm JWT/KYC/Razorpay/webhook secrets can be re-provisioned from the secret manager (runbook).',
      },
      {
        key: 'rollback_taskdefs_documented',
        label: 'Rollback task definitions documented',
        status: 'unknown',
        detail:
          'Keep the previous ECS task definition revisions (api/admin) recorded so a deploy can be rolled back.',
      },
    ];

    const anyActionRequired = [...backupChecklist, ...restoreDrillChecklist].some(
      (i) => i.status === 'action_required',
    );

    return {
      status: anyActionRequired || warnings.length > 0 ? 'attention' : 'ok',
      database: {
        provider: config.backup.dbProvider,
        automatedBackups: automated,
        retentionDays: config.backup.retentionDays,
      },
      latestBackup: {
        snapshotId: config.backup.latestSnapshotId,
        takenAt: config.backup.latestSnapshotAt,
        known: latestKnown,
      },
      restoreDrill: {
        lastTestedAt: config.backup.restoreTestAt,
        documented: restoreDocumented,
      },
      backupChecklist,
      restoreDrillChecklist,
      warnings,
      notes: config.backup.notes,
      environment: config.env,
      timestamp: new Date().toISOString(),
    };
  },
};

export type BackupService = typeof backupService;
