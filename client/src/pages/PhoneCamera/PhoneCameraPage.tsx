import { Alert, Box, Container, Stack, Typography } from '@mui/material';
import { useMemo, useRef } from 'react';
import { useLocation, useParams } from 'react-router';
import { Camera } from '../../components/Camera/Camera';
import { CameraPermissionError } from '../../components/Camera/CameraPermissionError';
import {
  ConnectionStatus,
  type ConnectionStatusProps,
} from '../../components/ConnectionStatus/ConnectionStatus';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { useCamera } from '../../hooks/useCamera';
import { useSignaling, type SignalingState } from '../../hooks/useSignaling';
import { useWebRTC } from '../../hooks/useWebRTC';
import type { PeerStatus, SignalingCredentials } from '../../types/remoteCamera';
import { isWebRtcSupported } from '../../utils/peerStatus';
import { remoteCameraErrors, toSignalingError } from '../../utils/errors';

/** The phone token travels in the URL fragment (#token=…), which is never sent to a server. */
function readCredentials(sessionId: string | undefined, hash: string): SignalingCredentials | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return sessionId && token ? { sessionId, token } : null;
}

function describeLink(signaling: SignalingState, peer: PeerStatus): ConnectionStatusProps {
  if (signaling.status === 'error') return { label: 'Connection failed', tone: 'error' };
  if (signaling.status !== 'joined') return { label: 'Connecting…', tone: 'progress' };
  if (!signaling.peerConnected) return { label: 'Waiting for laptop…', tone: 'progress' };
  switch (peer) {
    case 'connected':
      return { label: 'Streaming to laptop', tone: 'success' };
    case 'connecting':
      return { label: 'Connecting…', tone: 'progress' };
    case 'disconnected':
      return { label: 'Reconnecting…', tone: 'warning' };
    case 'failed':
      return { label: 'Connection failed', tone: 'error' };
    case 'idle':
      return { label: 'Connected to laptop', tone: 'success' };
  }
}

/**
 * Opened on the phone from the laptop's QR code. Streams the phone camera to
 * the laptop over WebRTC once the user presses Start camera; nothing is
 * recorded, uploaded or analysed here.
 */
export function PhoneCameraPage() {
  const { sessionId } = useParams();
  const { hash } = useLocation();
  const credentials = useMemo(() => readCredentials(sessionId, hash), [sessionId, hash]);
  const supported = isWebRtcSupported();

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          <span aria-hidden>📱 </span>Mood Camera
        </Typography>
        {!credentials ? (
          <ErrorState
            title="Invalid camera link"
            message={toSignalingError('SESSION_INVALID').message}
          />
        ) : !supported ? (
          <ErrorState
            title="Browser not supported"
            message={remoteCameraErrors.notSupported().message}
          />
        ) : (
          <PhoneCameraStreamer credentials={credentials} />
        )}
      </Stack>
    </Container>
  );
}

function PhoneCameraStreamer({ credentials }: { credentials: SignalingCredentials }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Pointed at the person being analysed, so the rear camera is the natural default.
  const camera = useCamera({ preferredFacingMode: 'environment' });
  const signaling = useSignaling(credentials);
  const webrtc = useWebRTC({
    role: 'phone',
    signaling,
    localStream: camera.stream,
    localStreamPaused: camera.status === 'switching',
  });
  const link = describeLink(signaling, webrtc.status);
  const laptopLeft = signaling.status === 'joined' && signaling.peerLeft;

  return (
    <>
      {signaling.error && (
        <ErrorState title="Cannot connect to the laptop" message={signaling.error.message} />
      )}
      {camera.status === 'error' && camera.error && (
        <CameraPermissionError error={camera.error} onRetry={() => void camera.startCamera()} />
      )}
      {webrtc.status === 'failed' && (
        <Alert severity="error">{remoteCameraErrors.connectionFailed().message}</Alert>
      )}
      {laptopLeft && (
        <Alert severity="info">{remoteCameraErrors.laptopDisconnected().message}</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" component="span">
          Status:
        </Typography>
        <ConnectionStatus {...link} />
      </Box>

      <Camera camera={camera} videoRef={videoRef} />

      <Typography variant="caption" color="text.secondary">
        Video goes directly to the laptop that showed the QR code (WebRTC, encrypted). It is not
        recorded or stored, and the microphone is never used.
      </Typography>
    </>
  );
}
