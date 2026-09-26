/**
 * Phone-as-camera over WebRTC. These mirror the API's camera session and
 * signaling contracts (server/src/realtime/cameraSignaling.ts).
 */

/** "host" = the laptop running detection; "phone" = the remote camera. */
export type CameraRole = 'host' | 'phone';

export interface CameraSession {
  sessionId: string;
  hostToken: string;
  phoneToken: string;
  /** What the QR code encodes; the phone token is in the #fragment. */
  cameraUrl: string;
  expiresAt: string;
  iceServers: RTCIceServer[];
}

export interface SignalingCredentials {
  sessionId: string;
  token: string;
}

export type SignalingErrorCode =
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'SESSION_ENDED'
  | 'REPLACED'
  | 'INVALID_MESSAGE'
  | 'RATE_LIMITED';

export interface SignalingErrorPayload {
  code: SignalingErrorCode;
  message: string;
}

export interface JoinedPayload {
  role: CameraRole;
  peerConnected: boolean;
  iceServers: RTCIceServer[];
  expiresAt: string;
}

export interface SessionDescriptionPayload {
  sdp: string;
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
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
  'camera:error': (payload: SignalingErrorPayload) => void;
}

export interface ClientToServerEvents {
  'camera:offer': (payload: SessionDescriptionPayload) => void;
  'camera:answer': (payload: SessionDescriptionPayload) => void;
  'camera:ice-candidate': (payload: IceCandidatePayload) => void;
  'camera:hangup': () => void;
  'camera:end-session': () => void;
}

/** WebRTC link health, derived from connectionState + iceConnectionState. */
export type PeerStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
