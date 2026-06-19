import { beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthRouter } from '../../src/modules/health/health.routes';
import { createApp } from '../../src/app';
import { createAdminApp } from '../../src/admin-app';
import * as prismaHealth from '../../src/lib/prisma';
import * as redisHealth from '../../src/lib/redis';

/**
 * Integration test for the health router in isolation. Liveness and version do
 * not touch Postgres/Redis, so this runs anywhere with no services. (Readiness
 * is exercised by the service-backed CI job that provisions Postgres + Redis.)
 */
function app() {
  const a = express();
  a.use('/', healthRouter);
  return a;
}

const forbiddenTerms = [
  'database_url',
  'redis_url',
  'jwt',
  'token',
  'password',
  'authorization',
  'private key',
  'secret',
];

const forbiddenValues = [
  process.env.DATABASE_URL,
  process.env.REDIS_URL,
  process.env.JWT_ACCESS_SECRET,
  process.env.JWT_REFRESH_SECRET,
].filter((value): value is string => Boolean(value));

function expectSafeHealthBody(body: unknown) {
  const serialized = JSON.stringify(body);
  const lower = serialized.toLowerCase();

  for (const term of forbiddenTerms) {
    expect(lower).not.toContain(term);
  }
  for (const value of forbiddenValues) {
    expect(serialized).not.toContain(value);
  }
}

describe('health endpoints', () => {
  beforeEach(() => {
    vi.spyOn(prismaHealth, 'isDatabaseHealthy').mockResolvedValue(true);
    vi.spyOn(redisHealth, 'isRedisHealthy').mockResolvedValue(true);
  });

  it('GET /health returns liveness', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('cex-backend');
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.data.dependencies).toEqual({
      database: 'not_checked',
      redis: 'not_checked',
    });
    expectSafeHealthBody(res.body);
  });

  it('GET /version returns build metadata', async () => {
    const res = await request(app()).get('/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('cex-backend');
    expect(res.body.data.node).toBe(process.version);
    expectSafeHealthBody(res.body);
  });

  it('GET /api/v1/health returns liveness', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.dependencies).toEqual({
      database: 'not_checked',
      redis: 'not_checked',
    });
    expectSafeHealthBody(res.body);
  });

  it('GET /api/v1/ready returns safe readiness', async () => {
    const res = await request(createApp()).get('/api/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.dependencies).toEqual({ database: 'ok', redis: 'ok' });
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(typeof res.body.data.uptime).toBe('number');
    expectSafeHealthBody(res.body);
  });

  it('GET /api/v1/version returns safe build metadata', async () => {
    const res = await request(createApp()).get('/api/v1/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('cex-backend');
    expect(res.body.data.version).toBe('0.1.0');
    expectSafeHealthBody(res.body);
  });

  it('GET /admin/v1/health returns liveness', async () => {
    const res = await request(createAdminApp()).get('/admin/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.dependencies).toEqual({
      database: 'not_checked',
      redis: 'not_checked',
    });
    expectSafeHealthBody(res.body);
  });

  it('GET /admin/v1/ready returns safe readiness', async () => {
    const res = await request(createAdminApp()).get('/admin/v1/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.dependencies).toEqual({ database: 'ok', redis: 'ok' });
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(typeof res.body.data.uptime).toBe('number');
    expectSafeHealthBody(res.body);
  });

  it('GET /admin/v1/version returns safe build metadata', async () => {
    const res = await request(createAdminApp()).get('/admin/v1/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('cex-backend');
    expect(res.body.data.version).toBe('0.1.0');
    expectSafeHealthBody(res.body);
  });
});
