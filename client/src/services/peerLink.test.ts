import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeStream } from '../test/mediaMocks';
import { FakePeerConnection, installFakeWebRtc } from '../test/webrtcMocks';
import { derivePeerStatus } from '../utils/peerStatus';
import { PeerLink, type OutgoingSignal } from './peerLink';

function createLink() {
  const signals: OutgoingSignal[] = [];
  const onStatusChange = vi.fn();
  const onRemoteStream = vi.fn();
  const link = new PeerLink({
    iceServers: [{ urls: 'stun:stun.example.com' }],
    onSignal: (signal) => signals.push(signal),
    onStatusChange,
    onRemoteStream,
  });
  const connection = FakePeerConnection.instances.at(-1) as FakePeerConnection;
  return { link, connection, signals, onStatusChange, onRemoteStream };
}

describe('PeerLink', () => {
  beforeEach(() => installFakeWebRtc());
  afterEach(() => vi.unstubAllGlobals());

  it('uses the configured ICE servers', () => {
    const { connection } = createLink();
    expect(connection.config.iceServers).toEqual([{ urls: 'stun:stun.example.com' }]);
  });

  it('phone: adds only the video track and sends an offer', async () => {
    const { link, connection, signals } = createLink();
    await link.sendStream(createFakeStream().stream);

    expect(connection.senders).toHaveLength(1);
    expect(signals).toEqual([{ type: 'offer', sdp: 'offer-sdp' }]);
  });

  it('laptop: answers an offer', async () => {
    const { link, connection, signals } = createLink();
    await link.acceptOffer('offer-sdp');

    expect(connection.remoteDescription).toEqual({ type: 'offer', sdp: 'offer-sdp' });
    expect(signals).toEqual([{ type: 'answer', sdp: 'answer-sdp' }]);
  });

  it('holds ICE candidates that arrive before the remote description', async () => {
    const { link, connection } = createLink();
    const candidate = { candidate: 'candidate:1', sdpMid: '0' };

    await link.addRemoteCandidate(candidate);
    expect(connection.addedCandidates).toEqual([]);

    await link.acceptOffer('offer-sdp');
    expect(connection.addedCandidates).toEqual([candidate]);
  });

  it('forwards local ICE candidates and the remote stream', () => {
    const { connection, signals, onRemoteStream } = createLink();
    const remote = createFakeStream().stream;

    connection.emitCandidate({ candidate: 'candidate:2' });
    connection.emitTrack(remote);

    expect(signals).toEqual([{ type: 'ice-candidate', candidate: { candidate: 'candidate:2' } }]);
    expect(onRemoteStream).toHaveBeenCalledWith(remote);
  });

  it('swaps the camera track without renegotiating', async () => {
    const { link, connection, signals } = createLink();
    await link.sendStream(createFakeStream().stream);
    const next = createFakeStream().track as unknown as MediaStreamTrack;

    await link.replaceVideoTrack(next);

    expect(connection.senders[0]?.replaceTrack).toHaveBeenCalledWith(next);
    expect(signals).toHaveLength(1); // still just the original offer
  });

  it('reports status changes until closed', () => {
    const { link, connection, onStatusChange } = createLink();
    connection.setState('connected');
    expect(onStatusChange).toHaveBeenLastCalledWith('connected');

    link.close();
    connection.setState('failed', 'failed');
    expect(connection.closed).toBe(true);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });
});

describe('derivePeerStatus', () => {
  it.each([
    ['new', 'new', 'connecting'],
    ['connecting', 'checking', 'connecting'],
    ['connected', 'connected', 'connected'],
    ['disconnected', 'disconnected', 'disconnected'],
    ['failed', 'failed', 'failed'],
    ['connected', 'failed', 'failed'],
    ['closed', 'closed', 'idle'],
    [undefined, 'completed', 'connected'],
  ] as const)('connection=%s ice=%s → %s', (connection, ice, expected) => {
    expect(derivePeerStatus(connection, ice)).toBe(expected);
  });
});
