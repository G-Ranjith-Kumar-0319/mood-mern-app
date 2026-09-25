import { Chip } from '@mui/material';
import type { ExpressionDetector } from '../../services/expressionDetector';
import type { PerformanceStats } from '../../utils/performanceMeter';

interface PerformanceReadoutProps {
  stats: PerformanceStats | null;
  backend: ExpressionDetector['kind'] | null;
  tfBackend: string | null;
}

const BACKEND_LABEL: Record<ExpressionDetector['kind'], string> = {
  worker: 'Web Worker',
  'main-thread': 'main thread',
};

/** Live throughput/latency badge over the video, e.g. "9.8/s · 41 ms · Web Worker". */
export function PerformanceReadout({ stats, backend, tfBackend }: PerformanceReadoutProps) {
  if (!stats) return null;
  const parts = [
    `${stats.inferencesPerSecond.toFixed(1)}/s`,
    `${Math.round(stats.averageInferenceMs)} ms`,
    backend ? BACKEND_LABEL[backend] : null,
    tfBackend,
  ].filter(Boolean);

  return (
    <Chip
      size="small"
      label={parts.join(' · ')}
      aria-label={`Performance: ${stats.inferencesPerSecond.toFixed(1)} analyses per second, ${Math.round(stats.averageInferenceMs)} milliseconds per analysis${backend ? `, running on the ${BACKEND_LABEL[backend]}` : ''}`}
      sx={{
        position: 'absolute',
        top: 12,
        right: 12,
        bgcolor: 'rgba(0,0,0,0.6)',
        color: 'common.white',
        fontVariantNumeric: 'tabular-nums',
      }}
    />
  );
}
