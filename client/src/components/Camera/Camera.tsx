import { Stack } from '@mui/material';
import type { ReactNode, RefObject } from 'react';
import type { UseCameraResult } from '../../hooks/useCamera';
import { shouldMirror } from '../../utils/camera.utils';
import { CameraControls } from './CameraControls';
import { CameraSelector } from './CameraSelector';
import { CameraView } from './CameraView';

interface CameraProps {
  camera: UseCameraResult;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Rendered on top of the video (face boxes, performance readout). */
  overlay?: ReactNode;
}

/**
 * Camera source picker (desktop) + preview + controls. Phones get a
 * "Switch camera" button rather than a device dropdown, since their labels
 * are often just "camera2 0" and front/rear is what users actually choose.
 */
export function Camera({ camera, videoRef, overlay }: CameraProps) {
  const isActive = camera.status === 'active';
  const isBusy = camera.status === 'requesting-permission' || camera.status === 'switching';
  const mirrored = shouldMirror(camera.facingMode);

  return (
    <Stack spacing={2}>
      {!camera.isMobile && (
        <CameraSelector
          cameras={camera.cameras}
          selectedCameraId={camera.selectedCameraId}
          disabled={isBusy}
          onSelect={(deviceId) => void camera.selectCamera(deviceId)}
        />
      )}
      <CameraView
        stream={camera.stream}
        isActive={isActive}
        isSwitching={camera.status === 'switching'}
        videoRef={videoRef}
        mirrored={mirrored}
        overlay={overlay}
      />
      <CameraControls
        status={camera.status}
        facingMode={camera.facingMode}
        canSwitchCamera={camera.canSwitchCamera}
        onStart={() => void camera.startCamera()}
        onStop={camera.stopCamera}
        onSwitch={() => void camera.switchCamera()}
      />
    </Stack>
  );
}
