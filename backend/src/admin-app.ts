import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './lib/logger';

import {
  helmetMiddleware,
  corsMiddleware,
  compressionMiddleware,
} from './middleware/security';
import { requestContext } from './middleware/request-context';
import { globalRateLimiter } from './middleware/rate-limit';
import { notFoundHandler } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';

import { healthRouter } from './modules/health/health.routes';
import { adminApiRouter } from './routes/admin';

/**
 * Assembles the ADMIN Express application — same codebase as the public API
 * but a distinct app with its own router, deployed as a separate process on a
 * separate hostname/network (ARCHITECTURE.md §4 "Hard rule", §12).
 *
 * The middleware chain mirrors the public app so cross-cutting guarantees
 * (request id, structured logs, security headers, error envelope) are
 * identical. Admin authentication + RBAC + IP allowlist are layered in by
 * Module 8 ahead of `adminApiRouter`.
 */
export function createAdminApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(compressionMiddleware);

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? '',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(express.json({ limit: config.http.bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.http.bodyLimit }));

  app.use(globalRateLimiter);

  // Health/version at root for the admin deployment's load balancer.
  app.use('/', healthRouter);

  // Versioned admin API.
  app.use(config.admin.apiPrefix, adminApiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
