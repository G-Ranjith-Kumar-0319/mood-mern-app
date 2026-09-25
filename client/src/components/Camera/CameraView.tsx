import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import { Box, Chip, Typography } from '@mui/material';
import { useEffect, type ReactNode, type RefObject } from 'react';

interface CameraViewProps {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Rendered on top of the video (e.g. the face bounding box). */
  overlay?: ReactNode;
}

/** Displays the webcam stream (mirrored, like a selfie camera) with a camera-active badge. */
export function CameraView({ stream, videoRef, overlay }: CameraViewProps) {
  const isActive = stream !== null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      // play() can reject if the element is detached mid-call; the next render retries.
      video.play().catch(() => undefined);
    }
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
          transform: 'scaleX(-1)',
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
          <VideocamOffOutlinedIcon fontSize="large" aria-hidden />
          <Typography>Camera is off</Typography>
        </Box>
      )}
    </Box>
  );
}
