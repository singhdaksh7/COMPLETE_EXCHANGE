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
import { apiRouter } from './routes';

/**
 * Assembles the Express application. Middleware order is deliberate:
 *
 *   1. trust proxy            → correct client IP behind Nginx
 *   2. security headers/cors  → reject disallowed origins early
 *   3. compression
 *   4. request context        → request id + child logger
 *   5. http request logging
 *   6. body parsing (limited) → bounded payloads
 *   7. global rate limiting
 *   8. health routes (unauthenticated, no prefix)
 *   9. versioned API routes
 *  10. 404 handler
 *  11. central error handler  → standard error envelope (must be last)
 */
export function createApp(): Express {
  const app = express();

  // We sit behind Nginx; trust the first proxy hop for req.ip / rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(compressionMiddleware);

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      // Reuse the per-request id/logger established by requestContext.
      genReqId: (req) => (req as { id?: string }).id ?? '',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Capture the raw body alongside JSON parsing. Payment-gateway webhooks are
  // authenticated by an HMAC computed over the EXACT bytes sent, so we must keep
  // the untouched buffer — re-serializing the parsed object would change key
  // ordering/whitespace and break signature verification.
  app.use(
    express.json({
      limit: config.http.bodyLimit,
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: config.http.bodyLimit }));

  app.use(globalRateLimiter);

  // Health/version at root (no API prefix) for load balancers & containers.
  app.use('/', healthRouter);

  // Versioned API.
  app.use(config.http.apiPrefix, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
