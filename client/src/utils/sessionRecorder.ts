import { SUPPORTED_EXPRESSIONS, type Expression } from '../constants/expressions';

export interface SessionSummary {
  /** Total camera time (ms). */
  durationMs: number;
  /** Time with a confident expression on screen (ms). */
  detectedMs: number;
  /** Per expression, most time first; only expressions that appeared. */
  byExpression: Array<{ expression: Expression; ms: number; share: number }>;
  dominant: Expression | null;
}

/**
 * Accumulates how long each stable expression was shown during one camera
 * session. Time is attributed to the state that was current *before* each
 * update, so the result is exact regardless of how often `update` is called.
 */
export class SessionRecorder {
  private readonly startedAt: number;
  private lastAt: number;
  private current: Expression | null = null;
  private readonly totals = new Map<Expression, number>();

  constructor(now: number) {
    this.startedAt = now;
    this.lastAt = now;
  }

  update(expression: Expression | null, now: number): void {
    this.accumulate(now);
    this.current = expression;
  }

  finish(now: number): SessionSummary {
    this.accumulate(now);
    const detectedMs = [...this.totals.values()].reduce((sum, ms) => sum + ms, 0);
    const byExpression = SUPPORTED_EXPRESSIONS.filter((e) => (this.totals.get(e) ?? 0) > 0)
      .map((expression) => {
        const ms = this.totals.get(expression) ?? 0;
        return { expression, ms, share: detectedMs > 0 ? ms / detectedMs : 0 };
      })
      .sort((a, b) => b.ms - a.ms);
    return {
      durationMs: now - this.startedAt,
      detectedMs,
      byExpression,
      dominant: byExpression[0]?.expression ?? null,
    };
  }

  private accumulate(now: number): void {
    if (this.current) {
      this.totals.set(this.current, (this.totals.get(this.current) ?? 0) + (now - this.lastAt));
    }
    this.lastAt = now;
  }
}
