import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/response';
import { resendWebhookService } from './resend-webhook.service';

/**
 * Provider webhooks, mounted at /webhooks. Unauthenticated (providers cannot
 * present a user JWT) and instead authenticated by signature inside the
 * service — mirrors the existing /inr/deposits/webhook (Razorpay) pattern.
 */
export const webhooksRouter = Router();

webhooksRouter.post(
  '/resend',
  asyncHandler(async (req: Request, res: Response) => {
    // `rawBody` is captured globally by the express.json `verify` hook in
    // app.ts for every request — the exact bytes Resend signed, never the
    // re-serialized parsed object.
    const rawBody = (req as { rawBody?: Buffer }).rawBody;
    await resendWebhookService.handle(rawBody ? rawBody.toString('utf8') : '', {
      'svix-id': req.header('svix-id'),
      'svix-timestamp': req.header('svix-timestamp'),
      'svix-signature': req.header('svix-signature'),
    });
    sendSuccess(res, { received: true });
  }),
);
