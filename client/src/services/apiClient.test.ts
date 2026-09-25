import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '../test/renderWithProviders';
import { NetworkError } from '../utils/errors';
import { ApiError, apiRequest } from './apiClient';

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the URL (skipping undefined params, keeping empty strings)', async () => {
    const fetchMock = mockFetch(() => ({ body: { success: true, data: [1] } }));
    const result = await apiRequest<number[]>('/expressions', {
      query: { page: 2, expression: undefined, cursor: '' },
    });
    expect(result.data).toEqual([1]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/expressions?page=2&cursor=');
  });

  it('throws a typed ApiError with the server code', async () => {
    mockFetch(() => ({
      status: 400,
      body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid expression' } },
    }));
    const error = await apiRequest('/expressions').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid expression',
    });
  });

  it('throws NetworkError when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(apiRequest('/expressions')).rejects.toBeInstanceOf(NetworkError);
  });

  it('refreshes an expired session once and retries the request', async () => {
    let expressionCalls = 0;
    const fetchMock = mockFetch((url) => {
      if (url.pathname === '/api/v1/auth/refresh') return { body: { success: true, data: {} } };
      expressionCalls += 1;
      return expressionCalls === 1
        ? { status: 401, body: { success: false, error: { code: 'INVALID_TOKEN', message: 'x' } } }
        : { body: { success: true, data: 'ok' } };
    });

    const result = await apiRequest<string>('/expressions');

    expect(result.data).toBe('ok');
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/expressions',
      '/api/v1/auth/refresh',
      '/api/v1/expressions',
    ]);
  });

  it('does not loop when the retry is still unauthorized', async () => {
    const fetchMock = mockFetch(() => ({
      status: 401,
      body: { success: false, error: { code: 'INVALID_TOKEN', message: 'expired' } },
    }));
    await expect(apiRequest('/expressions')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // request, refresh, single retry
  });
});
