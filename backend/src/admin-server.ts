import type { Server } from 'node:http';
import { createAdminApp } from './admin-app';
import { config } from './config';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import {
  onShutdown,
  closeHttpServer,
  setupProcessGuards,
} from './lib/lifecycle';

/**
 * Admin API entrypoint — a SEPARATE process from the public API
 * (ARCHITECTURE.md §4 hard rule, §12). Same dependency wiring and graceful
 * shutdown; different app, different port. In production this binds to an
 * internal interface reachable only via VPN / IP allowlist.
 */
async function bootstrap(): Promise<void> {
  setupProcessGuards();

  await connectDatabase();
  await connectRedis();

  const app = createAdminApp();
  const server: Server = app.listen(config.admin.port, () => {
    logger.info(
      {
        port: config.admin.port,
        env: config.env,
        prefix: config.admin.apiPrefix,
      },
      'CEX admin API listening',
    );
  });

  onShutdown(async () => {
    await closeHttpServer(server);
    await disconnectRedis();
    await disconnectDatabase();
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during admin bootstrap');
  process.exit(1);
});
