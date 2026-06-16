import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis, isRedisHealthy } from '../../src/lib/redis';
import { signAccessToken, signAdminAccessToken } from '../../src/lib/jwt';

/**
 * Compliance Foundation (Module 3).
 *
 * Drives the rule engine against real platform events (INR deposits/withdrawals,
 * conversions, shared-IP login attempts, KYC state), then exercises the admin
 * triage surface: evaluate, summary, risk-profile/alert listings, assign, status
 * transitions, manual flag, RBAC (view vs review), and verifies NO PII leaks
 * into alert evidence.
 */

async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    const redisOk = await isRedisHealthy();
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return redisOk && dbOk;
  } catch {
    return false;
  }
}

const up = await servicesUp();
const d = up ? describe : describe.skip;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use('/api/v1', apiRouter);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);

d('Compliance foundation (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8);
  const o1 = parseInt(suffix.slice(0, 2), 16);
  const o2 = parseInt(suffix.slice(2, 4), 16);
  const SHARED_IP = `198.51.${o1}.${o2}`; // TEST-NET-2, unique per run

  let userId = '';
  let peerId = '';
  let userToken = '';
  let reviewerId = '';
  let viewerId = '';
  let reviewerToken = '';
  let viewerToken = '';
  const roleIds: string[] = [];

  async function mkAdmin(perms: string[]): Promise<{ id: string; token: string }> {
    const role = await prisma.role.create({ data: { name: `CMPL_${randomUUID().slice(0, 8)}`, scope: 'ADMIN', description: 'compliance test' } });
    roleIds.push(role.id);
    for (const code of perms) {
      const perm = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: code } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    const admin = await prisma.admin.create({ data: { email: `cmpl_${randomUUID().slice(0, 8)}@example.com`, passwordHash: await hash('AdminPassw0rd!'), totpSecretEnc: Buffer.alloc(0), totpEnabled: false, status: 'ACTIVE' } });
    await prisma.adminRole.create({ data: { adminId: admin.id, roleId: role.id } });
    const asid = randomUUID();
    await prisma.adminSession.create({ data: { id: asid, adminId: admin.id, refreshHash: `ar_${randomUUID()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    return { id: admin.id, token: signAdminAccessToken({ sub: admin.id, sid: asid }) };
  }

  function adminGet(token: string, path: string) {
    return request(app).get(`/admin/compliance${path}`).set('Authorization', `Bearer ${token}`);
  }
  function adminPost(token: string, path: string, body: Record<string, unknown> = {}) {
    return request(app).post(`/admin/compliance${path}`).set('Authorization', `Bearer ${token}`).send(body);
  }

  beforeAll(async () => {
    const now = Date.now();

    const u = await prisma.user.create({ data: { email: `cmplU_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), emailVerifiedAt: new Date(), status: 'ACTIVE', kycStatus: 'APPROVED', kycTier: 1 } });
    userId = u.id;
    const peer = await prisma.user.create({ data: { email: `cmplP_${suffix}@example.com`, passwordHash: await hash('Str0ngPassword'), status: 'ACTIVE' } });
    peerId = peer.id;
    const usid = randomUUID();
    await prisma.authSession.create({ data: { id: usid, userId: u.id, refreshHash: `r_${randomUUID()}`, familyId: randomUUID(), expiresAt: new Date(now + 86_400_000) } });
    userToken = signAccessToken({ sub: u.id, sid: usid, kycTier: 1 });

    // KYC: previously rejected, now approved → KYC_REJECTED_RETRY.
    await prisma.kycProfile.upsert({
      where: { userId },
      update: { status: 'APPROVED', rejectedReason: 'doc mismatch (earlier)' },
      create: { userId, status: 'APPROVED', rejectedReason: 'doc mismatch (earlier)' },
    });

    // Large INR deposit (≥ ₹200k) → LARGE_INR_DEPOSIT + feeds HIGH_DAILY_VOLUME.
    await prisma.inrTransaction.create({ data: { userId, type: 'DEPOSIT', amount: D('250000'), status: 'SUCCESS', createdAt: new Date(now - 10 * 60 * 1000) } });
    // A successful withdrawal 10m later → RAPID_WITHDRAWAL.
    await prisma.inrTransaction.create({ data: { userId, type: 'WITHDRAWAL', amount: D('5000'), status: 'SUCCESS', createdAt: new Date(now - 1 * 60 * 1000) } });
    // Three FAILED withdrawals → MULTIPLE_FAILED_WITHDRAWALS.
    for (let i = 0; i < 3; i += 1) {
      await prisma.inrTransaction.create({ data: { userId, type: 'WITHDRAWAL', amount: D('100'), status: 'FAILED', createdAt: new Date(now - (i + 1) * 60 * 1000) } });
    }
    // A large conversion → pushes HIGH_DAILY_VOLUME over ₹1,000,000.
    await prisma.conversion.create({ data: { userId, side: 'INR_TO_USDT', inrAmount: D('1000000'), usdtAmount: D('11500'), rate: D('87.00'), createdAt: new Date(now - 5 * 60 * 1000) } });

    // Shared IP: this user + a peer logging in from the same IP → SHARED_IP_DEVICE.
    for (const uid of [userId, peerId]) {
      await prisma.loginAttempt.create({ data: { userId: uid, email: `x_${uid}@e.com`, ip: SHARED_IP, success: true } });
    }

    const reviewer = await mkAdmin(['compliance.view', 'compliance.review']);
    const viewer = await mkAdmin(['compliance.view']);
    reviewerId = reviewer.id; reviewerToken = reviewer.token;
    viewerId = viewer.id; viewerToken = viewer.token;
  });

  afterAll(async () => {
    try {
      await prisma.complianceAlert.deleteMany({ where: { userId: { in: [userId, peerId] } } });
      await prisma.userRiskProfile.deleteMany({ where: { userId: { in: [userId, peerId] } } });
      await prisma.loginAttempt.deleteMany({ where: { ip: SHARED_IP } });
      await prisma.conversion.deleteMany({ where: { userId } });
      await prisma.inrTransaction.deleteMany({ where: { userId } });
      await prisma.kycProfile.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId: { in: [userId, peerId] } } });
      for (const aid of [reviewerId, viewerId]) {
        await prisma.adminRole.deleteMany({ where: { adminId: aid } });
        await prisma.adminSession.deleteMany({ where: { adminId: aid } });
      }
      for (const rid of roleIds) {
        await prisma.rolePermission.deleteMany({ where: { roleId: rid } });
        await prisma.role.deleteMany({ where: { id: rid } });
      }
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  it('rejects a non-admin user token', async () => {
    const res = await adminGet(userToken, '/summary');
    expect(res.status).toBe(401);
  });

  it('forbids a compliance.view-only admin from evaluating', async () => {
    const res = await adminPost(viewerToken, `/users/${userId}/evaluate`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('evaluates a user and raises the expected alerts + risk level', async () => {
    const res = await adminPost(reviewerToken, `/users/${userId}/evaluate`);
    expect(res.status).toBe(200);
    expect(res.body.data.alertsCreated).toBeGreaterThanOrEqual(5);
    expect(['HIGH', 'CRITICAL']).toContain(res.body.data.riskProfile.riskLevel);
    expect(res.body.data.riskProfile.riskScore).toBeGreaterThanOrEqual(50);

    const types = (res.body.data.riskProfile.reasons as Array<{ code: string }>).map((r) => r.code);
    for (const t of ['LARGE_INR_DEPOSIT', 'RAPID_WITHDRAWAL', 'HIGH_DAILY_VOLUME', 'MULTIPLE_FAILED_WITHDRAWALS', 'SHARED_IP_DEVICE', 'KYC_REJECTED_RETRY']) {
      expect(types).toContain(t);
    }
  });

  it('is idempotent — re-evaluating creates no duplicate alerts', async () => {
    const before = await prisma.complianceAlert.count({ where: { userId } });
    const res = await adminPost(reviewerToken, `/users/${userId}/evaluate`);
    expect(res.status).toBe(200);
    expect(res.body.data.alertsCreated).toBe(0);
    const after = await prisma.complianceAlert.count({ where: { userId } });
    expect(after).toBe(before);
  });

  it('lists alerts with metadata-only evidence (no PII)', async () => {
    const res = await adminGet(reviewerToken, `/alerts?userId=${userId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(5);
    const raw = JSON.stringify(res.body.data.items);
    // Evidence must never carry encrypted/raw KYC or other PII fields.
    expect(raw).not.toMatch(/panEnc|aadhaar|pan_enc|passwordHash|rejectedReason|mnemonic|privateKey/i);
  });

  it('returns a single alert and supports assign + status transitions', async () => {
    const list = await adminGet(reviewerToken, `/alerts?userId=${userId}&alertType=SHARED_IP_DEVICE`);
    const alertId = list.body.data.items[0].id;

    const detail = await adminGet(reviewerToken, `/alerts/${alertId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(alertId);

    const assign = await adminPost(reviewerToken, `/alerts/${alertId}/assign`, {});
    expect(assign.status).toBe(200);
    expect(assign.body.data.assignedTo).toBe(reviewerId);
    expect(assign.body.data.status).toBe('REVIEWING');

    const escalate = await adminPost(reviewerToken, `/alerts/${alertId}/status`, { status: 'ESCALATED' });
    expect(escalate.status).toBe(200);
    expect(escalate.body.data.status).toBe('ESCALATED');

    const close = await adminPost(reviewerToken, `/alerts/${alertId}/status`, { status: 'CLOSED', resolution: 'reviewed — benign shared NAT' });
    expect(close.status).toBe(200);
    expect(close.body.data.status).toBe('CLOSED');
    expect(close.body.data.reviewedBy).toBe(reviewerId);
    expect(close.body.data.resolution).toContain('benign');
  });

  it('lists risk profiles filtered by level', async () => {
    const res = await adminGet(reviewerToken, '/risk-profiles?riskLevel=CRITICAL&limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((p: { riskLevel: string }) => p.riskLevel === 'CRITICAL')).toBe(true);
  });

  it('creates a manual flag and marks the profile as overridden', async () => {
    const res = await adminPost(reviewerToken, `/users/${userId}/manual-flag`, { severity: 'CRITICAL', description: 'STR candidate — manual review' });
    expect(res.status).toBe(201);
    expect(res.body.data.alert.alertType).toBe('MANUAL_FLAG');
    expect(res.body.data.alert.severity).toBe('CRITICAL');
    expect(res.body.data.riskProfile.manualOverride).toBe(true);

    const manual = await prisma.complianceAlert.count({ where: { userId, alertType: 'MANUAL_FLAG' } });
    expect(manual).toBeGreaterThanOrEqual(1);
  });

  it('exposes a compliance summary', async () => {
    const res = await adminGet(viewerToken, '/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.alerts.total).toBeGreaterThanOrEqual(5);
    expect(typeof res.body.data.alertsBySeverity.HIGH).toBe('number');
    expect(typeof res.body.data.riskProfiles.CRITICAL).toBe('number');
  });

  it('writes an admin_log audit row for the evaluation', async () => {
    const logged = await prisma.adminLog.findFirst({ where: { adminId: reviewerId, action: 'compliance.user_evaluated', targetId: userId } });
    expect(logged).toBeTruthy();
  });
});
