import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SignalingCredentials,
} from '../types/remoteCamera';

export type SignalingSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Opens the Socket.IO signaling connection for one camera session. Same-origin:
 * Vite (dev) and Nginx (Docker/production) proxy /socket.io to the API, so it
 * works from a phone on the LAN and over wss:// in production without config.
 *
 * - `auth` carries the token (sent in the handshake body, never in a URL).
 * - `query.sessionId` lets Nginx route both peers of a session to the same API
 *   instance (the id is not secret; the token is).
 */
export function connectSignaling({ sessionId, token }: SignalingCredentials): SignalingSocket {
  return io({
    path: '/socket.io',
    query: { sessionId },
    auth: { sessionId, token },
  });
}
