import dotenv from 'dotenv';

dotenv.config();

/**
 * Test environment bootstrap. Runs before any test module is imported, so the
 * strict config validation in src/config/env.ts sees a complete, valid env and
 * does not exit the process. Values are deterministic and never touch real
 * infrastructure unless an integration test explicitly connects.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.LOG_PRETTY = 'false';
process.env.DATABASE_URL ??=
  'postgresql://cex:cex_password@localhost:5432/cex?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??=
  'test_access_secret_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET ??=
  'test_refresh_secret_at_least_32_characters_long';
// Integration tests exercise many auth calls in one flow; keep the limiter from
// throttling them. Forced (not `??=`) so a developer's local .env with tighter
// production-like limits can never throttle and flake the suite.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_MAX = '1000';
