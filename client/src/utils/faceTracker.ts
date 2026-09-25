import type { DetectedFace, FaceBox, TrackedFace } from '../types/expression';
import { ExpressionSmoother, type SmoothingOptions } from './expressionSmoothing';

export interface FaceTrackerOptions {
  smoothing: SmoothingOptions;
  /** Minimum box overlap (intersection-over-union) to treat two detections as the same face. */
  minIou: number;
  /** A face not seen for this long is forgotten (and its smoother discarded). */
  maxMissingMs: number;
}

interface Track {
  id: number;
  box: FaceBox;
  smoother: ExpressionSmoother;
  expression: TrackedFace['expression'];
  lastSeen: number;
}

/** Intersection-over-union of two boxes: 0 = disjoint, 1 = identical. */
export function iou(a: FaceBox, b: FaceBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Follows faces across frames so each one keeps its own temporal smoothing.
 *
 * Matching is greedy by overlap: the highest-IoU (track, detection) pairs are
 * linked first. Unmatched detections start new tracks; tracks unseen for
 * `maxMissingMs` are dropped. The "primary" face (shown in the main panel and
 * used for saving) is sticky: it only changes when the current one disappears,
 * so two similar-sized faces cannot make the panel flip back and forth.
 */
export class FaceTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private primaryId: number | null = null;
  private readonly options: FaceTrackerOptions;
  private maxMissingMs: number;

  constructor(options: FaceTrackerOptions) {
    this.options = options;
    this.maxMissingMs = options.maxMissingMs;
  }

  /**
   * On slow devices frames arrive seconds apart; a face must be remembered for
   * longer than the gap between frames or it would be "new" (unsmoothed) every time.
   */
  adaptToFrameInterval(intervalMs: number): void {
    this.maxMissingMs = Math.max(this.options.maxMissingMs, intervalMs * 2.5);
  }

  /** Feeds one frame's detections; returns the faces visible in this frame, primary first. */
  update(faces: readonly DetectedFace[], now: number): TrackedFace[] {
    const pairs: Array<{ track: Track; face: DetectedFace; overlap: number }> = [];
    for (const track of this.tracks) {
      for (const face of faces) {
        const overlap = iou(track.box, face.box);
        if (overlap >= this.options.minIou) pairs.push({ track, face, overlap });
      }
    }
    pairs.sort((a, b) => b.overlap - a.overlap);

    const matchedTracks = new Set<Track>();
    const matchedFaces = new Set<DetectedFace>();
    for (const { track, face } of pairs) {
      if (matchedTracks.has(track) || matchedFaces.has(face)) continue;
      matchedTracks.add(track);
      matchedFaces.add(face);
      this.observe(track, face, now);
    }

    for (const face of faces) {
      if (matchedFaces.has(face)) continue;
      const track: Track = {
        id: this.nextId++,
        box: face.box,
        smoother: new ExpressionSmoother(this.options.smoothing),
        expression: null,
        lastSeen: now,
      };
      this.observe(track, face, now);
      this.tracks.push(track);
      matchedTracks.add(track);
    }

    this.tracks = this.tracks.filter((track) => now - track.lastSeen < this.maxMissingMs);
    const visible = this.tracks.filter((track) => matchedTracks.has(track));

    if (!visible.some((track) => track.id === this.primaryId)) {
      const largest = [...visible].sort(
        (a, b) => b.box.width * b.box.height - a.box.width * a.box.height,
      )[0];
      // Keep a briefly-missing primary (blink/turn) instead of switching immediately.
      const primaryStillTracked = this.tracks.some((track) => track.id === this.primaryId);
      if (!primaryStillTracked) this.primaryId = largest?.id ?? null;
    }

    return visible
      .sort((a, b) => Number(b.id === this.primaryId) - Number(a.id === this.primaryId))
      .map(({ id, box, expression }) => ({ id, box, expression }));
  }

  /** The primary face's latest smoothed expression, even if it was missed in the last frame. */
  primaryExpression(): TrackedFace['expression'] {
    return this.tracks.find((track) => track.id === this.primaryId)?.expression ?? null;
  }

  /** True while any face was seen recently (within the grace period). */
  hasRecentFace(): boolean {
    return this.tracks.length > 0;
  }

  reset(): void {
    this.tracks = [];
    this.primaryId = null;
  }

  private observe(track: Track, face: DetectedFace, now: number): void {
    track.box = face.box;
    track.lastSeen = now;
    track.expression = track.smoother.add(face.prediction);
  }
}
