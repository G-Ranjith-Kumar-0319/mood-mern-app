import { vi } from 'vitest';
import type { SignalingSocket } from '../services/signaling';

type Handler = (...args: never[]) => void;

/** Socket.IO client stand-in: records what the page sends and lets tests play the server. */
export class FakeSocket {
  readonly sent: { event: string; payload: unknown }[] = [];
  active = true;
  disconnected = false;
  private readonly handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.sent.push({ event, payload });
    return this;
  }

  disconnect() {
    this.disconnected = true;
    this.active = false;
    return this;
  }

  /** Delivers a server → client event. */
  receive(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((handler) => (handler as (...a: unknown[]) => void)(...args));
  }

  sentEvents(event: string): unknown[] {
    return this.sent.filter((message) => message.event === event).map((m) => m.payload);
  }

  get asSocket(): SignalingSocket {
    return this as unknown as SignalingSocket;
  }
}

/** Minimal RTCPeerConnection for jsdom (which has no WebRTC). */
export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  readonly config: RTCConfiguration;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  readonly addedCandidates: RTCIceCandidateInit[] = [];
  readonly senders: { track: MediaStreamTrack | null; replaceTrack: ReturnType<typeof vi.fn> }[] =
    [];
  closed = false;

  onicecandidate:
    ((event: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  constructor(config: RTCConfiguration) {
    this.config = config;
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: MediaStreamTrack) {
    const sender = { track, replaceTrack: vi.fn(() => Promise.resolve()) };
    this.senders.push(sender);
    return sender;
  }

  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'offer-sdp' });
  }

  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'answer-sdp' });
  }

  setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  addIceCandidate(candidate: RTCIceCandidateInit) {
    this.addedCandidates.push(candidate);
    return Promise.resolve();
  }

  close() {
    this.closed = true;
  }

  // ----- test controls -----
  setState(connection: RTCPeerConnectionState, ice: RTCIceConnectionState = 'connected') {
    this.connectionState = connection;
    this.iceConnectionState = ice;
    this.onconnectionstatechange?.();
  }

  emitCandidate(candidate: RTCIceCandidateInit) {
    this.onicecandidate?.({ candidate: { toJSON: () => candidate } });
  }

  emitTrack(stream: MediaStream) {
    const [track] = stream.getVideoTracks();
    this.ontrack?.({ streams: [stream], track: track as MediaStreamTrack });
  }
}

export function installFakeWebRtc(): void {
  FakePeerConnection.instances = [];
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
}

/** Resolves pending promise chains (offer → setLocalDescription → emit). */
export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
