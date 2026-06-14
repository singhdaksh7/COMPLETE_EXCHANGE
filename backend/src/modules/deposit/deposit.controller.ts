import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../lib/errors';
import { sendSuccess } from '../../utils/response';
import { depositService } from './deposit.service';
import type { DepositContext } from './deposit.types';
import type { DepositQueryDto } from './deposit.validators';

function ctx(req: Request): DepositContext {
  return {
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: String(req.id),
  };
}

function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

export const depositController = {
  // POST /inr/deposits — create a Razorpay order for an INR deposit.
  async create(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const intent = await depositService.createDeposit(
      user.id,
      { amount: req.body.amount },
      ctx(req),
    );
    sendSuccess(res, intent, 201);
  },

  // POST /inr/deposits/verify — verify the checkout payment signature.
  async verify(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const deposit = await depositService.verifyPayment(
      user.id,
      {
        orderId: req.body.orderId,
        paymentId: req.body.paymentId,
        signature: req.body.signature,
      },
      ctx(req),
    );
    sendSuccess(res, deposit);
  },

  // GET /inr/deposits — list the caller's INR deposits.
  async list(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const { cursor, limit, status } = req.query as unknown as DepositQueryDto;
    const result = await depositService.listUserDeposits({
      userId: user.id,
      cursor,
      limit,
      status,
    });
    sendSuccess(res, result);
  },

  // GET /inr/deposits/:id — single deposit status.
  async get(req: Request, res: Response): Promise<void> {
    const user = requireUser(req);
    const deposit = await depositService.getDeposit(user.id, req.params.id);
    sendSuccess(res, deposit);
  },

  // POST /inr/deposits/webhook — Razorpay server-to-server callback. No auth;
  // authenticity comes from the HMAC signature over the raw body.
  async webhook(req: Request, res: Response): Promise<void> {
    const result = await depositService.handleWebhook(
      {
        rawBody: req.rawBody?.toString('utf8'),
        signature: req.header('x-razorpay-signature') ?? undefined,
        eventId: req.header('x-razorpay-event-id') ?? undefined,
        body: req.body,
      },
      { ip: req.ip, requestId: String(req.id) },
    );
    // Always 200 on a handled (signature-valid) event so the gateway stops
    // retrying; idempotency makes redeliveries safe.
    sendSuccess(res, result);
  },
};
