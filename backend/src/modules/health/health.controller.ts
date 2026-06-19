import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { getHealthMeta, getReadiness } from './health.service';

/** Liveness: the process is up and the event loop responds. */
export function liveness(_req: Request, res: Response): void {
  sendSuccess(res, {
    status: 'ok',
    ...getHealthMeta(),
    checks: {
      database: 'not_checked',
      redis: 'not_checked',
    },
  });
}

/** Readiness: all critical dependencies are reachable. */
export async function readiness(_req: Request, res: Response): Promise<void> {
  const report = await getReadiness();
  if (report.status === 'ok') {
    sendSuccess(res, report);
  } else {
    sendError(res, 503, 'NOT_READY', 'One or more dependencies are unhealthy', report.checks);
  }
}

/** Build/version metadata. */
export function version(_req: Request, res: Response): void {
  sendSuccess(res, {
    service: 'cex-backend',
    version: getHealthMeta().version,
    node: process.version,
    timestamp: new Date().toISOString(),
  });
}
