import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { attachCameraSignaling, type CameraSignaling } from '../../src/realtime/cameraSignaling.js';
import type { CameraSessionDto } from '../../src/services/cameraSession.service.js';

let httpServer: HttpServer;
let signaling: CameraSignaling;
let baseUrl: string;
const openSockets: Socket[] = [];

beforeAll(async () => {
  httpServer = createServer(createApp());
  signaling = attachCameraSignaling(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  openSockets.splice(0).forEach((socket) => socket.disconnect());
});

afterAll(async () => {
  signaling.stop();
  await new Promise<void>((resolve) => signaling.io.close(() => resolve()));
});

async function createSession(): Promise<CameraSessionDto> {
  const response = await request(baseUrl).post('/api/v1/camera/sessions').expect(201);
  return response.body.data as CameraSessionDto;
}

function join(sessionId: string, token: string): Socket {
  const socket = connect(baseUrl, {
    path: '/socket.io',
    query: { sessionId },
    auth: { sessionId, token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  openSockets.push(socket);
  return socket;
}

function next<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

async function joined(socket: Socket) {
  return next<{ role: string; peerConnected: boolean }>(socket, 'camera:joined');
}

async function rejected(socket: Socket): Promise<string> {
  const error = await next<Error>(socket, 'connect_error');
  return error.message;
}

describe('POST /api/v1/camera/sessions', () => {
  it('creates a short-lived session', async () => {
    const session = await createSession();
    expect(session).toMatchObject({
      sessionId: expect.any(String),
      hostToken: expect.any(String),
      phoneToken: expect.any(String),
      iceServers: [],
    });
    expect(session.cameraUrl).toContain(`/camera/${session.sessionId}#token=`);
    const ttlMs = Date.parse(session.expiresAt) - Date.now();
    expect(ttlMs).toBeGreaterThan(9 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe('camera signaling', () => {
  it('joins the laptop and phone and tells each about the other', async () => {
    const session = await createSession();
    const host = join(session.sessionId, session.hostToken);
    expect(await joined(host)).toMatchObject({ role: 'host', peerConnected: false });

    const peerJoined = next(host, 'camera:peer-joined');
    const phone = join(session.sessionId, session.phoneToken);
    expect(await joined(phone)).toMatchObject({ role: 'phone', peerConnected: true });
    expect(await peerJoined).toEqual({ role: 'phone' });
  });

  it('rejects an invalid token, a token for another session and a missing token', async () => {
    const session = await createSession();
    const other = await createSession();

    expect(await rejected(join(session.sessionId, 'forged'))).toBe('SESSION_INVALID');
    expect(await rejected(join(session.sessionId, other.phoneToken))).toBe('SESSION_INVALID');
    expect(await rejected(join('bad id!', session.phoneToken))).toBe('SESSION_INVALID');
  });

  it('relays offer → answer → ICE candidates between the two peers only', async () => {
    const session = await createSession();
    const host = join(session.sessionId, session.hostToken);
    await joined(host);
    const phone = join(session.sessionId, session.phoneToken);
    await joined(phone);

    const offer = next(host, 'camera:offer');
    phone.emit('camera:offer', { sdp: 'v=0 offer' });
    expect(await offer).toEqual({ sdp: 'v=0 offer' });

    const answer = next(phone, 'camera:answer');
    host.emit('camera:answer', { sdp: 'v=0 answer' });
    expect(await answer).toEqual({ sdp: 'v=0 answer' });

    const candidate = { candidate: 'candidate:1 1 udp 1 192.168.1.2 5000 typ host', sdpMid: '0' };
    const received = next(host, 'camera:ice-candidate');
    phone.emit('camera:ice-candidate', { candidate });
    expect(await received).toEqual({ candidate });
  });

  it('enforces direction: the laptop cannot send offers, the phone cannot answer', async () => {
    const session = await createSession();
    const host = join(session.sessionId, session.hostToken);
    await joined(host);
    const phone = join(session.sessionId, session.phoneToken);
    await joined(phone);

    const hostError = next<{ code: string }>(host, 'camera:error');
    host.emit('camera:offer', { sdp: 'v=0' });
    expect((await hostError).code).toBe('INVALID_MESSAGE');

    const phoneError = next<{ code: string }>(phone, 'camera:error');
    phone.emit('camera:answer', { sdp: 'v=0' });
    expect((await phoneError).code).toBe('INVALID_MESSAGE');
  });

  it('rejects malformed payloads', async () => {
    const session = await createSession();
    const phone = join(session.sessionId, session.phoneToken);
    await joined(phone);

    const error = next<{ code: string }>(phone, 'camera:error');
    phone.emit('camera:offer', { sdp: 'v=0', extra: 'field' });
    expect((await error).code).toBe('INVALID_MESSAGE');
  });

  it('notifies the laptop when the phone disconnects', async () => {
    const session = await createSession();
    const host = join(session.sessionId, session.hostToken);
    await joined(host);
    const phone = join(session.sessionId, session.phoneToken);
    await joined(phone);

    const left = next(host, 'camera:peer-left');
    phone.disconnect();
    expect(await left).toEqual({ role: 'phone' });
  });

  it('lets a refreshed phone page take over from its previous connection', async () => {
    const session = await createSession();
    const host = join(session.sessionId, session.hostToken);
    await joined(host);
    const firstPhone = join(session.sessionId, session.phoneToken);
    await joined(firstPhone);

    const replacedError = next<{ code: string }>(firstPhone, 'camera:error');
    const secondPhone = join(session.sessionId, session.phoneToken);
    await joined(secondPhone);
    expect((await replacedError).code).toBe('REPLACED');

    const offer = next(host, 'camera:offer');
    secondPhone.emit('camera:offer', { sdp: 'v=0 from the new page' });
    expect(await offer).toEqual({ sdp: 'v=0 from the new page' });
  });

  it('ends the session for good when the laptop closes it', async () => {
    const session = await createSession();
    const host = join(session.sessionId, session.hostToken);
    await joined(host);
    const phone = join(session.sessionId, session.phoneToken);
    await joined(phone);

    const ended = next(phone, 'camera:session-ended');
    host.emit('camera:end-session');
    await ended;

    expect(await rejected(join(session.sessionId, session.phoneToken))).toBe('SESSION_ENDED');
  });
});
