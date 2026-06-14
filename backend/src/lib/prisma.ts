import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config';
import { logger } from './logger';

/**
 * Single shared PrismaClient instance (connection pooling lives here).
 *
 * Creating multiple clients exhausts Postgres connections, so the app must
 * use exactly one. In dev we cache it on globalThis so hot-reload (tsx watch)
 * does not spawn a new client on every reload.
 */
const log: Prisma.LogLevel[] = config.isProd
  ? ['warn', 'error']
  : ['warn', 'error'];

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log,
  });

if (!config.isProd) {
  globalForPrisma.prisma = prisma;
}

/** Verify connectivity at boot; throws if the database is unreachable. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  // Cheap round-trip to confirm the connection actually works.
  await prisma.$queryRaw`SELECT 1`;
  logger.info('PostgreSQL connected');
}

/** Lightweight readiness probe used by /ready. */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}
