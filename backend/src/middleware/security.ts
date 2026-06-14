import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import type { RequestHandler } from 'express';
import { config } from '../config';
import { ForbiddenError } from '../lib/errors';

/**
 * Security middleware bundle applied early in the chain.
 *
 *  - helmet:      sets hardening HTTP headers (HSTS, no-sniff, frameguard...).
 *  - cors:        strict allowlist from config; credentials enabled.
 *  - compression: gzip responses.
 *
 * TLS termination, the WAF, and front-line DDoS mitigation live at Nginx/CDN
 * (see ARCHITECTURE.md §10); these are the app-level complements.
 */

export const helmetMiddleware: RequestHandler = helmet({
  // API serves JSON only; CSP is enforced on the web frontends, not here.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
});

export const corsMiddleware: RequestHandler = cors({
  origin(origin, callback) {
    // Allow non-browser clients (mobile app, server-to-server) that send no
    // Origin header. Browser origins must be on the allowlist.
    if (!origin) return callback(null, true);
    if (config.http.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new ForbiddenError('Origin not allowed', 'CORS_FORBIDDEN'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-request-id'],
  maxAge: 86_400,
});

export const compressionMiddleware: RequestHandler = compression();
