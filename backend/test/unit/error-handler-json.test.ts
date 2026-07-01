import { describe, it, expect } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/error-handler';

/**
 * Regression test for the "malformed JSON becomes 500" bug (Stage 8A). The body
 * parser rejects an unparseable body BEFORE any route runs, so this needs no DB
 * or Redis — it mounts express.json() + a stand-in POST /api/v1/auth/login route
 * + the central error handler, exactly the middleware order createApp() uses.
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.post('/api/v1/auth/login', (_req, res) => {
    res.json({ success: true, data: { ok: true } });
  });
  app.use(errorHandler);
  return app;
}

describe('error handler — malformed JSON body', () => {
  it('returns 400 INVALID_JSON (not 500) for a broken JSON body', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", "password":'); // truncated → invalid JSON

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(res.body.error.message).toBe('Invalid JSON body.');
  });

  it('does not leak the raw body or a stack trace in the response', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password": "SUPER_SECRET_VALUE" ');

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('SUPER_SECRET_VALUE');
    expect(raw.toLowerCase()).not.toContain('stack');
    expect(raw).not.toContain('at Object.'); // no stack frames
  });

  it('still accepts a well-formed JSON body (branch does not over-catch)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'a@b.com', password: 'Str0ngPassword' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { ok: true } });
  });
});
