import { config } from '../../config';
import { backupService } from './backup.service';

/**
 * Stage 10 — Production go-live readiness.
 *
 * A single READ-ONLY aggregate that reports whether EXORA is configured for a
 * production launch: environment separation, domains/SSL/CDN, email/SMS,
 * backups, monitoring, the security perimeter, and secret presence.
 *
 * Hard rules:
 *   - NEVER returns a secret value. Secret checks report present/missing/
 *     placeholder only (a boolean posture, never the value).
 *   - NEVER calls AWS or any external API. Everything is derived from config
 *     the deploy pipeline publishes (URLs, domains, ids, flags) plus code-level
 *     facts (helmet headers, rate limiters) that are always true in this build.
 *
 * Severity model: a failed production requirement is a BLOCKER when we are
 * actually targeting production (APP_ENV=production); on staging the same gap is
 * a WARNING (it must be fixed before go-live, but is expected for now). This is
 * why staging — which runs NODE_ENV=production with mock providers — shows
 * warnings rather than blockers.
 */

export type GoLiveCheckStatus = 'ok' | 'warning' | 'blocked' | 'unknown';
export type GoLiveStatus = 'ready' | 'warning' | 'blocked';

export interface GoLiveCheck {
  key: string;
  label: string;
  status: GoLiveCheckStatus;
  detail: string;
}

export interface GoLiveSection {
  key: string;
  title: string;
  status: GoLiveStatus;
  checks: GoLiveCheck[];
}

export interface GoLiveChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface GoLiveReadinessReport {
  status: GoLiveStatus;
  environment: string;
  appEnv: string | null;
  isProduction: boolean;
  targetingProduction: boolean;
  sections: GoLiveSection[];
  checklist: GoLiveChecklistItem[];
  warnings: string[];
  timestamp: string;
}

/** True when APP_ENV explicitly targets production (staging stays a warning). */
function targetingProd(): boolean {
  return config.goLive.appEnv === 'production';
}

/** Map a pass/fail requirement to a severity-aware check status. */
function sev(ok: boolean): GoLiveCheckStatus {
  if (ok) return 'ok';
  return targetingProd() ? 'blocked' : 'warning';
}

/** A value is a dev/placeholder secret if it carries an obvious marker. */
function looksLikePlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  return /change.?me|dev[-_]only|placeholder|example|localhost/i.test(value);
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

/** Roll a section's checks up to a section status. */
function rollUp(checks: GoLiveCheck[]): GoLiveStatus {
  if (checks.some((c) => c.status === 'blocked')) return 'blocked';
  if (checks.some((c) => c.status === 'warning' || c.status === 'unknown')) return 'warning';
  return 'ready';
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function environmentSection(): GoLiveSection {
  const g = config.goLive;
  const frontendIsLocal = looksLikePlaceholder(config.urls.frontendUrl);
  const checks: GoLiveCheck[] = [
    {
      key: 'current_environment',
      label: 'Current environment',
      status: 'ok',
      detail: `NODE_ENV=${config.env}${g.appEnv ? `, APP_ENV=${g.appEnv}` : ''}.`,
    },
    {
      key: 'node_env_production',
      label: 'NODE_ENV is production',
      status: sev(config.isProd),
      detail: config.isProd ? 'NODE_ENV=production.' : 'NODE_ENV is not production.',
    },
    {
      key: 'app_env_set',
      label: 'APP_ENV / STAGE indicates target',
      status: g.appEnv ? 'ok' : 'warning',
      detail: g.appEnv
        ? `APP_ENV=${g.appEnv}.`
        : 'APP_ENV is not set — staging and production cannot be distinguished.',
    },
    {
      key: 'frontend_url',
      label: 'Frontend URL configured',
      status: sev(Boolean(config.urls.frontendUrl) && !frontendIsLocal),
      detail: frontendIsLocal
        ? 'FRONTEND_URL still points at a local/placeholder host.'
        : 'FRONTEND_URL is configured.',
    },
    {
      key: 'public_api_url',
      label: 'Public API URL configured',
      status: g.publicApiUrl ? 'ok' : sev(false),
      detail: g.publicApiUrl ? 'PUBLIC_API_URL is configured.' : 'PUBLIC_API_URL is not set.',
    },
    {
      key: 'admin_url',
      label: 'Admin URL configured',
      status: g.adminAppUrl ? 'ok' : sev(false),
      detail: g.adminAppUrl ? 'ADMIN_APP_URL is configured.' : 'ADMIN_APP_URL is not set.',
    },
    {
      key: 'cors_origins',
      label: 'CORS origins configured',
      status: sev(config.http.corsOrigins.length > 0),
      detail:
        config.http.corsOrigins.length > 0
          ? `${config.http.corsOrigins.length} allowed origin(s) configured.`
          : 'No CORS origins configured.',
    },
  ];
  return { key: 'environment', title: 'Environment Separation', status: rollUp(checks), checks };
}

function domainSection(): GoLiveSection {
  const g = config.goLive;
  const checks: GoLiveCheck[] = [
    {
      key: 'public_app_domain',
      label: 'Public app domain',
      status: g.publicAppDomain ? 'ok' : sev(false),
      detail: g.publicAppDomain ?? 'PUBLIC_APP_DOMAIN is not set.',
    },
    {
      key: 'admin_domain',
      label: 'Admin domain',
      status: g.adminDomain ? 'ok' : sev(false),
      detail: g.adminDomain ?? 'ADMIN_DOMAIN is not set.',
    },
    {
      key: 'api_domain',
      label: 'API domain',
      status: g.apiDomain ? 'ok' : sev(false),
      detail: g.apiDomain ?? 'API_DOMAIN is not set.',
    },
    {
      key: 'https_enforced',
      label: 'HTTPS / SSL enforced',
      status: sev(g.httpsRequired),
      detail: g.httpsRequired
        ? 'HTTPS is expected at the edge (HTTPS_REQUIRED=true).'
        : 'HTTPS_REQUIRED is not set — confirm TLS at CloudFront / load balancer.',
    },
    {
      key: 'cloudfront_distribution',
      label: 'CloudFront distribution configured',
      status: g.cloudfrontDistributionId ? 'ok' : 'unknown',
      detail: g.cloudfrontDistributionId
        ? `Distribution ${g.cloudfrontDistributionId}.`
        : 'CLOUDFRONT_DISTRIBUTION_ID not published (optional).',
    },
    {
      key: 's3_frontend_bucket',
      label: 'S3 frontend bucket configured',
      status: g.frontendS3Bucket ? 'ok' : 'unknown',
      detail: g.frontendS3Bucket ?? 'FRONTEND_S3_BUCKET not published (optional).',
    },
  ];
  return { key: 'domain', title: 'Domain, SSL & CDN', status: rollUp(checks), checks };
}

function emailSmsSection(): GoLiveSection {
  const mailProd = config.mail.provider !== 'log';
  const mailFromOk = Boolean(config.mail.from) && !looksLikePlaceholder(config.mail.from);
  const sms = config.goLive.sms;

  const checks: GoLiveCheck[] = [
    {
      key: 'mail_provider_not_log',
      label: 'Mail provider is production-grade',
      status: sev(mailProd),
      detail: mailProd
        ? `MAIL_PROVIDER=${config.mail.provider}.`
        : 'MAIL_PROVIDER=log is staging-only — OTP/transactional email will not be delivered.',
    },
    {
      key: 'mail_from',
      label: 'From email configured',
      status: sev(mailFromOk),
      detail: mailFromOk
        ? 'A non-placeholder from-identity is configured.'
        : 'MAIL_FROM is missing or still a placeholder/.local identity.',
    },
    {
      key: 'otp_email_path',
      label: 'OTP email path production-ready',
      status: sev(mailProd && mailFromOk),
      detail:
        mailProd && mailFromOk
          ? 'Email OTP will dispatch via the configured provider.'
          : 'Email OTP is staging-only until a real mail provider + from identity are set.',
    },
    {
      key: 'sms_provider',
      label: 'SMS provider',
      status:
        sms.provider === 'none'
          ? 'unknown'
          : sms.provider === 'log'
            ? sev(false)
            : 'ok',
      detail:
        sms.provider === 'none'
          ? 'SMS not in use (SMS_PROVIDER=none) — informational.'
          : sms.provider === 'log'
            ? 'SMS_PROVIDER=log is staging-only.'
            : `SMS_PROVIDER=${sms.provider}.`,
    },
  ];
  return { key: 'email_sms', title: 'Email / SMS Readiness', status: rollUp(checks), checks };
}

function backupSection(): GoLiveSection {
  const b = backupService.status();
  const mapStatus = (s: 'ok' | 'unknown' | 'action_required'): GoLiveCheckStatus => {
    if (s === 'ok') return 'ok';
    if (s === 'action_required') return sev(false);
    return targetingProd() ? 'warning' : 'unknown';
  };
  const checks: GoLiveCheck[] = [...b.backupChecklist, ...b.restoreDrillChecklist].map((i) => ({
    key: i.key,
    label: i.label,
    status: mapStatus(i.status),
    detail: i.detail,
  }));
  return { key: 'backup', title: 'Backup & Restore Drill', status: rollUp(checks), checks };
}

function monitoringSection(): GoLiveSection {
  const a = config.monitoring.alerts;
  const required: Array<{ key: string; label: string; configured: boolean }> = [
    { key: 'api_5xx', label: 'API 5xx alarm', configured: a.api5xx },
    { key: 'admin_5xx', label: 'Admin 5xx alarm', configured: a.admin5xx },
    { key: 'ecs_task_crash', label: 'ECS task crash alarm', configured: a.ecsCrash },
    { key: 'rds_cpu', label: 'RDS CPU alarm', configured: a.rdsCpu },
    { key: 'rds_storage', label: 'RDS storage alarm', configured: a.rdsStorage },
    { key: 'redis_failure', label: 'Redis failure alarm', configured: a.redis },
    { key: 'failed_login_spike', label: 'Failed login spike alarm', configured: a.failedLogin },
    { key: 'withdrawal_failure_spike', label: 'Withdrawal failure spike alarm', configured: a.withdrawalFailure },
    { key: 'kyc_queue_growth', label: 'KYC / review queue growth alarm', configured: a.kycQueue },
  ];
  const checks: GoLiveCheck[] = required.map((r) => ({
    key: r.key,
    label: r.label,
    status: sev(r.configured),
    detail: r.configured ? 'Alarm marked configured.' : 'Alarm not marked configured.',
  }));
  return { key: 'monitoring', title: 'Monitoring & Alerts', status: rollUp(checks), checks };
}

function securityPerimeterSection(): GoLiveSection {
  const g = config.goLive;
  const corsWildcard = config.http.corsOrigins.includes('*');
  const checks: GoLiveCheck[] = [
    {
      key: 'waf_enabled',
      label: 'WAF enabled',
      status: sev(g.wafEnabled),
      detail: g.wafEnabled ? 'WAF marked enabled at the edge.' : 'WAF_ENABLED is not set.',
    },
    {
      key: 'rate_limiting',
      label: 'Rate limiting enabled',
      status: 'ok',
      detail: 'Global + auth rate limiters are active (Redis-backed).',
    },
    {
      key: 'admin_sensitive_rate_limiter',
      label: 'Admin sensitive rate limiter enabled',
      status: 'ok',
      detail: 'Sensitive admin mutations are throttled (Stage 9E).',
    },
    {
      key: 'security_headers',
      label: 'Security headers enabled',
      status: 'ok',
      detail: 'helmet hardening headers + Permissions-Policy are applied.',
    },
    {
      key: 'https_required',
      label: 'HTTPS required',
      status: sev(g.httpsRequired),
      detail: g.httpsRequired ? 'HTTPS expected at the edge.' : 'HTTPS_REQUIRED is not set.',
    },
    {
      key: 'secure_cookies',
      label: 'Secure cookies',
      status: g.cookieSecure ? 'ok' : 'unknown',
      detail: g.cookieSecure
        ? 'COOKIE_SECURE=true.'
        : 'Auth uses bearer tokens (no cookies); set COOKIE_SECURE=true if cookies are introduced.',
    },
    {
      key: 'cors_not_wildcard',
      label: 'CORS not wildcard',
      status: corsWildcard ? sev(false) : sev(config.http.corsOrigins.length > 0),
      detail: corsWildcard
        ? 'CORS allowlist contains "*" — not permitted in production.'
        : config.http.corsOrigins.length > 0
          ? 'CORS is a fixed allowlist.'
          : 'No CORS origins configured.',
    },
  ];
  return { key: 'security', title: 'Security Perimeter', status: rollUp(checks), checks };
}

function secretsSection(): GoLiveSection {
  // Required (no-default) secrets: presence is the bar.
  const required: Array<{ key: string; label: string; env: string }> = [
    { key: 'database_url', label: 'DATABASE_URL', env: 'DATABASE_URL' },
    { key: 'redis_url', label: 'REDIS_URL', env: 'REDIS_URL' },
    { key: 'jwt_access_secret', label: 'JWT_ACCESS_SECRET', env: 'JWT_ACCESS_SECRET' },
    { key: 'jwt_refresh_secret', label: 'JWT_REFRESH_SECRET', env: 'JWT_REFRESH_SECRET' },
  ];

  // Defaulted secrets: present-but-placeholder is the real risk for production.
  const defaulted: Array<{ key: string; label: string; value: string | null | undefined }> = [
    { key: 'otp_hash_secret', label: 'OTP_HASH_SECRET', value: config.otp.hashSecret },
    { key: 'kyc_encryption_key', label: 'KYC_ENCRYPTION_KEY', value: config.kyc.encryptionKey },
    { key: 'kyc_webhook_secret', label: 'KYC_WEBHOOK_SECRET', value: config.kyc.webhookSecret },
    { key: 'razorpay_key_secret', label: 'RAZORPAY_KEY_SECRET (3rd-party)', value: config.razorpay.keySecret },
    { key: 'razorpay_webhook_secret', label: 'RAZORPAY_WEBHOOK_SECRET (3rd-party)', value: config.razorpay.webhookSecret },
  ];

  const checks: GoLiveCheck[] = [];
  for (const r of required) {
    const present = envPresent(r.env);
    checks.push({
      key: r.key,
      label: `${r.label} present`,
      status: sev(present),
      detail: present ? 'Configured.' : 'Missing.',
    });
  }
  for (const d of defaulted) {
    const present = Boolean(d.value);
    const placeholder = looksLikePlaceholder(d.value);
    checks.push({
      key: d.key,
      label: `${d.label} present`,
      status: present && !placeholder ? 'ok' : sev(false),
      detail: !present
        ? 'Missing.'
        : placeholder
          ? 'Present but still a dev/placeholder value.'
          : 'Configured.',
    });
  }
  return { key: 'secrets', title: 'Secrets & Config Hardening', status: rollUp(checks), checks };
}

function buildChecklist(): GoLiveChecklistItem[] {
  const c = config.goLive.checklist;
  return [
    { key: 'infra_created', label: 'Production infra created', done: c.infraCreated },
    { key: 'dns_configured', label: 'Domain DNS configured', done: c.dnsConfigured },
    { key: 'ssl_active', label: 'SSL active', done: c.sslActive },
    { key: 'email_live', label: 'Email provider live', done: c.emailLive },
    { key: 'backups_verified', label: 'Backups verified', done: c.backupsVerified },
    { key: 'restore_drill_done', label: 'Restore drill completed', done: c.restoreDrillDone },
    { key: 'monitoring_active', label: 'Monitoring alarms active', done: c.monitoringActive },
    { key: 'waf_ratelimit_active', label: 'WAF / rate limits active', done: c.wafRateLimitActive },
    { key: 'admin_accounts_reviewed', label: 'Admin accounts reviewed', done: c.adminAccountsReviewed },
    { key: 'legal_approved', label: 'Legal / compliance approved', done: c.legalApproved },
    { key: 'load_test_done', label: 'Load test completed', done: c.loadTestDone },
    { key: 'pentest_done', label: 'Pen test / security review completed', done: c.pentestDone },
    { key: 'smoke_test_passed', label: 'Final smoke test passed', done: c.smokeTestPassed },
  ];
}

function overall(sections: GoLiveSection[]): GoLiveStatus {
  if (sections.some((s) => s.status === 'blocked')) return 'blocked';
  if (sections.some((s) => s.status === 'warning')) return 'warning';
  return 'ready';
}

export const goLiveService = {
  readiness(): GoLiveReadinessReport {
    const sections: GoLiveSection[] = [
      environmentSection(),
      domainSection(),
      emailSmsSection(),
      backupSection(),
      monitoringSection(),
      securityPerimeterSection(),
      secretsSection(),
    ];

    // Top-level warnings: every non-ok check surfaced for a quick scan.
    const warnings: string[] = [];
    for (const s of sections) {
      for (const c of s.checks) {
        if (c.status === 'blocked') warnings.push(`[BLOCKER] ${s.title} — ${c.label}: ${c.detail}`);
        else if (c.status === 'warning') warnings.push(`[WARN] ${s.title} — ${c.label}: ${c.detail}`);
      }
    }

    return {
      status: overall(sections),
      environment: config.env,
      appEnv: config.goLive.appEnv,
      isProduction: config.isProd,
      targetingProduction: targetingProd(),
      sections,
      checklist: buildChecklist(),
      warnings,
      timestamp: new Date().toISOString(),
    };
  },
};

export type GoLiveService = typeof goLiveService;
