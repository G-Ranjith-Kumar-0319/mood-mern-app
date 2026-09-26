import { Box } from '@mui/material';
import type { TrackedFace } from '../../types/expression';
import { getExpressionEmoji, getExpressionLabel } from '../../utils/expressionDisplay';

interface FaceOverlayProps {
  faces: TrackedFace[];
  sourceWidth: number;
  sourceHeight: number;
  /** Label every box with its expression (multi-face mode). */
  showLabels: boolean;
  /** Must match the video: true for the front camera, false for a rear camera. */
  mirrored: boolean;
}

const PRIMARY_COLOR = '#22c55e';
const SECONDARY_COLOR = '#38bdf8';
/** Label size relative to the video height, so it looks the same at any resolution. */
const LABEL_SCALE = 0.045;

/**
 * Draws face boxes (and optional labels) over the video.
 *
 * The SVG uses the video's intrinsic size as its viewBox with the same "cover"
 * scaling as the <video>, so model coordinates are used directly. When the video is
 * mirrored (front camera), rather than mirroring the SVG (which would also mirror
 * the label text), each box's x position is mirrored instead.
 */
export function FaceOverlay({
  faces,
  sourceWidth,
  sourceHeight,
  showLabels,
  mirrored,
}: FaceOverlayProps) {
  if (faces.length === 0 || sourceWidth === 0 || sourceHeight === 0) return null;
  const fontSize = Math.round(sourceHeight * LABEL_SCALE);

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${sourceWidth} ${sourceHeight}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      data-testid="face-overlay"
      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {faces.map((face, index) => {
        const x = mirrored ? sourceWidth - face.box.x - face.box.width : face.box.x;
        const color = index === 0 ? PRIMARY_COLOR : SECONDARY_COLOR;
        const label = face.expression
          ? `${getExpressionEmoji(face.expression.expression)} ${getExpressionLabel(face.expression.expression)}`
          : '…';
        const labelY = Math.max(fontSize * 1.3, face.box.y - fontSize * 0.4);
        return (
          <g key={face.id} data-testid="face-box">
            <rect
              x={x}
              y={face.box.y}
              width={face.box.width}
              height={face.box.height}
              rx={12}
              fill="none"
              stroke={color}
              strokeWidth={4}
            />
            {showLabels && (
              <>
                <rect
                  x={x}
                  y={labelY - fontSize * 1.15}
                  width={Math.max(face.box.width, label.length * fontSize * 0.62)}
                  height={fontSize * 1.5}
                  rx={6}
                  fill="rgba(0,0,0,0.6)"
                />
                <text
                  x={x + fontSize * 0.3}
                  y={labelY}
                  fill="#fff"
                  fontSize={fontSize}
                  fontWeight={600}
                >
                  {label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </Box>
  );
}
