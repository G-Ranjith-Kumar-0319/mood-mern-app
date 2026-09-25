import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PERSISTENCE_CONFIG } from '../constants/persistence';
import { expressionApi } from '../services/expressionApi';
import type { SmoothedExpression } from '../types/expression';
import { DetectionSegmentTracker, type CompletedSegment } from '../utils/detectionSegments';
import { expressionKeys } from './useExpressionHistory';

export interface UseAutoSaveOptions {
  enabled: boolean;
  /** The current *confident* stable expression, or null (no face / low confidence / camera off). */
  current: SmoothedExpression | null;
}

export interface UseAutoSaveResult {
  savedCount: number;
  lastError: unknown;
}

/**
 * Persists stable expression segments (see DetectionSegmentTracker) while
 * auto-save is enabled. Uses the API directly rather than useMutation so the
 * final segment is still saved when the page unmounts.
 */
export function useAutoSave({ enabled, current }: UseAutoSaveOptions): UseAutoSaveResult {
  const queryClient = useQueryClient();
  const trackerRef = useRef(new DetectionSegmentTracker(PERSISTENCE_CONFIG));
  const [savedCount, setSavedCount] = useState(0);
  const [lastError, setLastError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  const persist = useCallback(
    (segment: CompletedSegment | null) => {
      if (!segment) return;
      expressionApi
        .save({
          expression: segment.expression,
          confidence: segment.confidence,
          detectedAt: segment.detectedAt.toISOString(),
          durationMs: segment.durationMs,
        })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: expressionKeys.all });
          if (!mountedRef.current) return;
          setSavedCount((count) => count + 1);
          setLastError(null);
        })
        .catch((error: unknown) => {
          if (mountedRef.current) setLastError(error);
        });
    },
    [queryClient],
  );

  const expression = current?.expression;
  const confidence = current?.confidence;
  const updatedAt = current?.updatedAt;

  // Feed every new smoothed result to the tracker.
  useEffect(() => {
    if (!enabled) return;
    const sample =
      expression !== undefined && confidence !== undefined ? { expression, confidence } : null;
    persist(trackerRef.current.update(sample, Date.now()));
  }, [enabled, expression, confidence, updatedAt, persist]);

  // Save the open segment when auto-save is switched off or the page unmounts.
  useEffect(() => {
    if (!enabled) return;
    const tracker = trackerRef.current;
    return () => persist(tracker.flush(Date.now()));
  }, [enabled, persist]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { savedCount, lastError };
}
