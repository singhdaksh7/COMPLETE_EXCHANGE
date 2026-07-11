import { createServer, type Server } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { createSocketServer } from './realtime/socket-server';
import { onShutdown, setupProcessGuards } from './lib/lifecycle';
import { cryptoDepositService } from './modules/crypto-deposit/crypto-deposit.service';
import { configureStaleThresholds, marketDataService } from './modules/market-data/market-data.service';

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

  // Persist the PUBLIC crypto-deposit network config projection (Stage 12).
  // Best-effort + non-fatal: the env-derived config is the source of truth, this
  // just mirrors the public fields into deposit_network_configs for admin view.
  await cryptoDepositService.seedNetworkConfigs().catch((err) => {
    logger.warn({ err }, 'crypto-deposit: network config seed skipped');
  });

  // Live market-data foundation (BTC/ETH/BNB via Binance, USDT/INR reference
  // via CoinGecko) — MARKET DATA ONLY, no crypto execution capability.
  configureStaleThresholds({
    binanceMs: config.marketData.binance.tickerStaleMs,
    coingeckoMs: config.marketData.coingecko.staleMs,
  });
  await marketDataService.start().catch((err) => {
    logger.error({ err }, 'market-data: failed to start providers');
  });

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
    await marketDataService.stop();
    await disconnectRedis();
    await disconnectDatabase();
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
