import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';
import { ServiceUnavailableError } from './errors';

/**
 * Shared Redis connection (ioredis).
 *
 * Used across the platform for: caching, rate limiting, distributed locks,
 * session lookups, BullMQ queues, and live price data. It is infrastructure
 * glue — never the source of truth for money.
 *
 * `maxRetriesPerRequest: null` is required for compatibility with BullMQ
 * (added in later modules) and keeps commands queued during brief blips.
 */
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

const AUTH_REDIS_TIMEOUT_MS = 750;

async function withAuthRedisTimeout<T>(
  operation: string,
  command: Promise<T>,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      command,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(
            new ServiceUnavailableError(
              `Authentication token store unavailable during ${operation}`,
            ),
          );
        }, AUTH_REDIS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function authRedisGet(key: string): Promise<string | null> {
  return withAuthRedisTimeout('GET', redis.get(key));
}

export function authRedisGetDel(key: string): Promise<string | null> {
  return withAuthRedisTimeout(
    'GETDEL',
    redis.call('GETDEL', key) as Promise<string | null>,
  );
}

export function authRedisCall<T = unknown>(
  command: string,
  ...args: string[]
): Promise<T> {
  return withAuthRedisTimeout(
    command,
    redis.call(command, ...args) as Promise<T>,
  );
}

export function authRedisSet(
  key: string,
  value: string,
  mode: 'EX' | 'PX',
  ttl: number,
): Promise<'OK' | null> {
  const command =
    mode === 'EX' ? redis.set(key, value, 'EX', ttl) : redis.set(key, value, 'PX', ttl);
  return withAuthRedisTimeout('SET', command);
}

export function authRedisDel(key: string): Promise<number> {
  return withAuthRedisTimeout('DEL', redis.del(key));
}

redis.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('reconnecting', () => {
  logger.warn('Redis reconnecting');
});

/** Establish the connection at boot (lazyConnect defers it until now). */
export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
  await redis.ping();
}

/** Lightweight readiness probe used by /ready. */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.error({ err }, 'Redis health check failed');
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}
