import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../src/middleware/request-context';
import { errorHandler } from '../../src/middleware/error-handler';
import { apiRouter } from '../../src/routes/index';
import { adminApiRouter } from '../../src/routes/admin';
import { prisma } from '../../src/lib/prisma';
import { connectRedis, disconnectRedis } from '../../src/lib/redis';
import { signAccessToken } from '../../src/lib/jwt';
import { legalService } from '../../src/modules/legal/legal.service';
import { REQUIRED_SIGNUP_POLICIES } from '../../src/modules/legal/legal.consent';

/**
 * End-to-end KYC flow against REAL Postgres + Redis. Skipped automatically when
 * those services are unreachable. Exercises: user submit → status → document →
 * admin queue → permission protection → approve (tier assignment) → audit.
 */
async function servicesUp(): Promise<boolean> {
  try {
    await connectRedis();
    await prisma.$queryRaw`SELECT 1`;
    return true;
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
  app.use('/api', apiRouter);
  app.use('/admin', adminApiRouter);
  app.use(errorHandler);
  return app;
}

d('kyc module (integration)', () => {
  const app = buildApp();
  const suffix = randomUUID().slice(0, 8).toLowerCase();
  const userEmail = `kyc_user_${suffix}@example.com`;
  const adminEmail = `kyc_admin_${suffix}@example.com`;
  const weakAdminEmail = `kyc_weakadmin_${suffix}@example.com`;
  const password = 'KycPassw0rd!';
  const fullName = `KYC Tester ${suffix}`;

  let userId = '';
  let sessionId = '';
  let userToken = '';
  let adminId = '';
  let weakAdminId = '';
  let roleId = '';
  let weakRoleId = '';
  let adminToken = '';
  let weakAdminToken = '';

  beforeAll(async () => {
    const passwordHash = await hash(password);

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    // This fixture creates the user directly (bypassing /auth/register), so it
    // must also simulate the signup-time consent capture that real registration
    // performs (auth.service.ts) — otherwise the Stage 9A requireLegalConsent
    // guard correctly blocks KYC submission with 403 CONSENT_REQUIRED.
    for (const documentType of REQUIRED_SIGNUP_POLICIES) {
      await legalService.accept(userId, { documentType }, {});
    }

    sessionId = randomUUID();
    await prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshHash: 'integration-refresh-hash',
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    userToken = signAccessToken({ sub: userId, sid: sessionId, kycTier: 0 });

    // Permissions + a reviewer role with full KYC access.
    const kycView = await prisma.permission.upsert({
      where: { code: 'kyc.view' },
      update: {},
      create: { code: 'kyc.view', description: 'View KYC submissions' },
    });
    const kycReview = await prisma.permission.upsert({
      where: { code: 'kyc.review' },
      update: {},
      create: { code: 'kyc.review', description: 'Approve / reject KYC' },
    });
    const role = await prisma.role.create({
      data: { name: `KYC_REVIEWER_${suffix.toUpperCase()}`, scope: 'ADMIN' },
    });
    roleId = role.id;
    await prisma.rolePermission.createMany({
      data: [
        { roleId: role.id, permissionId: kycView.id },
        { roleId: role.id, permissionId: kycReview.id },
      ],
    });
    const admin = await prisma.admin.create({
      data: {
        email: adminEmail,
        passwordHash,
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
      },
    });
    adminId = admin.id;
    await prisma.adminRole.create({ data: { adminId: admin.id, roleId: role.id } });

    // A second admin whose role grants NO KYC permissions (for the 403 test).
    const weakRole = await prisma.role.create({
      data: { name: `KYC_NOPERM_${suffix.toUpperCase()}`, scope: 'ADMIN' },
    });
    weakRoleId = weakRole.id;
    const weakAdmin = await prisma.admin.create({
      data: {
        email: weakAdminEmail,
        passwordHash,
        totpSecretEnc: Buffer.alloc(0),
        totpEnabled: false,
      },
    });
    weakAdminId = weakAdmin.id;
    await prisma.adminRole.create({
      data: { adminId: weakAdmin.id, roleId: weakRole.id },
    });
  });

  afterAll(async () => {
    try {
      await prisma.kycDocument.deleteMany({ where: { userId } });
      await prisma.kycProfile.deleteMany({ where: { userId } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.adminRole.deleteMany({
        where: { adminId: { in: [adminId, weakAdminId].filter(Boolean) } },
      });
      await prisma.adminSession.deleteMany({
        where: { adminId: { in: [adminId, weakAdminId].filter(Boolean) } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: [roleId, weakRoleId].filter(Boolean) } },
      });
      await prisma.role.deleteMany({
        where: { id: { in: [roleId, weakRoleId].filter(Boolean) } },
      });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      // admins + append-only logs are intentionally retained.
    } catch {
      /* best-effort cleanup */
    }
    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });

  async function loginAdmin(email: string): Promise<string> {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email, password, totp: '000000' });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken;
  }

  it('starts with NOT_STARTED status for a fresh user', async () => {
    const res = await request(app)
      .get('/api/kyc')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NOT_STARTED');
    expect(res.body.data.tier).toBe(0);
  });

  it('submits a KYC profile (PII) and moves to PENDING', async () => {
    const res = await request(app)
      .post('/api/kyc')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ fullName, dob: '1990-05-15', pan: 'ABCDE1234F', aadhaarRef: 'tok_aadhaar_ref' });
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.meta.session.redirectUrl).toContain('mock.local');
    expect(res.body.meta.session.providerSessionId).toBeTruthy();

    // The raw PAN must be sealed in the Bytes column, never stored as plaintext.
    const profile = await prisma.kycProfile.findUnique({ where: { userId } });
    expect(profile?.status).toBe('PENDING');
    expect(profile?.panEnc?.toString('utf8')).not.toContain('ABCDE1234F');
    expect(profile?.aadhaarRefEnc).not.toBeNull();
  });

  it('rejects a second submission while one is under review', async () => {
    const res = await request(app)
      .post('/api/kyc')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ fullName, dob: '1990-05-15', pan: 'ABCDE1234F' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('KYC_IN_REVIEW');
  });

  it('registers a document and returns a (non-persisted) upload URL', async () => {
    const res = await request(app)
      .post('/api/kyc/documents')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ docType: 'PAN', sha256: 'a'.repeat(64), contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.documentId).toBeTruthy();
    expect(res.body.data.uploadUrl).toContain('kyc/');

    // Only the storage key is persisted — never the public/upload URL.
    const doc = await prisma.kycDocument.findFirst({ where: { userId } });
    expect(doc?.storageKey).toBeTruthy();
    expect(doc?.storageKey.startsWith('http')).toBe(false);

    const list = await request(app)
      .get('/api/kyc/documents')
      .set('Authorization', `Bearer ${userToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects unauthenticated access to the admin queue', async () => {
    const res = await request(app).get('/admin/kyc');
    expect(res.status).toBe(401);
  });

  it('blocks an admin lacking kyc permissions (permission protection)', async () => {
    weakAdminToken = await loginAdmin(weakAdminEmail);
    const res = await request(app)
      .post(`/admin/kyc/${userId}/decision`)
      .set('Authorization', `Bearer ${weakAdminToken}`)
      .send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('lists the pending profile in the admin review queue', async () => {
    adminToken = await loginAdmin(adminEmail);
    const res = await request(app)
      .get('/admin/kyc?limit=100')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.some((p: { fullName: string }) => p.fullName === fullName)).toBe(true);
  });

  it('approves KYC with a tier and records the audit trail', async () => {
    const res = await request(app)
      .post(`/admin/kyc/${userId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE', tier: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.tier).toBe(2);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.kycStatus).toBe('APPROVED');
    expect(user?.kycTier).toBe(2);

    const profile = await prisma.kycProfile.findUnique({ where: { userId } });
    expect(profile?.reviewedBy).toBe(adminId);
    expect(profile?.reviewedAt).not.toBeNull();

    const auditCount = await prisma.auditLog.count({
      where: { action: 'kyc.approve', entityId: userId },
    });
    expect(auditCount).toBeGreaterThanOrEqual(1);
    const adminLogCount = await prisma.adminLog.count({
      where: { adminId, action: 'kyc.approve', targetId: userId },
    });
    expect(adminLogCount).toBeGreaterThanOrEqual(1);
  });
});
