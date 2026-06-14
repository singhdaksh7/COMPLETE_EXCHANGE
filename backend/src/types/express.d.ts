import type { Logger } from 'pino';

/**
 * Augment Express' Request with the fields our middleware attaches:
 *  - `id`:     correlation id for this request (set by request-context).
 *  - `log`:    a child logger bound to the request id.
 *  - `user`:   the authenticated user principal.
 *  - `admin`:  the authenticated admin principal.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      // Raw request body bytes, captured by express.json's `verify` hook. Used
      // by payment-gateway webhooks to verify the HMAC over the exact payload.
      rawBody?: Buffer;
      user?: {
        id: string;
        sessionId: string;
        kycTier: number;
        // Populated by the `authorize` (RBAC) middleware when used.
        roles?: string[];
        permissions?: string[];
      };
      admin?: {
        id: string;
        sessionId: string;
        roles?: string[];
        permissions?: string[];
      };
    }
  }
}

export {};
