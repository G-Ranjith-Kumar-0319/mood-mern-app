import type { Response } from 'express';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Cursor mode: no page numbers or total (counting is what makes deep pages slow). */
export interface CursorPagination {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/** `{ success: true, data }` — the single success envelope used by every endpoint. */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: Pagination | CursorPagination,
): void {
  res.status(200).json({ success: true, data, pagination });
}
