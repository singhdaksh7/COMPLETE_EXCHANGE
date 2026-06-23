import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { UserFeatureControls } from '@prisma/client';

/**
 * User Control Center — per-user feature controls.
 *
 * Two guarantees are locked in here:
 *   1. The service-level gate (assertEnabled) and the admin read/update flow
 *      behave correctly (defaults when no row, deny when a positive flag is OFF
 *      or a restriction flag is ON, reason-stamped audit on update).
 *   2. The ENFORCEMENT is in the backend, not the UI: the requireUserFeature /
 *      requireOrderPlacementAllowed middleware returns 403 FEATURE_DISABLED_FOR_USER
 *      so a disabled toggle cannot be bypassed by calling the API directly.
 *
 * The repository and the audit sink are mocked — no DB, Redis, ledger, money
 * movement, scanner, or withdrawal signing is touched.
 */

vi.mock('../../src/modules/feature-controls/feature-controls.repository', () => ({
  CONTROLS_TARGET_TYPE: 'user_feature_controls',
  featureControlsRepository: {
    findByUserId: vi.fn(),
    findUserState: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    controlChangeLogs: vi.fn().mockResolvedValue([]),
    writeAdminLog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/lib/audit', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

import { featureControlsRepository } from '../../src/modules/feature-controls/feature-controls.repository';
import { featureControlsService } from '../../src/modules/feature-controls/feature-controls.service';
import {
  requireOrderPlacementAllowed,
  requireUserFeature,
} from '../../src/middleware/require-user-feature';
import { errorHandler } from '../../src/middleware/error-handler';

const repo = vi.mocked(featureControlsRepository);

function makeControls(over: Partial<UserFeatureControls> = {}): UserFeatureControls {
  return {
    id: 'fc-1',
    userId: 'user-1',
    canTradeSpot: true,
    canPlaceBuyOrders: true,
    canPlaceSellOrders: true,
    canCancelOrders: true,
    canDepositInr: true,
    canWithdrawInr: true,
    canDepositCrypto: true,
    canWithdrawCrypto: true,
    forceKycReview: false,
    requireEnhancedKyc: false,
    underComplianceReview: false,
    blockHighRiskActivity: false,
    manualReviewBeforeWithdrawal: false,
    notes: null,
    updatedByAdminId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('featureControlsService.assertEnabled', () => {
  it('allows everything when the user has no control row (defaults)', async () => {
    repo.findByUserId.mockResolvedValue(null);
    await expect(
      featureControlsService.assertEnabled('user-1', [
        'canTradeSpot',
        'canWithdrawCrypto',
        'blockHighRiskActivity',
      ]),
    ).resolves.toBeUndefined();
  });

  it('denies when a positive flag is OFF', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canWithdrawCrypto: false }));
    await expect(
      featureControlsService.assertEnabled('user-1', ['canWithdrawCrypto']),
    ).rejects.toMatchObject({ errorCode: 'FEATURE_DISABLED_FOR_USER', statusCode: 403 });
  });

  it('denies when a restriction flag is ON', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ blockHighRiskActivity: true }));
    await expect(
      featureControlsService.assertEnabled('user-1', ['blockHighRiskActivity']),
    ).rejects.toMatchObject({ errorCode: 'FEATURE_DISABLED_FOR_USER' });
  });

  it('allows a positive flag that is still ON even if another is OFF', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canPlaceSellOrders: false }));
    await expect(
      featureControlsService.assertEnabled('user-1', [
        'canTradeSpot',
        'canPlaceBuyOrders',
      ]),
    ).resolves.toBeUndefined();
  });
});

describe('featureControlsService.getForAdmin', () => {
  it('materializes a default row from user risk state when none exists', async () => {
    repo.findByUserId.mockResolvedValue(null);
    repo.findUserState.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      riskLevel: 'HIGH',
      withdrawalsBlocked: false,
    } as never);
    repo.create.mockImplementation((userId, data) =>
      Promise.resolve(makeControls({ userId, ...(data as object) })),
    );

    const dto = await featureControlsService.getForAdmin('user-1');
    expect(repo.create).toHaveBeenCalledOnce();
    // HIGH risk seeds the two risk restrictions ON.
    expect(dto.blockHighRiskActivity).toBe(true);
    expect(dto.manualReviewBeforeWithdrawal).toBe(true);
    expect(dto.exists).toBe(true);
  });

  it('returns the existing row without creating one', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canDepositInr: false }));
    const dto = await featureControlsService.getForAdmin('user-1');
    expect(repo.create).not.toHaveBeenCalled();
    expect(dto.canDepositInr).toBe(false);
  });
});

describe('featureControlsService.updateForAdmin', () => {
  it('writes an audit log with the reason and only the changed flags', async () => {
    repo.findUserState.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      riskLevel: 'LOW',
      withdrawalsBlocked: false,
    } as never);
    repo.findByUserId.mockResolvedValue(makeControls());
    repo.update.mockResolvedValue(makeControls({ canWithdrawCrypto: false }));

    await featureControlsService.updateForAdmin(
      'user-1',
      { canWithdrawCrypto: false, reason: 'fraud review' },
      { actorId: 'admin-1', ip: '127.0.0.1', requestId: 'req-1' },
    );

    expect(repo.update).toHaveBeenCalledOnce();
    expect(repo.writeAdminLog).toHaveBeenCalledOnce();
    const logArg = repo.writeAdminLog.mock.calls[0][0];
    expect(logArg.reason).toBe('fraud review');
    expect(logArg.targetType).toBe('user_feature_controls');
    expect(logArg.targetId).toBe('user-1');
    expect(logArg.afterState).toMatchObject({
      changes: [{ field: 'canWithdrawCrypto', value: false }],
    });
  });
});

describe('requireUserFeature middleware (backend enforcement, not UI)', () => {
  function appWith(mw: express.RequestHandler, method: 'get' | 'post' = 'post') {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { user: { id: string } }).user = { id: 'user-1' };
      next();
    });
    app[method]('/probe', mw, (_req, res) => res.json({ success: true, data: { ok: true } }));
    app.use(errorHandler);
    return app;
  }

  it('returns 403 FEATURE_DISABLED_FOR_USER when the flag is OFF', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canWithdrawCrypto: false }));
    const res = await request(appWith(requireUserFeature('canWithdrawCrypto'))).post('/probe');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED_FOR_USER');
  });

  it('passes through when controls allow the action', async () => {
    repo.findByUserId.mockResolvedValue(makeControls());
    const res = await request(appWith(requireUserFeature('canDepositInr'))).post('/probe');
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('order placement gate denies a BUY when canPlaceBuyOrders is OFF', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canPlaceBuyOrders: false }));
    const res = await request(appWith(requireOrderPlacementAllowed()))
      .post('/probe')
      .send({ side: 'BUY' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED_FOR_USER');
  });

  it('order placement gate allows a SELL when only buy is OFF', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canPlaceBuyOrders: false }));
    const res = await request(appWith(requireOrderPlacementAllowed()))
      .post('/probe')
      .send({ side: 'SELL' });
    expect(res.status).toBe(200);
  });

  it('order placement gate denies any side when canTradeSpot is OFF', async () => {
    repo.findByUserId.mockResolvedValue(makeControls({ canTradeSpot: false }));
    const res = await request(appWith(requireOrderPlacementAllowed()))
      .post('/probe')
      .send({ side: 'SELL' });
    expect(res.status).toBe(403);
  });
});
