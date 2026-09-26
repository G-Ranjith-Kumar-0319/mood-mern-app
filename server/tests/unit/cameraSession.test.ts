import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIceServers, type RtcConfig } from '../../src/config/rtc.js';
import { CameraSessionRegistry } from '../../src/realtime/cameraSessionRegistry.js';
import {
  CameraSessionError,
  cameraSessionService,
} from '../../src/services/cameraSession.service.js';
import {
  buildCameraUrl,
  pickLanAddress,
  resolveCameraBaseUrl,
} from '../../src/utils/phoneCameraUrl.js';

const TEN_MINUTES_MS = 10 * 60 * 1000;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof CameraSessionError ? error.code : 'unexpected';
  }
  return undefined;
}

describe('cameraSessionService', () => {
  afterEach(() => vi.useRealTimers());

  it('issues a session with separate host and phone tokens and a phone link', () => {
    const session = cameraSessionService.create('https://app.example.com');

    expect(session.sessionId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(session.hostToken).not.toBe(session.phoneToken);
    expect(session.cameraUrl).toBe(
      `https://app.example.com/camera/${session.sessionId}#token=${session.phoneToken}`,
    );
    expect(cameraSessionService.verify(session.hostToken, session.sessionId).role).toBe('host');
    expect(cameraSessionService.verify(session.phoneToken, session.sessionId).role).toBe('phone');
  });

  it('expires after the configured TTL (10 minutes by default)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const session = cameraSessionService.create('https://app.example.com');
    expect(Date.parse(session.expiresAt) - Date.now()).toBe(TEN_MINUTES_MS);

    vi.setSystemTime(Date.now() + TEN_MINUTES_MS + 1000);
    expect(codeOf(() => cameraSessionService.verify(session.phoneToken, session.sessionId))).toBe(
      'SESSION_EXPIRED',
    );
  });

  it('rejects a token used for another session', () => {
    const first = cameraSessionService.create('https://app.example.com');
    const second = cameraSessionService.create('https://app.example.com');
    expect(codeOf(() => cameraSessionService.verify(first.phoneToken, second.sessionId))).toBe(
      'SESSION_INVALID',
    );
  });

  it('rejects tampered and garbage tokens', () => {
    const { phoneToken, sessionId } = cameraSessionService.create('https://app.example.com');
    const [header, payload] = phoneToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ role: 'host', sub: sessionId, aud: 'camera-session' }),
    ).toString('base64url');

    expect(
      codeOf(() => cameraSessionService.verify(`${header}.${forgedPayload}.x`, sessionId)),
    ).toBe('SESSION_INVALID');
    expect(codeOf(() => cameraSessionService.verify(`${header}.${payload}`, sessionId))).toBe(
      'SESSION_INVALID',
    );
    expect(codeOf(() => cameraSessionService.verify('not-a-token', sessionId))).toBe(
      'SESSION_INVALID',
    );
  });
});

describe('buildIceServers', () => {
  const base: RtcConfig = {
    stunUrls: ['stun:stun.example.com:3478'],
    turnUrls: [],
    turnUsername: undefined,
    turnCredential: undefined,
    turnSharedSecret: undefined,
  };

  it('returns STUN only by default and nothing when STUN is disabled', () => {
    expect(buildIceServers(base)).toEqual([{ urls: ['stun:stun.example.com:3478'] }]);
    expect(buildIceServers({ ...base, stunUrls: [] })).toEqual([]);
  });

  it('adds TURN with static credentials', () => {
    const servers = buildIceServers({
      ...base,
      turnUrls: ['turn:turn.example.com:3478'],
      turnUsername: 'user',
      turnCredential: 'pass',
    });
    expect(servers[1]).toEqual({
      urls: ['turn:turn.example.com:3478'],
      username: 'user',
      credential: 'pass',
    });
  });

  it('issues time-limited coturn credentials from a shared secret', () => {
    const now = Date.UTC(2026, 0, 1);
    const [, turn] = buildIceServers(
      { ...base, turnUrls: ['turns:turn.example.com:5349'], turnSharedSecret: 's3cret' },
      now,
    );
    const expiry = now / 1000 + 12 * 60 * 60;
    expect(turn?.username).toBe(`${expiry}:camera`);
    expect(turn?.credential).toBe(
      createHmac('sha1', 's3cret').update(`${expiry}:camera`).digest('base64'),
    );
  });
});

describe('resolveCameraBaseUrl', () => {
  const input = {
    appUrl: 'https://app.example.com',
    isProduction: true,
    lanAddress: '192.168.1.100',
  };

  it('uses APP_URL in production and PHONE_CAMERA_URL when set', () => {
    expect(resolveCameraBaseUrl({ ...input, requestOrigin: 'https://evil.test' })).toBe(
      'https://app.example.com',
    );
    expect(resolveCameraBaseUrl({ ...input, configured: 'https://cam.example.com' })).toBe(
      'https://cam.example.com',
    );
  });

  it('replaces localhost with the LAN address in development (keeping scheme and port)', () => {
    expect(
      resolveCameraBaseUrl({
        ...input,
        isProduction: false,
        requestOrigin: 'https://localhost:5173',
      }),
    ).toBe('https://192.168.1.100:5173');
  });

  it('never swaps in a LAN address in production (it would be the container IP)', () => {
    expect(resolveCameraBaseUrl({ ...input, appUrl: 'http://localhost:8080' })).toBe(
      'http://localhost:8080',
    );
  });

  it('keeps localhost when no LAN address is available', () => {
    expect(
      resolveCameraBaseUrl({
        ...input,
        isProduction: false,
        requestOrigin: 'http://localhost:5173',
        lanAddress: null,
      }),
    ).toBe('http://localhost:5173');
  });

  it('puts the token in the URL fragment, which browsers never send to servers', () => {
    expect(buildCameraUrl('https://a.example', 'abc', 't.o.k')).toBe(
      'https://a.example/camera/abc#token=t.o.k',
    );
  });
});

describe('pickLanAddress', () => {
  it('prefers the Wi-Fi/Ethernet address over virtual adapters', () => {
    expect(
      pickLanAddress([
        { interfaceName: 'vEthernet (WSL (Hyper-V firewall))', address: '172.31.48.1' },
        { interfaceName: 'docker0', address: '172.17.0.1' },
        { interfaceName: 'Wi-Fi', address: '192.168.0.104' },
      ]),
    ).toBe('192.168.0.104');
  });

  it('ranks 192.168 before 10 before 172.16–31, and ignores public addresses', () => {
    expect(
      pickLanAddress([
        { interfaceName: 'eth1', address: '172.20.1.5' },
        { interfaceName: 'eth0', address: '10.0.0.7' },
      ]),
    ).toBe('10.0.0.7');
    expect(pickLanAddress([{ interfaceName: 'eth0', address: '203.0.113.9' }])).toBeNull();
  });
});

describe('CameraSessionRegistry', () => {
  const peer = (id: string) => ({ id });

  it('keeps one peer per role and reports the one it replaced', () => {
    const registry = new CameraSessionRegistry<{ id: string }>();
    const oldPhone = peer('p1');
    expect(registry.join('s', 'phone', oldPhone, 1000).replaced).toBeNull();
    expect(registry.join('s', 'phone', peer('p2'), 1000).replaced).toBe(oldPhone);
    expect(registry.peer('s', 'phone')?.id).toBe('p2');
    // The replaced socket disconnecting must not remove its replacement.
    expect(registry.leave('s', 'phone', oldPhone)).toBe(false);
    expect(registry.peer('s', 'phone')?.id).toBe('p2');
  });

  it('forgets expired, empty sessions but keeps ended ones until expiry', () => {
    const registry = new CameraSessionRegistry<{ id: string }>();
    const host = peer('h');
    registry.join('s', 'host', host, 1000);
    registry.end('s');
    registry.leave('s', 'host', host);

    registry.sweep(500);
    expect(registry.isEnded('s')).toBe(true);
    registry.sweep(1000);
    expect(registry.size).toBe(0);
  });
});
