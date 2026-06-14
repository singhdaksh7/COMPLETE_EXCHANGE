import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthRouter } from '../../src/modules/health/health.routes';

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

describe('health endpoints', () => {
  it('GET /health returns liveness', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
  });

  it('GET /version returns build metadata', async () => {
    const res = await request(app()).get('/version');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('cex-backend');
    expect(res.body.data.node).toBe(process.version);
  });
});
