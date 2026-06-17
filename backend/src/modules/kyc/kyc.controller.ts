import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../lib/errors';
import { kycService } from './kyc.service';
import type { KycContext } from './kyc.types';

/** Pull request-scoped forensic context for audit logging. */
function ctx(req: Request): KycContext {
  return {
    actorId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

/**
 * User-facing KYC controller: HTTP in, HTTP out. It extracts request data,
 * calls the service, and shapes the response envelope. No business logic here.
 */
export const kycController = {
  async getStatus(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const profile = await kycService.getStatus(req.user.id);
    sendSuccess(res, profile);
  },

  async submitProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await kycService.submitProfile(req.user.id, req.body, ctx(req));
    // 202: accepted for review. The profile is the envelope data; the provider
    // verification session rides in `meta` so the success envelope stays canonical.
    sendSuccess(res, result.profile, 202, { session: result.session });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const profile = await kycService.refreshStatus(req.user.id, ctx(req));
    sendSuccess(res, profile);
  },

  // POST /kyc/webhook — provider server-to-server callback. No user auth;
  // authenticity comes from the HMAC signature over the raw body. Always 200 on
  // a handled (signature-valid) event so the provider stops retrying;
  // idempotency makes redeliveries safe.
  async webhook(req: Request, res: Response): Promise<void> {
    const result = await kycService.handleWebhook(
      {
        rawBody: req.rawBody?.toString('utf8'),
        signature: req.header('x-kyc-signature') ?? undefined,
        eventId: req.header('x-kyc-event-id') ?? undefined,
        body: req.body,
      },
      { ip: req.ip, requestId: String(req.id) },
    );
    sendSuccess(res, result);
  },

  async listDocuments(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const items = await kycService.listDocuments(req.user.id);
    sendSuccess(res, { items });
  },

  async submitDocument(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    const result = await kycService.submitDocument(req.user.id, req.body, ctx(req));
    sendSuccess(res, result, 201);
  },
};
