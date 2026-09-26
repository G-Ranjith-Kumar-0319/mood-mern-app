import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { Box, Chip, CircularProgress, Typography } from '@mui/material';
import { useEffect, type ReactNode, type RefObject } from 'react';

interface CameraViewProps {
  /** Local camera or a phone's WebRTC stream — the <video> (and the detector) don't care which. */
  stream: MediaStream | null;
  isActive: boolean;
  isSwitching: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Mirror like a selfie camera (front camera only — a rear camera is shown as-is). */
  mirrored: boolean;
  /** Rendered on top of the video (e.g. the face bounding box). */
  overlay?: ReactNode;
}

/**
 * The video surface with a camera-active badge. `playsInline` stops iOS Safari
 * from opening a fullscreen player; `muted` allows autoplay.
 */
export function CameraView({
  stream,
  isActive,
  isSwitching,
  videoRef,
  mirrored,
  overlay,
}: CameraViewProps) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // play() can reject if the element is detached mid-call; the next stream change retries.
    if (stream) video.play().catch(() => undefined);
  }, [stream, videoRef]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        bgcolor: 'grey.900',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        component="video"
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Live camera preview"
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mirrored ? 'scaleX(-1)' : 'none',
          display: isActive ? 'block' : 'none',
        }}
      />
      {isActive && overlay}

      {isActive ? (
        <Chip
          role="status"
          label="Camera on"
          color="error"
          size="small"
          icon={
            <Box
              component="span"
              sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'common.white', ml: 1 }}
            />
          }
          sx={{ position: 'absolute', top: 12, left: 12, fontWeight: 600 }}
        />
      ) : (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            color: 'grey.400',
          }}
        >
          {isSwitching ? (
            <CircularProgress color="inherit" aria-hidden />
          ) : (
            <VideocamOffOutlinedIcon fontSize="large" aria-hidden />
          )}
          <Typography>{isSwitching ? 'Switching camera…' : 'Camera is off'}</Typography>
        </Box>
      )}
    </Box>
  );
}
