import type { ApiErrorBody, ApiSuccess } from '../types/api';
import { NetworkError } from '../utils/errors';

/**
 * Same-origin base path. Vite (dev) and Nginx (Docker/production) forward it to
 * the API, so the browser never needs CORS and auth cookies stay first-party.
 */
export const API_BASE_URL = '/api/v1';

/** An error response from the API, carrying its stable `code`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type QueryValue = string | number | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Internal: prevents an endless refresh → retry loop. */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    // Only undefined means "absent"; an empty string is meaningful (e.g. `cursor=` = first page).
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_BASE_URL}${path}${search ? `?${search}` : ''}`;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value;
}

// Several requests may fail with an expired token at once; share a single refresh call.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(buildUrl('/auth/refresh'), {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * Minimal typed fetch wrapper:
 * - JSON in/out using the API's `{ success, data }` envelope
 * - typed ApiError / NetworkError
 * - on an expired access token (401 INVALID_TOKEN), refreshes once and retries
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiSuccess<T>> {
  const { method = 'GET', body, query, signal, skipRefresh = false } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError({ cause });
  }

  const payload: unknown = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  if (response.ok) return payload as ApiSuccess<T>;

  const code = isErrorBody(payload) ? payload.error.code : 'HTTP_ERROR';
  const message = isErrorBody(payload)
    ? payload.error.message
    : `Request failed (${response.status})`;

  if (response.status === 401 && code === 'INVALID_TOKEN' && !skipRefresh) {
    // Whether or not refresh succeeds, retry once: a failed refresh clears the
    // cookies, so the retry runs as an anonymous request instead of failing.
    await refreshSession();
    return apiRequest<T>(path, { ...options, skipRefresh: true });
  }

  throw new ApiError(response.status, code, message);
}

/** User-facing message for any error thrown by the API layer. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Something went wrong. Please try again.';
}
