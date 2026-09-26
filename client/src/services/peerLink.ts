import type { PeerStatus } from '../types/remoteCamera';
import { derivePeerStatus } from '../utils/peerStatus';

export type OutgoingSignal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

export interface PeerLinkOptions {
  iceServers: RTCIceServer[];
  /** Messages to deliver to the other peer through the signaling server. */
  onSignal: (signal: OutgoingSignal) => void;
  onStatusChange: (status: PeerStatus) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

/**
 * One RTCPeerConnection, used by both sides: the phone calls `sendStream`
 * (it owns the camera, so it makes the offer); the laptop calls `acceptOffer`.
 * Media flows peer-to-peer; only these small SDP/ICE messages use the server.
 */
export class PeerLink {
  private readonly connection: RTCPeerConnection;
  private readonly options: PeerLinkOptions;
  /** ICE candidates can arrive before the remote description; they must wait for it. */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private videoSender: RTCRtpSender | null = null;
  private closed = false;

  constructor(options: PeerLinkOptions) {
    this.options = options;
    this.connection = new RTCPeerConnection({ iceServers: options.iceServers });

    this.connection.onicecandidate = (event) => {
      if (event.candidate) {
        options.onSignal({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
      }
    };
    this.connection.ontrack = (event) => {
      options.onRemoteStream?.(event.streams[0] ?? new MediaStream([event.track]));
    };
    const reportStatus = () => {
      if (this.closed) return;
      options.onStatusChange(
        derivePeerStatus(this.connection.connectionState, this.connection.iceConnectionState),
      );
    };
    this.connection.onconnectionstatechange = reportStatus;
    this.connection.oniceconnectionstatechange = reportStatus;
  }

  /** Phone side: add the camera track and offer it. Video only — never audio. */
  async sendStream(stream: MediaStream): Promise<void> {
    const [track] = stream.getVideoTracks();
    if (!track) return;
    this.videoSender = this.connection.addTrack(track, stream);
    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
    this.emitLocalDescription('offer');
  }

  /**
   * Phone side: swap the camera (front ↔ rear) without renegotiating, so the
   * laptop's video never drops.
   */
  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    await this.videoSender?.replaceTrack(track);
  }

  /** Laptop side: answer the phone's offer. */
  async acceptOffer(sdp: string): Promise<void> {
    await this.connection.setRemoteDescription({ type: 'offer', sdp });
    await this.flushCandidates();
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    this.emitLocalDescription('answer');
  }

  /** Phone side: complete the handshake. */
  async acceptAnswer(sdp: string): Promise<void> {
    await this.connection.setRemoteDescription({ type: 'answer', sdp });
    await this.flushCandidates();
  }

  async addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.connection.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await this.addCandidateSafely(candidate);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connection.onicecandidate = null;
    this.connection.ontrack = null;
    this.connection.onconnectionstatechange = null;
    this.connection.oniceconnectionstatechange = null;
    this.connection.close();
  }

  private emitLocalDescription(type: 'offer' | 'answer') {
    const sdp = this.connection.localDescription?.sdp;
    if (sdp && !this.closed) this.options.onSignal({ type, sdp });
  }

  private async flushCandidates() {
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of pending) await this.addCandidateSafely(candidate);
  }

  private async addCandidateSafely(candidate: RTCIceCandidateInit) {
    try {
      await this.connection.addIceCandidate(candidate);
    } catch {
      // A single unusable candidate (e.g. an unsupported address type) is not fatal:
      // ICE simply tries the others.
    }
  }
}
