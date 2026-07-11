import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { config } from '../config';
import { logger } from '../lib/logger';
import { verifyAccessToken } from '../lib/jwt';
import { authRedisGet } from '../lib/redis';
import { authService } from '../modules/auth/auth.service';
import { tradingService } from '../modules/trading/trading.service';
import { ledgerService } from '../modules/ledger/ledger.service';
import { isSupportedSymbol } from '../modules/market-data/symbol-registry';
import {
  realtimeBus,
  REALTIME_EVENT,
  type BalanceChangedEvent,
  type OrderUpdatedEvent,
  type OrderbookChangedEvent,
  type TradeExecutedEvent,
  type MarketCandleEvent,
  type MarketTickerEvent,
} from './events';

/**
 * Socket.IO gateway for live exchange updates.
 *
 * Rooms:
 *   - `user:{userId}`   private; auto-joined on connect. Carries order.updated
 *                       and balance.updated for that user only.
 *   - `market:{SYMBOL}` public market data; joined via `subscribe`. Carries
 *                       orderbook.updated and trade.executed (the tape).
 *
 * Auth: every connection MUST present a valid user access JWT (same verification
 * + Redis revocation + session check as the REST `authenticate` middleware), so
 * a logged-out session cannot hold a live socket open. Market data still
 * requires a logged-in socket here — there is no anonymous tier in this MVP.
 *
 * The order book is a derived snapshot, so we coalesce a burst of changes (many
 * fills from one taker) into a single DB read + broadcast, and we only read the
 * book / balances when a room actually has subscribers.
 */

// `market:USDT-INR` shape only — guards against clients joining arbitrary rooms.
const MARKET_ROOM_RE = /^market:[A-Z0-9]+-[A-Z0-9]+$/;
const ORDERBOOK_DEPTH = 50;
const ORDERBOOK_COALESCE_MS = 150;

function extractToken(socket: Socket): string | null {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;
  const header = socket.handshake.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return null;
}

function marketRoom(symbol: string): string {
  return `market:${symbol}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function symbolFromRoom(room: string): string {
  return room.slice('market:'.length);
}

// External live market-data rooms (Goal 9) — entirely separate namespace
// from the internal `market:{SYMBOL}` trading rooms above (no dash, e.g.
// `md:BTCUSDT`), so a client can never confuse the two feeds.
const MARKET_DATA_SUB_LIMIT = 20; // generous — the registry only has 4 symbols today.

function marketDataRoom(symbol: string): string {
  return `md:${symbol}`;
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: {
      origin: config.http.corsOrigins.length > 0 ? config.http.corsOrigins : false,
      credentials: true,
    },
  });

  // --- Authentication handshake -------------------------------------------
  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error('UNAUTHENTICATED'));

      const payload = verifyAccessToken(token);

      const revoked = await authRedisGet(`session:revoked:${payload.sid}`).catch(() => null);
      if (revoked) return next(new Error('SESSION_REVOKED'));

      // DB is the authority — rejects revoked/expired/inactive sessions.
      const user = await authService.validateAccessSession(payload.sub, payload.sid);
      socket.data.userId = user.id;
      socket.data.sessionId = payload.sid;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    socket.emit('connected', { userId });
    logger.debug({ userId, socketId: socket.id }, 'socket connected');

    socket.on('subscribe', (room: unknown) => {
      if (typeof room !== 'string' || !MARKET_ROOM_RE.test(room)) return;
      void socket.join(room);
      socket.emit('subscribed', { room });
      // Send an immediate snapshot so the client starts from a fresh book.
      void emitOrderbookSnapshot(io, symbolFromRoom(room));
    });

    socket.on('unsubscribe', (room: unknown) => {
      if (typeof room === 'string') void socket.leave(room);
    });

    // Explicit market-data symbol subscriptions, server-side allowlisted
    // against the symbol registry (Goal 9) — never joins an arbitrary room.
    const mdSubscriptions = new Set<string>();
    socket.on('md:subscribe', (symbol: unknown) => {
      if (typeof symbol !== 'string' || !isSupportedSymbol(symbol)) return;
      if (mdSubscriptions.has(symbol)) return;
      if (mdSubscriptions.size >= MARKET_DATA_SUB_LIMIT) return;
      mdSubscriptions.add(symbol);
      void socket.join(marketDataRoom(symbol));
      socket.emit('md:subscribed', { symbol });
    });

    socket.on('md:unsubscribe', (symbol: unknown) => {
      if (typeof symbol !== 'string') return;
      mdSubscriptions.delete(symbol);
      void socket.leave(marketDataRoom(symbol));
    });

    socket.on('disconnect', () => {
      mdSubscriptions.clear();
    });
  });

  wireBus(io);
  return io;
}

// --- Bus → room fan-out ----------------------------------------------------

function wireBus(io: IOServer): void {
  realtimeBus.on(REALTIME_EVENT.ORDERBOOK_CHANGED, (e: OrderbookChangedEvent) => {
    scheduleOrderbookSnapshot(io, e.symbol);
  });

  realtimeBus.on(REALTIME_EVENT.TRADE_EXECUTED, (e: TradeExecutedEvent) => {
    safe('trade.executed', () => {
      io.to(marketRoom(e.symbol)).emit('trade.executed', {
        symbol: e.symbol,
        id: e.trade.id,
        price: e.trade.price,
        quantity: e.trade.quantity,
        side: e.trade.makerSide,
        makerSide: e.trade.makerSide,
        executedAt: e.trade.executedAt,
      });
    });
  });

  realtimeBus.on(REALTIME_EVENT.ORDER_UPDATED, (e: OrderUpdatedEvent) => {
    safe('order.updated', () => {
      io.to(userRoom(e.userId)).emit('order.updated', e.order);
    });
  });

  realtimeBus.on(REALTIME_EVENT.BALANCE_CHANGED, (e: BalanceChangedEvent) => {
    void emitBalance(io, e.userId);
  });

  realtimeBus.on(REALTIME_EVENT.MARKET_TICKER, (e: MarketTickerEvent) => {
    safe('market-data.ticker', () => {
      io.to(marketDataRoom(e.ticker.symbol)).emit('ticker', {
        type: 'ticker',
        symbol: e.ticker.symbol,
        data: {
          price: e.ticker.price,
          bid: e.ticker.bid,
          ask: e.ticker.ask,
          high24h: e.ticker.high24h,
          low24h: e.ticker.low24h,
          volume24h: e.ticker.volume24h,
          change24hPercent: e.ticker.change24hPercent,
          source: e.ticker.source,
          sourceTimestamp: e.ticker.sourceTimestamp,
          stale: e.ticker.stale,
        },
      });
    });
  });

  realtimeBus.on(REALTIME_EVENT.MARKET_CANDLE, (e: MarketCandleEvent) => {
    safe('market-data.candle', () => {
      io.to(marketDataRoom(e.candle.symbol)).emit('candle', {
        type: 'candle',
        symbol: e.candle.symbol,
        resolution: e.candle.resolution,
        data: {
          time: e.candle.time,
          open: e.candle.open,
          high: e.candle.high,
          low: e.candle.low,
          close: e.candle.close,
          volume: e.candle.volume,
        },
      });
    });
  });
}

// Coalesce order-book recomputation per symbol: a single taker can produce many
// fills, each signalling a book change. One snapshot per window is plenty.
const pendingBook = new Map<string, NodeJS.Timeout>();

function scheduleOrderbookSnapshot(io: IOServer, symbol: string): void {
  if (pendingBook.has(symbol)) return;
  const timer = setTimeout(() => {
    pendingBook.delete(symbol);
    void emitOrderbookSnapshot(io, symbol);
  }, ORDERBOOK_COALESCE_MS);
  timer.unref();
  pendingBook.set(symbol, timer);
}

async function emitOrderbookSnapshot(io: IOServer, symbol: string): Promise<void> {
  const room = marketRoom(symbol);
  if (!io.sockets.adapter.rooms.get(room)) return; // nobody listening
  try {
    const book = await tradingService.getOrderBook(symbol, ORDERBOOK_DEPTH);
    io.to(room).emit('orderbook.updated', book);
  } catch (err) {
    logger.error({ err, symbol }, 'orderbook snapshot failed');
  }
}

async function emitBalance(io: IOServer, userId: string): Promise<void> {
  const room = userRoom(userId);
  if (!io.sockets.adapter.rooms.get(room)) return; // user not connected
  try {
    const balances = await ledgerService.listWallets(userId);
    io.to(room).emit('balance.updated', { balances });
  } catch (err) {
    logger.error({ err, userId }, 'balance snapshot failed');
  }
}

function safe(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    logger.error({ err, label }, 'realtime fan-out failed');
  }
}
