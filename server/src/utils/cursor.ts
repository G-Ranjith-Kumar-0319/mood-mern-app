import { Types } from 'mongoose';

/** Position in the history feed: the last item the client has already seen. */
export interface CursorPosition {
  detectedAt: Date;
  id: Types.ObjectId;
}

/**
 * Opaque cursors: clients pass them back unchanged and must not rely on their
 * format. base64url(JSON) keeps them URL-safe and easy to debug.
 */
export function encodeCursor(position: CursorPosition): string {
  const json = JSON.stringify({ d: position.detectedAt.toISOString(), i: position.id.toString() });
  return Buffer.from(json).toString('base64url');
}

/** Returns null for anything that is not a cursor this API produced. */
export function decodeCursor(cursor: string): CursorPosition | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { d, i } = parsed as Record<string, unknown>;
    if (typeof d !== 'string' || typeof i !== 'string' || !Types.ObjectId.isValid(i)) return null;
    const detectedAt = new Date(d);
    if (Number.isNaN(detectedAt.getTime())) return null;
    return { detectedAt, id: new Types.ObjectId(i) };
  } catch {
    return null;
  }
}
