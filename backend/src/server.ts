import { createServer, type Server } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { createSocketServer } from './realtime/socket-server';
import { onShutdown, setupProcessGuards } from './lib/lifecycle';

/**
 * Public API entrypoint.
 *
 *  1. Verify critical dependencies are reachable BEFORE accepting traffic
 *     (fail fast — don't serve a financial API with a dead database).
 *  2. Start the HTTP server.
 *  3. Wire graceful shutdown so in-flight requests drain and connections
 *     close cleanly on SIGTERM/SIGINT (important for zero-downtime deploys).
 */
async function bootstrap(): Promise<void> {
  setupProcessGuards();

  await connectDatabase();
  await connectRedis();

  const app = createApp();
  // Create the HTTP server explicitly so Socket.IO can share the same port as
  // the REST API (the WebSocket upgrade lives at /socket.io; all REST routes are
  // untouched). Polling on the client remains a fallback if the socket drops.
  const server: Server = createServer(app);
  const io = createSocketServer(server);

  server.listen(config.http.port, () => {
    logger.info(
      { port: config.http.port, env: config.env, prefix: config.http.apiPrefix },
      'CEX public API listening (REST + WebSocket)',
    );
  });

  onShutdown(async () => {
    // io.close() stops accepting upgrades, drops live sockets, and closes the
    // underlying HTTP server — so we must NOT also call closeHttpServer here.
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await disconnectRedis();
    await disconnectDatabase();
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
