import { Box } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  value: string;
  /** Accessible description; the link is also shown as text next to the code. */
  label: string;
  size?: number;
}

const DEFAULT_SIZE = 208;

/** A QR code as SVG, on white so phones scan it in dark mode too. */
export function QRCodeDisplay({ value, label, size = DEFAULT_SIZE }: QRCodeDisplayProps) {
  return (
    <Box
      role="img"
      aria-label={label}
      data-testid="qr-code"
      sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1, lineHeight: 0, display: 'inline-block' }}
    >
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} aria-hidden />
    </Box>
  );
}
