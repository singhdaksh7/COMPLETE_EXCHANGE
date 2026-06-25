import { config } from '../../config';

/**
 * Stage 9C — Monitoring / Alerts FOUNDATION.
 *
 * Status / documentation surface only. The real alarms live in AWS CloudWatch;
 * this app does NOT call AWS and holds NO AWS credentials. Each alert is marked
 * "configured" purely from an OPTIONAL env flag the deploy pipeline sets once
 * the corresponding CloudWatch alarm exists. The admin console renders
 * configured vs missing so operators can see remaining gaps.
 *
 * Recommended thresholds are STATIC, safe, non-sensitive guidance — never live
 * values pulled from infrastructure.
 */

export interface MonitoringAlertItem {
  key: string;
  label: string;
  configured: boolean;
  /** Safe, human guidance on a sensible threshold. */
  recommendedThreshold: string;
  detail: string;
}

export interface MonitoringStatusReport {
  status: 'ok' | 'attention';
  configuredCount: number;
  totalCount: number;
  dashboardUrl: string | null;
  alerts: MonitoringAlertItem[];
  warnings: string[];
  environment: string;
  timestamp: string;
}

interface AlertDef {
  key: string;
  label: string;
  configured: boolean;
  recommendedThreshold: string;
  detail: string;
}

export const monitoringService = {
  status(): MonitoringStatusReport {
    const a = config.monitoring.alerts;

    const defs: AlertDef[] = [
      {
        key: 'api_5xx',
        label: 'API 5xx error-rate alert',
        configured: a.api5xx,
        recommendedThreshold: '> 1% of requests (or > 5 in 5 min) for 5 min',
        detail: 'Alarm on sustained public-API 5xx responses.',
      },
      {
        key: 'admin_5xx',
        label: 'Admin 5xx error-rate alert',
        configured: a.admin5xx,
        recommendedThreshold: '> 1% of requests (or > 3 in 5 min) for 5 min',
        detail: 'Alarm on sustained admin-API 5xx responses.',
      },
      {
        key: 'ecs_task_crash',
        label: 'ECS task crash / restart alert',
        configured: a.ecsCrash,
        recommendedThreshold: '>= 1 unexpected task stop in 5 min',
        detail: 'Alarm when an ECS service task exits / restarts unexpectedly.',
      },
      {
        key: 'rds_cpu_storage',
        label: 'RDS CPU / storage alert',
        configured: a.rds,
        recommendedThreshold: 'CPU > 80% for 10 min; free storage < 15%',
        detail: 'Alarm on database CPU saturation and low free storage.',
      },
      {
        key: 'redis_connection',
        label: 'Redis connection alert',
        configured: a.redis,
        recommendedThreshold: 'Connection errors > 0 for 5 min; CPU/memory > 80%',
        detail: 'Alarm when the cache/queue store becomes unreachable or saturated.',
      },
      {
        key: 'failed_login_spike',
        label: 'Failed login spike alert',
        configured: a.failedLogin,
        recommendedThreshold: '> 50 failed logins in 5 min (credential stuffing)',
        detail: 'Alarm on a surge of failed authentication attempts.',
      },
      {
        key: 'withdrawal_failure_spike',
        label: 'Withdrawal failure spike alert',
        configured: a.withdrawalFailure,
        recommendedThreshold: '> 5 failed/rejected withdrawals in 15 min',
        detail: 'Alarm on a surge of failed/rejected crypto withdrawals.',
      },
      {
        key: 'kyc_queue_growth',
        label: 'KYC / review queue growth alert',
        configured: a.kycQueue,
        recommendedThreshold: '> 50 pending, or oldest pending > 48h',
        detail: 'Alarm when the KYC / compliance review backlog grows.',
      },
    ];

    const configuredCount = defs.filter((d) => d.configured).length;
    const missing = defs.filter((d) => !d.configured);

    const warnings = missing.map(
      (d) => `${d.label} is not marked configured (set its MONITORING_* flag once the alarm exists).`,
    );

    return {
      status: missing.length === 0 ? 'ok' : 'attention',
      configuredCount,
      totalCount: defs.length,
      dashboardUrl: config.monitoring.dashboardUrl,
      alerts: defs.map((d) => ({
        key: d.key,
        label: d.label,
        configured: d.configured,
        recommendedThreshold: d.recommendedThreshold,
        detail: d.detail,
      })),
      warnings,
      environment: config.env,
      timestamp: new Date().toISOString(),
    };
  },
};

export type MonitoringService = typeof monitoringService;
