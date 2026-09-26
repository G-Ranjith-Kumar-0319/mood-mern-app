import LinkOffIcon from '@mui/icons-material/LinkOff';
import QrCodeIcon from '@mui/icons-material/QrCode2';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode, RefObject } from 'react';
import type { PhoneCameraStatus, UsePhoneCameraResult } from '../../hooks/usePhoneCamera';
import { formatDateTime } from '../../utils/format';
import { CameraView } from '../Camera/CameraView';
import { ConnectionStatus, type ConnectionStatusProps } from '../ConnectionStatus/ConnectionStatus';
import { QRCodeDisplay } from '../QRCodeDisplay/QRCodeDisplay';

const STATUS: Record<PhoneCameraStatus, ConnectionStatusProps> = {
  off: { label: 'Off', tone: 'neutral' },
  'creating-session': { label: 'Preparing…', tone: 'progress' },
  'waiting-for-phone': { label: 'Waiting for phone…', tone: 'progress' },
  'phone-connected': { label: 'Phone connected', tone: 'success' },
  connecting: { label: 'Connecting…', tone: 'progress' },
  connected: { label: 'Connected', tone: 'success' },
  reconnecting: { label: 'Reconnecting…', tone: 'warning' },
  'phone-disconnected': { label: 'Disconnected', tone: 'warning' },
  error: { label: 'Connection failed', tone: 'error' },
};

const SHOWS_VIDEO: ReadonlySet<PhoneCameraStatus> = new Set(['connected', 'reconnecting']);

function isLoopbackUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

interface PhoneCameraConnectorProps {
  phone: UsePhoneCameraResult;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlay?: ReactNode;
}

/**
 * Laptop side of the phone camera: QR code + link while pairing, then the
 * phone's live video in the same <video> the detector reads.
 */
export function PhoneCameraConnector({ phone, videoRef, overlay }: PhoneCameraConnectorProps) {
  const { status, session } = phone;
  const showsVideo = SHOWS_VIDEO.has(status);

  return (
    <Stack spacing={2}>
      {showsVideo ? (
        <CameraView
          stream={phone.remoteStream}
          isActive={phone.remoteStream !== null}
          isSwitching={false}
          videoRef={videoRef}
          // A remote camera is shown as it sees the world, not as a mirror.
          mirrored={false}
          overlay={overlay}
        />
      ) : (
        <PairingPanel phone={phone} />
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="body2" color="text.secondary" component="span">
          Phone camera:
        </Typography>
        <ConnectionStatus {...STATUS[status]} />
        {session && (
          <>
            <Button size="small" startIcon={<QrCodeIcon />} onClick={phone.regenerate}>
              New QR code
            </Button>
            <Button size="small" startIcon={<LinkOffIcon />} onClick={phone.stop}>
              Disconnect phone
            </Button>
          </>
        )}
      </Stack>
    </Stack>
  );
}

function PairingPanel({ phone }: { phone: UsePhoneCameraResult }) {
  const { status, session } = phone;

  if (!session || status === 'error') {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        {status === 'creating-session' ? (
          <CircularProgress aria-label="Creating a pairing session" />
        ) : (
          <Button variant="contained" startIcon={<QrCodeIcon />} onClick={phone.regenerate}>
            {status === 'error' ? 'Generate a new QR code' : 'Show QR code'}
          </Button>
        )}
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={3}
        sx={{ alignItems: { xs: 'center', sm: 'flex-start' } }}
      >
        <QRCodeDisplay value={session.cameraUrl} label="QR code that opens the phone camera page" />
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">
            Connect phone camera
          </Typography>
          <Typography variant="body2">
            Scan this QR code with your phone, then press <strong>Start camera</strong> on the
            phone. Both devices should be on the same Wi-Fi.
          </Typography>
          <Box>
            <Typography variant="caption" color="text.secondary" component="p">
              Or open this link on the phone:
            </Typography>
            <Link
              href={session.cameraUrl}
              target="_blank"
              rel="noreferrer"
              variant="body2"
              sx={{ wordBreak: 'break-all' }}
              data-testid="phone-camera-link"
            >
              {session.cameraUrl}
            </Link>
          </Box>
          <Typography variant="caption" color="text.secondary">
            The code works until {formatDateTime(session.expiresAt)}. Video goes directly from the
            phone to this browser and is never uploaded.
          </Typography>
          {isLoopbackUrl(session.cameraUrl) && (
            <Alert severity="warning">
              This link points to localhost, which a phone cannot open. Set PHONE_CAMERA_URL (or
              APP_URL) to an address the phone can reach, e.g. https://192.168.1.100.
            </Alert>
          )}
          {status === 'phone-connected' && (
            <Alert severity="success">Phone connected. Press Start camera on the phone.</Alert>
          )}
          {status === 'phone-disconnected' && (
            <Alert severity="warning">Phone disconnected. Please reconnect your phone.</Alert>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
