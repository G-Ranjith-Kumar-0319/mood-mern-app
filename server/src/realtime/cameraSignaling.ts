import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { ZodType } from 'zod';
import type { IceServer } from '../config/rtc.js';
import { logger } from '../config/logger.js';
import {
  handshakeAuthSchema,
  iceCandidateSchema,
  sessionDescriptionSchema,
  type IceCandidatePayload,
  type SessionDescriptionPayload,
} from '../schemas/camera.schema.js';
import {
  CameraSessionError,
  cameraSessionService,
  type CameraRole,
} from '../services/cameraSession.service.js';
import { CameraSessionRegistry, otherRole } from './cameraSessionRegistry.js';

export type SignalingErrorCode =
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'SESSION_ENDED'
  | 'REPLACED'
  | 'INVALID_MESSAGE'
  | 'RATE_LIMITED';

export interface SignalingError {
  code: SignalingErrorCode;
  message: string;
}

export interface JoinedPayload {
  role: CameraRole;
  peerConnected: boolean;
  iceServers: IceServer[];
  expiresAt: string;
}

/** Events the browser may send. Only these are relayed, and only in the allowed direction. */
export interface ClientToServerEvents {
  'camera:offer': (payload: SessionDescriptionPayload) => void;
  'camera:answer': (payload: SessionDescriptionPayload) => void;
  'camera:ice-candidate': (payload: IceCandidatePayload) => void;
  /** Phone stopped streaming (camera off); the session stays open. */
  'camera:hangup': () => void;
  /** Laptop is done: the phone is disconnected and the link stops working. */
  'camera:end-session': () => void;
}

export interface ServerToClientEvents {
  'camera:joined': (payload: JoinedPayload) => void;
  'camera:peer-joined': (payload: { role: CameraRole }) => void;
  'camera:peer-left': (payload: { role: CameraRole }) => void;
  'camera:offer': (payload: SessionDescriptionPayload) => void;
  'camera:answer': (payload: SessionDescriptionPayload) => void;
  'camera:ice-candidate': (payload: IceCandidatePayload) => void;
  'camera:hangup': () => void;
  'camera:session-ended': () => void;
  'camera:error': (payload: SignalingError) => void;
}

interface SocketData {
  sessionId: string;
  role: CameraRole;
  expiresAt: number;
}

type CameraSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
export type CameraSignalingServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  SocketData
>;

/** Offers/answers/candidates are small; anything bigger is not signaling. */
const MAX_MESSAGE_BYTES = 64 * 1024;
/** A connection exchanges a few dozen messages; this only stops floods. */
const MESSAGE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 200;
const SWEEP_INTERVAL_MS = 60_000;

const ERROR_MESSAGES: Record<SignalingErrorCode, string> = {
  SESSION_EXPIRED: 'Camera session expired. Please generate a new QR code.',
  SESSION_INVALID: 'This camera link is not valid.',
  SESSION_ENDED: 'This camera session was closed on the laptop. Please scan a new QR code.',
  REPLACED: 'This camera session was opened in another tab or device.',
  INVALID_MESSAGE: 'Invalid signaling message.',
  RATE_LIMITED: 'Too many signaling messages.',
};

const toError = (code: SignalingErrorCode): SignalingError => ({
  code,
  message: ERROR_MESSAGES[code],
});

/** Rejects a handshake; the browser receives `connect_error` with `.message` = code and `.data`. */
function handshakeError(code: SignalingErrorCode): Error & { data: SignalingError } {
  return Object.assign(new Error(code), { data: toError(code) });
}

/**
 * WebRTC signaling over Socket.IO. The server never sees media: it only
 * authenticates peers (signed session tokens) and relays offer/answer/ICE
 * messages between the laptop and the phone of the same session.
 */
export interface CameraSignaling {
  io: CameraSignalingServer;
  /** Disconnects every peer (graceful shutdown); the HTTP server is closed by its owner. */
  stop: () => void;
}

export function attachCameraSignaling(httpServer: HttpServer): CameraSignaling {
  const io: CameraSignalingServer = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    // No CORS: browsers reach it same-origin through Vite/Nginx. Authentication is an
    // explicit token rather than a cookie, so a cross-site page cannot ride on a session.
  });
  const registry = new CameraSessionRegistry<CameraSocket>();

  io.use((socket, next) => {
    const auth = handshakeAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) return next(handshakeError('SESSION_INVALID'));
    try {
      const claims = cameraSessionService.verify(auth.data.token, auth.data.sessionId);
      if (registry.isEnded(claims.sessionId)) return next(handshakeError('SESSION_ENDED'));
      socket.data = { sessionId: claims.sessionId, role: claims.role, expiresAt: claims.expiresAt };
      next();
    } catch (error) {
      next(handshakeError(error instanceof CameraSessionError ? error.code : 'SESSION_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const { sessionId, role, expiresAt } = socket.data;
    const log = logger.child({ cameraSession: sessionId, role, socketId: socket.id });
    const peer = () => registry.peer(sessionId, otherRole(role));

    const { replaced } = registry.join(sessionId, role, socket, expiresAt);
    if (replaced) {
      replaced.emit('camera:error', toError('REPLACED'));
      replaced.disconnect(true);
    }
    log.info('Camera peer joined');
    socket.emit('camera:joined', {
      role,
      peerConnected: peer() !== null,
      iceServers: cameraSessionService.iceServers(),
      expiresAt: new Date(expiresAt).toISOString(),
    });
    peer()?.emit('camera:peer-joined', { role });

    let windowStart = Date.now();
    let messageCount = 0;
    const allowMessage = (): boolean => {
      const now = Date.now();
      if (now - windowStart > MESSAGE_WINDOW_MS) {
        windowStart = now;
        messageCount = 0;
      }
      messageCount += 1;
      if (messageCount <= MAX_MESSAGES_PER_WINDOW) return true;
      socket.emit('camera:error', toError('RATE_LIMITED'));
      socket.disconnect(true);
      return false;
    };

    /** Validates a payload and forwards it to the other peer (if any). */
    const relay = <T>(
      event: 'camera:offer' | 'camera:answer' | 'camera:ice-candidate',
      allowedRole: CameraRole | 'any',
      schema: ZodType<T>,
      forward: (target: CameraSocket, payload: T) => void,
    ) => {
      socket.on(event, (raw: unknown) => {
        if (!allowMessage()) return;
        const parsed = schema.safeParse(raw);
        if (!parsed.success || (allowedRole !== 'any' && allowedRole !== role)) {
          socket.emit('camera:error', toError('INVALID_MESSAGE'));
          return;
        }
        const target = peer();
        if (target) forward(target, parsed.data);
      });
    };

    // The phone owns the camera track, so it always makes the offer and the laptop answers.
    relay('camera:offer', 'phone', sessionDescriptionSchema, (target, payload) =>
      target.emit('camera:offer', payload),
    );
    relay('camera:answer', 'host', sessionDescriptionSchema, (target, payload) =>
      target.emit('camera:answer', payload),
    );
    relay('camera:ice-candidate', 'any', iceCandidateSchema, (target, payload) =>
      target.emit('camera:ice-candidate', payload),
    );

    socket.on('camera:hangup', () => {
      if (!allowMessage() || role !== 'phone') return;
      peer()?.emit('camera:hangup');
    });

    socket.on('camera:end-session', () => {
      if (!allowMessage() || role !== 'host') return;
      registry.end(sessionId);
      const phone = peer();
      phone?.emit('camera:session-ended');
      phone?.disconnect(true);
      log.info('Camera session ended by host');
      socket.disconnect(true);
    });

    socket.on('disconnect', (reason) => {
      if (registry.leave(sessionId, role, socket)) {
        peer()?.emit('camera:peer-left', { role });
      }
      log.info({ reason }, 'Camera peer left');
    });
  });

  const sweeper = setInterval(() => registry.sweep(Date.now()), SWEEP_INTERVAL_MS);
  sweeper.unref();

  return {
    io,
    stop: () => {
      clearInterval(sweeper);
      io.disconnectSockets(true);
    },
  };
}
