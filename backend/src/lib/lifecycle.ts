import type { Server } from 'node:http';
import { logger } from './logger';

/**
 * Shared process-lifecycle helpers used by every entrypoint (public API, admin
 * API, worker, scanner) so graceful shutdown and crash guards behave
 * identically across processes.
 */

const DEFAULT_FORCE_EXIT_MS = 15_000;

/**
 * Wire SIGTERM/SIGINT to a single async cleanup handler. The handler should
 * release this process's resources (close servers, disconnect DB/Redis, drain
 * workers). A hard timeout force-exits if cleanup stalls, so a deploy is never
 * blocked indefinitely.
 */
export function onShutdown(
  cleanup: (signal: string) => Promise<void>,
  opts: { forceExitMs?: number } = {},
): void {
  let shuttingDown = false;

  const run = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown initiated');

    const forceTimer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, opts.forceExitMs ?? DEFAULT_FORCE_EXIT_MS);
    forceTimer.unref();

    try {
      await cleanup(signal);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void run('SIGTERM'));
  process.on('SIGINT', () => void run('SIGINT'));
}

/** Promisified server.close so it composes inside an async cleanup handler. */
export function closeHttpServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Last-resort guards. An unhandled rejection is logged (and surfaced to fix);
 * an uncaught exception leaves the process in an unknown state, so we exit and
 * let the orchestrator restart a clean instance.
 */
export function setupProcessGuards(): void {
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}
