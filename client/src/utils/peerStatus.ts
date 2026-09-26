import type { PeerStatus } from '../types/remoteCamera';

/**
 * Combines the two WebRTC state machines into one UI status. `connectionState`
 * is the better signal (it includes DTLS), but `iceConnectionState` is the
 * fallback on browsers that lack it. "disconnected" is often temporary (Wi-Fi
 * hiccup) and may recover; "failed" is final for this connection.
 */
export function derivePeerStatus(
  connectionState: RTCPeerConnectionState | undefined,
  iceConnectionState: RTCIceConnectionState,
): PeerStatus {
  if (connectionState === 'failed' || iceConnectionState === 'failed') return 'failed';
  if (connectionState === 'closed' || iceConnectionState === 'closed') return 'idle';
  if (connectionState === 'disconnected' || iceConnectionState === 'disconnected') {
    return 'disconnected';
  }
  if (connectionState === 'connected') return 'connected';
  const iceConnected = iceConnectionState === 'connected' || iceConnectionState === 'completed';
  if (connectionState === undefined && iceConnected) return 'connected';
  return 'connecting';
}

export function isWebRtcSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
}
