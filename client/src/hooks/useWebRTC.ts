import { useEffect, useRef, useState } from 'react';
import { PeerLink, type OutgoingSignal } from '../services/peerLink';
import type { SignalingSocket } from '../services/signaling';
import type { CameraRole, PeerStatus } from '../types/remoteCamera';
import type { SignalingState } from './useSignaling';

export interface UseWebRTCOptions {
  role: CameraRole;
  signaling: SignalingState;
  /** Phone only: the camera stream to send (null = not streaming). */
  localStream?: MediaStream | null;
  /** Phone only: the camera is switching; keep the connection and swap the track when ready. */
  localStreamPaused?: boolean;
}

export interface UseWebRTCResult {
  /** Laptop only: the phone's camera. */
  remoteStream: MediaStream | null;
  status: PeerStatus;
}

interface LinkState {
  socket: SignalingSocket | null;
  remoteStream: MediaStream | null;
  status: PeerStatus;
}

function sendSignal(socket: SignalingSocket, signal: OutgoingSignal) {
  if (signal.type === 'ice-candidate') {
    socket.emit('camera:ice-candidate', { candidate: signal.candidate });
  } else {
    socket.emit(signal.type === 'offer' ? 'camera:offer' : 'camera:answer', { sdp: signal.sdp });
  }
}

/**
 * The WebRTC half of the phone camera, shared by both pages:
 * - phone: when streaming and the laptop is present → offer the camera track;
 *   a camera switch replaces the track in place; stopping hangs up.
 * - laptop: answers each offer and exposes the received stream.
 * Signaling (who is present, message transport) comes from `useSignaling`.
 */
export function useWebRTC({
  role,
  signaling,
  localStream = null,
  localStreamPaused = false,
}: UseWebRTCOptions): UseWebRTCResult {
  const { socket, peerConnected, iceServers } = signaling;
  const [state, setState] = useState<LinkState>({
    socket: null,
    remoteStream: null,
    status: 'idle',
  });
  const linkRef = useRef<PeerLink | null>(null);
  /** The stream the phone's link was built with (to tell a camera switch from a re-render). */
  const sentStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef(iceServers);
  useEffect(() => {
    iceServersRef.current = iceServers;
  }, [iceServers]);

  // Signaling messages → link. Re-subscribes only when the socket itself changes.
  useEffect(() => {
    if (!socket) return;
    const update = (patch: Partial<LinkState>) =>
      setState((previous) => ({
        ...(previous.socket === socket ? previous : { remoteStream: null, status: 'idle' }),
        ...patch,
        socket,
      }));
    const closeLink = () => {
      linkRef.current?.close();
      linkRef.current = null;
      sentStreamRef.current = null;
    };
    const fail = () => update({ status: 'failed' });

    const onOffer = ({ sdp }: { sdp: string }) => {
      if (role !== 'host') return;
      // A new offer means the phone (re)started streaming: start over with a fresh connection.
      closeLink();
      const link = new PeerLink({
        iceServers: iceServersRef.current,
        onSignal: (signal) => sendSignal(socket, signal),
        onStatusChange: (status) => update({ status }),
        onRemoteStream: (remoteStream) => update({ remoteStream }),
      });
      linkRef.current = link;
      update({ status: 'connecting', remoteStream: null });
      link.acceptOffer(sdp).catch(fail);
    };
    const onAnswer = ({ sdp }: { sdp: string }) => {
      if (role === 'phone') linkRef.current?.acceptAnswer(sdp).catch(fail);
    };
    const onCandidate = ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      void linkRef.current?.addRemoteCandidate(candidate);
    };
    const onPeerGone = () => {
      closeLink();
      update({ status: 'idle', remoteStream: null });
    };

    socket.on('camera:offer', onOffer);
    socket.on('camera:answer', onAnswer);
    socket.on('camera:ice-candidate', onCandidate);
    socket.on('camera:hangup', onPeerGone);
    socket.on('camera:peer-left', onPeerGone);
    return () => {
      socket.off('camera:offer', onOffer);
      socket.off('camera:answer', onAnswer);
      socket.off('camera:ice-candidate', onCandidate);
      socket.off('camera:hangup', onPeerGone);
      socket.off('camera:peer-left', onPeerGone);
      closeLink();
    };
  }, [socket, role]);

  // Phone: start, switch or stop sending as the local camera changes.
  useEffect(() => {
    if (role !== 'phone' || !socket) return;
    const link = linkRef.current;

    if (localStream && peerConnected) {
      if (!link) {
        const next = new PeerLink({
          iceServers: iceServersRef.current,
          onSignal: (signal) => sendSignal(socket, signal),
          onStatusChange: (status) => setState((previous) => ({ ...previous, socket, status })),
        });
        linkRef.current = next;
        sentStreamRef.current = localStream;
        next
          .sendStream(localStream)
          .catch(() => setState((previous) => ({ ...previous, socket, status: 'failed' })));
      } else if (sentStreamRef.current !== localStream) {
        sentStreamRef.current = localStream;
        void link.replaceVideoTrack(localStream.getVideoTracks()[0] ?? null);
      }
      return;
    }

    if (!localStream && !localStreamPaused && link) {
      socket.emit('camera:hangup');
      link.close();
      linkRef.current = null;
      sentStreamRef.current = null;
    }
  }, [role, socket, localStream, localStreamPaused, peerConnected]);

  // Derived: nothing from a previous socket, and the phone shows "idle" when not streaming.
  if (!socket || state.socket !== socket) return { remoteStream: null, status: 'idle' };
  const phoneIdle = role === 'phone' && !localStream && !localStreamPaused;
  return {
    remoteStream: role === 'host' ? state.remoteStream : null,
    status: phoneIdle || !peerConnected ? 'idle' : state.status,
  };
}
