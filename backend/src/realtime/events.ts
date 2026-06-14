import { EventEmitter } from 'node:events';
import { logger } from '../lib/logger';
import type { OrderDto } from '../modules/trading/trading.types';

/**
 * In-process realtime event bus.
 *
 * Domain code (the trading service) publishes business events here WITHOUT
 * knowing anything about WebSockets. The socket layer (socket-server.ts)
 * subscribes and fans events out to the right rooms. This keeps the matching
 * hot path decoupled from transport — when no socket server is attached (unit
 * tests, the worker/scanner processes) publishing is a cheap no-op, and a
 * misbehaving listener can never throw back into a ledger settlement.
 *
 * Internal bus event names are suffixed `.changed`/`.executed`; the names the
 * CLIENT receives (`orderbook.updated`, `trade.executed`, `order.updated`,
 * `balance.updated`) are produced by the socket layer.
 */

/** A market-tape trade — only the public fields, never per-user fee/role. */
export interface PublicTrade {
  id: string;
  price: string;
  quantity: string;
  makerSide: 'BUY' | 'SELL';
  executedAt: Date;
}

export interface OrderbookChangedEvent {
  symbol: string;
}

export interface TradeExecutedEvent {
  symbol: string;
  trade: PublicTrade;
}

export interface OrderUpdatedEvent {
  userId: string;
  order: OrderDto;
}

export interface BalanceChangedEvent {
  userId: string;
}

export const REALTIME_EVENT = {
  ORDERBOOK_CHANGED: 'orderbook.changed',
  TRADE_EXECUTED: 'trade.executed',
  ORDER_UPDATED: 'order.updated',
  BALANCE_CHANGED: 'balance.changed',
} as const;

/** Unbounded fan-out is fine here; one listener (the socket layer) per process. */
export const realtimeBus = new EventEmitter();
realtimeBus.setMaxListeners(50);

/**
 * Emit on the bus but never let a listener error escape into the caller. The
 * trading service calls these from inside ledger-settlement flows, so a thrown
 * exception here must NOT roll back or abort a financial operation.
 */
function safeEmit(event: string, payload: unknown): void {
  try {
    realtimeBus.emit(event, payload);
  } catch (err) {
    logger.error({ err, event }, 'realtime publish failed');
  }
}

export function publishOrderbookChanged(symbol: string): void {
  safeEmit(REALTIME_EVENT.ORDERBOOK_CHANGED, { symbol } satisfies OrderbookChangedEvent);
}

export function publishTradeExecuted(symbol: string, trade: PublicTrade): void {
  safeEmit(REALTIME_EVENT.TRADE_EXECUTED, { symbol, trade } satisfies TradeExecutedEvent);
}

export function publishOrderUpdated(userId: string, order: OrderDto): void {
  safeEmit(REALTIME_EVENT.ORDER_UPDATED, { userId, order } satisfies OrderUpdatedEvent);
}

export function publishBalanceChanged(userId: string): void {
  safeEmit(REALTIME_EVENT.BALANCE_CHANGED, { userId } satisfies BalanceChangedEvent);
}
