# 0004 — Persist stable expression segments, opt-in

**Status:** accepted

## Context

Inference produces about 10 predictions per second. Storing them all would mean about 10 HTTP requests
and 10 documents per second per user: expensive and not meaningful.

## Decision

- Nothing is saved unless the user turns on **Auto-save** or presses **Save now**.
- Auto-save records **segments**: continuous runs of one confident, stable expression. A segment is
  saved when it ends (expression change, face lost, low confidence, camera stopped, auto-save
  switched off, page left) if it lasted ≥ 2 s. Segments longer than 60 s are saved and restarted.
- Each document stores `detectedAt` (start), `durationMs` and mean `confidence`.
- Both thresholds are configurable (`VITE_PERSIST_MIN_SEGMENT_MS`, `VITE_PERSIST_MAX_SEGMENT_MS`).

## Consequences

- Write volume is bounded by human behaviour, not frame rate (≤ 1 write per 2 s, usually far fewer).
- History reads naturally ("Happy for 12 s at 10:35").
- An ongoing segment appears in history only once it ends or reaches 60 s.
