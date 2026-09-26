import { Chip, type ChipProps } from '@mui/material';

export interface ConnectionStatusProps {
  label: string;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'error';
}

const TONE_COLOR: Record<ConnectionStatusProps['tone'], ChipProps['color']> = {
  neutral: 'default',
  progress: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** A status pill; the text carries the meaning, the colour only reinforces it. */
export function ConnectionStatus({ label, tone }: ConnectionStatusProps) {
  return (
    <Chip
      role="status"
      aria-live="polite"
      size="small"
      label={label}
      color={TONE_COLOR[tone]}
      variant={tone === 'neutral' ? 'outlined' : 'filled'}
    />
  );
}
