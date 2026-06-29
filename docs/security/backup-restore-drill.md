# Backup & Restore Drill Checklist

**Status: CHECKLIST / READINESS — restore drills not yet executed.**
**Mode: INR_ONLY staging/demo. Backup automation and a tested restore are
production blockers (see `docs/compliance/production-blockers.md`).**

This checklist defines how to verify EXORA's primary datastore (PostgreSQL on
Amazon RDS) is backed up and how to perform and evidence a restore drill. The
database is the source of truth for the ledger, KYC/PII, audit trails, and INR
transactions, so a verified restore is mandatory before production.

---

## 1. Current state (verified in code)

- `DB_BACKUP_RETENTION_DAYS` exists as a configuration value
  (`backend/src/config/env.ts`) but is **advisory** — there is **no IaC** in the
  repository that provisions RDS automated backups, snapshots, or PITR.
- Therefore backup configuration must be **verified directly in AWS** and a
  restore must be **drilled manually** until codified.

## 2. RDS backup verification

**Console:** RDS → Databases → (instance) → **Maintenance & backups**. Confirm:

- [ ] **Automated backups: Enabled**, retention **≥ 7 days** (recommend ≥ 30 for
      production).
- [ ] **Point-in-time recovery (PITR)** window is shown and current.
- [ ] **Encryption at rest: Enabled** (KMS) — required for PII/KYC data.
- [ ] At least one recent automated snapshot exists.

**CLI:**

```bash
aws rds describe-db-instances \
  --db-instance-identifier exora-db \
  --query 'DBInstances[0].{backupRetention:BackupRetentionPeriod,encrypted:StorageEncrypted,kms:KmsKeyId,latestRestorable:LatestRestorableTime}' \
  --region ap-south-1

aws rds describe-db-snapshots \
  --db-instance-identifier exora-db \
  --query 'DBSnapshots[-5:].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table --region ap-south-1
```

## 3. Restore drill steps (non-destructive — restore to a NEW instance)

> Never restore over the live instance. Always restore to a new identifier and
> validate, then tear down.

1. **Trigger restore** (PITR to a new instance):
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier exora-db \
     --target-db-instance-identifier exora-db-restore-drill \
     --use-latest-restorable-time \
     --region ap-south-1
   ```
2. Wait for status `available` (`aws rds describe-db-instances ...`).
3. **Connect** to the restored instance with read-only checks (do NOT point the
   app at it).
4. **Validate integrity** (counts + spot checks; no writes):
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM inr_transactions;
   SELECT count(*) FROM ledger_entries;
   SELECT count(*) FROM audit_logs;
   -- Ledger sanity: per-asset debits == credits on a sample transaction
   ```
5. Optionally run `npx prisma migrate status` against the restored DB URL to
   confirm schema parity.
6. **Record evidence** (see §4).
7. **Tear down** the drill instance:
   ```bash
   aws rds delete-db-instance \
     --db-instance-identifier exora-db-restore-drill \
     --skip-final-snapshot --region ap-south-1
   ```

## 4. Expected evidence to capture

- [ ] Screenshot/CLI output: automated backups enabled + retention + encryption.
- [ ] Screenshot/CLI output: snapshot list with timestamps.
- [ ] Restore command output + restored instance `available` status.
- [ ] Validation query results (row counts, ledger balance check).
- [ ] `prisma migrate status` output against the restored DB.
- [ ] Time taken (RTO) and the recovery point achieved (RPO).
- [ ] Operator name + date; teardown confirmation.

Store evidence with the VAPT evidence pack (`docs/security/vapt-evidence-pack.md`).

## 5. Owner & frequency

| Item | Value |
|---|---|
| Owner | Cloud/Infra owner (see incident-response contact checklist) |
| Frequency | Quarterly, and before any production go-live |
| Approval | Compliance/Security Officer signs off the drill record |

## 6. Rollback notes

- The drill is **read-only against a copy**; the live database is never touched,
  so there is nothing to roll back from the drill itself.
- For a real recovery: restore to a new instance, validate, then cut traffic
  over by repointing `DATABASE_URL` — keep the impaired instance for forensics
  (do not delete) per the incident-response evidence-preservation step.

## 7. Limitations (do not over-claim)

- Backups and PITR are **not codified in IaC**; configuration can drift until
  Terraform/CDK manages it.
- Redis (sessions, rate-limit, OTP/verification token hashes) is **ephemeral by
  design** and is not part of this backup scope — loss forces re-login, not data
  loss of record-of-truth.
- Object storage for KYC documents is currently a **stub** in staging (no real
  bucket), so document-store backup is out of scope until real storage is wired.
- No restore drill has been executed yet in this environment; this is a
  **checklist to be performed**, not evidence of a completed drill.
