import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSignaling } from '../services/signaling';
import { createFakeStream } from '../test/mediaMocks';
import {
  FakePeerConnection,
  FakeSocket,
  flushPromises,
  installFakeWebRtc,
} from '../test/webrtcMocks';
import type { CameraRole } from '../types/remoteCamera';
import { useSignaling } from './useSignaling';
import { useWebRTC } from './useWebRTC';

vi.mock('../services/signaling', () => ({ connectSignaling: vi.fn() }));

const CREDENTIALS = { sessionId: 'session-1', token: 'token-1' };
const ICE = [{ urls: 'stun:stun.example.com' }];

let socket: FakeSocket;

interface Props {
  role: CameraRole;
  stream?: MediaStream | null;
  paused?: boolean;
}

function renderPeer(initial: Props) {
  return renderHook(
    ({ role, stream = null, paused = false }: Props) => {
      const signaling = useSignaling(CREDENTIALS);
      const webrtc = useWebRTC({ role, signaling, localStream: stream, localStreamPaused: paused });
      return { signaling, webrtc };
    },
    { initialProps: initial },
  );
}

async function serverSays(event: string, ...args: unknown[]) {
  await act(async () => {
    socket.receive(event, ...args);
    await flushPromises();
  });
}

const lastConnection = () => FakePeerConnection.instances.at(-1) as FakePeerConnection;

describe('useSignaling', () => {
  beforeEach(() => {
    socket = new FakeSocket();
    vi.mocked(connectSignaling).mockReturnValue(socket.asSocket);
  });

  it('joins the session and tracks the other peer', async () => {
    const { result } = renderPeer({ role: 'host' });
    expect(result.current.signaling.status).toBe('connecting');
    expect(connectSignaling).toHaveBeenCalledWith(CREDENTIALS);

    await serverSays('camera:joined', { role: 'host', peerConnected: false, iceServers: ICE });
    expect(result.current.signaling).toMatchObject({ status: 'joined', peerConnected: false });

    await serverSays('camera:peer-joined', { role: 'phone' });
    expect(result.current.signaling.peerConnected).toBe(true);

    await serverSays('camera:peer-left', { role: 'phone' });
    expect(result.current.signaling).toMatchObject({ peerConnected: false, peerLeft: true });
  });

  it('turns a rejected handshake into a typed, final error', async () => {
    const { result } = renderPeer({ role: 'phone' });
    socket.active = false; // Socket.IO does not retry after a middleware rejection
    await serverSays('connect_error', Object.assign(new Error('SESSION_EXPIRED'), {}));

    expect(result.current.signaling.status).toBe('error');
    expect(result.current.signaling.error?.code).toBe('CAMERA_SESSION_EXPIRED');
    expect(result.current.signaling.error?.message).toMatch(/generate a new QR code/);
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderPeer({ role: 'host' });
    unmount();
    expect(socket.disconnected).toBe(true);
  });
});

describe('useWebRTC — phone', () => {
  beforeEach(() => {
    installFakeWebRtc();
    socket = new FakeSocket();
    vi.mocked(connectSignaling).mockReturnValue(socket.asSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does not stream until the camera is started, then offers it to the laptop', async () => {
    const { rerender } = renderPeer({ role: 'phone' });
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: ICE });
    expect(FakePeerConnection.instances).toHaveLength(0);

    const camera = createFakeStream();
    rerender({ role: 'phone', stream: camera.stream });
    await act(flushPromises);

    expect(lastConnection().config.iceServers).toEqual(ICE);
    expect(socket.sentEvents('camera:offer')).toEqual([{ sdp: 'offer-sdp' }]);

    await serverSays('camera:answer', { sdp: 'answer-sdp' });
    expect(lastConnection().remoteDescription).toEqual({ type: 'answer', sdp: 'answer-sdp' });
  });

  it('waits for the laptop before offering', async () => {
    const camera = createFakeStream();
    renderPeer({ role: 'phone', stream: camera.stream });
    await serverSays('camera:joined', { role: 'phone', peerConnected: false, iceServers: ICE });
    expect(socket.sentEvents('camera:offer')).toHaveLength(0);

    await serverSays('camera:peer-joined', { role: 'host' });
    expect(socket.sentEvents('camera:offer')).toHaveLength(1);
  });

  it('switches camera by replacing the track, without a new connection', async () => {
    const front = createFakeStream();
    const { rerender } = renderPeer({ role: 'phone', stream: front.stream });
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: ICE });

    rerender({ role: 'phone', stream: null, paused: true }); // useCamera is switching
    const rear = createFakeStream();
    rerender({ role: 'phone', stream: rear.stream });
    await act(flushPromises);

    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(lastConnection().senders[0]?.replaceTrack).toHaveBeenCalledWith(rear.track);
    expect(socket.sentEvents('camera:hangup')).toHaveLength(0);
  });

  it('hangs up and closes the connection when the camera stops', async () => {
    const camera = createFakeStream();
    const { rerender, result } = renderPeer({ role: 'phone', stream: camera.stream });
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: ICE });

    rerender({ role: 'phone', stream: null });

    expect(socket.sentEvents('camera:hangup')).toHaveLength(1);
    expect(lastConnection().closed).toBe(true);
    expect(result.current.webrtc.status).toBe('idle');
  });

  it('re-offers when a refreshed laptop page comes back', async () => {
    const camera = createFakeStream();
    renderPeer({ role: 'phone', stream: camera.stream });
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: ICE });
    const first = lastConnection();

    await serverSays('camera:peer-left', { role: 'host' });
    expect(first.closed).toBe(true);
    await serverSays('camera:peer-joined', { role: 'host' });

    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(socket.sentEvents('camera:offer')).toHaveLength(2);
  });
});

describe('useWebRTC — laptop', () => {
  beforeEach(() => {
    installFakeWebRtc();
    socket = new FakeSocket();
    vi.mocked(connectSignaling).mockReturnValue(socket.asSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function connectedLaptop() {
    const hook = renderPeer({ role: 'host' });
    await serverSays('camera:joined', { role: 'host', peerConnected: true, iceServers: ICE });
    await serverSays('camera:offer', { sdp: 'offer-sdp' });
    return hook;
  }

  it('answers the offer and relays ICE candidates both ways', async () => {
    await connectedLaptop();
    expect(socket.sentEvents('camera:answer')).toEqual([{ sdp: 'answer-sdp' }]);

    await serverSays('camera:ice-candidate', { candidate: { candidate: 'candidate:remote' } });
    expect(lastConnection().addedCandidates).toEqual([{ candidate: 'candidate:remote' }]);

    act(() => lastConnection().emitCandidate({ candidate: 'candidate:local' }));
    expect(socket.sentEvents('camera:ice-candidate')).toEqual([
      { candidate: { candidate: 'candidate:local' } },
    ]);
  });

  it('exposes the phone stream and connection status', async () => {
    const { result } = await connectedLaptop();
    const phoneStream = createFakeStream().stream;

    act(() => lastConnection().emitTrack(phoneStream));
    act(() => lastConnection().setState('connected'));

    expect(result.current.webrtc).toEqual({ remoteStream: phoneStream, status: 'connected' });
  });

  it('drops the stream when the phone stops or leaves', async () => {
    const { result } = await connectedLaptop();
    act(() => lastConnection().emitTrack(createFakeStream().stream));

    await serverSays('camera:hangup');
    expect(result.current.webrtc).toEqual({ remoteStream: null, status: 'idle' });
    expect(lastConnection().closed).toBe(true);
  });

  it('closes the peer connection on unmount', async () => {
    const { unmount } = await connectedLaptop();
    unmount();
    expect(lastConnection().closed).toBe(true);
  });
});
