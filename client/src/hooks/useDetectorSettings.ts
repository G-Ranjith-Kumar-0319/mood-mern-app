import { useCallback, useState } from 'react';

export const INPUT_SIZE_OPTIONS = [
  { value: 160, label: 'Fastest (160)' },
  { value: 224, label: 'Balanced (224)' },
  { value: 320, label: 'Accurate (320)' },
  { value: 416, label: 'Most accurate (416)' },
] as const;

export const RATE_OPTIONS = [5, 10, 15] as const;

export interface DetectorSettings {
  /** TinyFaceDetector input size; larger finds smaller/further faces but costs more. */
  inputSize: number;
  /** Target inferences per second. */
  inferencesPerSecond: number;
  /** Detect and label every face instead of only the most confident one. */
  multiFace: boolean;
  /** Run the model in a Web Worker so the page stays responsive. */
  useWorker: boolean;
  /** Show the live performance readout (FPS / latency). */
  showPerformance: boolean;
}

export const DEFAULT_SETTINGS: DetectorSettings = {
  inputSize: 224,
  inferencesPerSecond: 10,
  multiFace: false,
  useWorker: true,
  showPerformance: false,
};

const STORAGE_KEY = 'expression-detector:settings:v1';

function isValid(value: unknown): value is Partial<DetectorSettings> {
  return typeof value === 'object' && value !== null;
}

/** Reads settings, ignoring corrupt or unknown values (and blocked storage). */
export function readSettings(): DetectorSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!isValid(stored)) return DEFAULT_SETTINGS;
    return {
      inputSize: INPUT_SIZE_OPTIONS.some((o) => o.value === stored.inputSize)
        ? (stored.inputSize as number)
        : DEFAULT_SETTINGS.inputSize,
      inferencesPerSecond: RATE_OPTIONS.some((r) => r === stored.inferencesPerSecond)
        ? (stored.inferencesPerSecond as number)
        : DEFAULT_SETTINGS.inferencesPerSecond,
      multiFace:
        typeof stored.multiFace === 'boolean' ? stored.multiFace : DEFAULT_SETTINGS.multiFace,
      useWorker:
        typeof stored.useWorker === 'boolean' ? stored.useWorker : DEFAULT_SETTINGS.useWorker,
      showPerformance:
        typeof stored.showPerformance === 'boolean'
          ? stored.showPerformance
          : DEFAULT_SETTINGS.showPerformance,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Per-device detector preferences. These are UI conveniences, so browser
 * storage is appropriate: they never need to reach the server or other devices.
 */
export function useDetectorSettings() {
  const [settings, setSettings] = useState<DetectorSettings>(readSettings);

  const update = useCallback((changes: Partial<DetectorSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...changes };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode, blocked site data); settings still apply for this visit.
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => update(DEFAULT_SETTINGS), [update]);

  return { settings, update, reset };
}
