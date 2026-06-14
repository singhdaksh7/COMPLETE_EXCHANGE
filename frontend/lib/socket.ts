import { io, type Socket } from 'socket.io-client';
import { USER_API_URL } from './config';

/**
 * Singleton Socket.IO client for the public exchange feed.
 *
 * One connection is shared across the app so navigating between pages does not
 * thrash the socket. It is (re)created only when the auth token changes, and the
 * client auto-reconnects with backoff. When the socket is down the UI falls back
 * to REST polling — see `useRealtime`.
 */

/** The WebSocket origin is the API origin without the `/api/v1` path. */
function wsOrigin(): string {
  try {
    return new URL(USER_API_URL).origin;
  } catch {
    return 'http://localhost:4000';
  }
}

let socket: Socket | null = null;
let currentToken: string | null = null;

/** Get (or lazily create) the shared socket authenticated with `token`. */
export function getSocket(token: string): Socket {
  if (socket && currentToken === token) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentToken = token;
  socket = io(wsOrigin(), {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 8000,
  });
  return socket;
}

/** Tear down the connection (call on logout). */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}
