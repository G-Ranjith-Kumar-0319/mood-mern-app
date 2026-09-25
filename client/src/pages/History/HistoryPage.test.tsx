import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/renderWithProviders';
import type { ExpressionDetectionRecord } from '../../types/api';
import { HistoryPage } from './HistoryPage';

const record = (id: string, expression: ExpressionDetectionRecord['expression']) => ({
  id,
  expression,
  confidence: 0.94,
  detectedAt: '2025-01-31T10:35:00.000Z',
  durationMs: id === 'a1' ? 4200 : null,
  source: 'camera',
  createdAt: '2025-01-31T10:35:05.000Z',
});

const feedPage = (items: ExpressionDetectionRecord[], nextCursor: string | null) => ({
  body: {
    success: true,
    data: items,
    pagination: { limit: 20, nextCursor, hasMore: nextCursor !== null },
  },
});

describe('HistoryPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders saved detections with label, confidence and duration', async () => {
    mockFetch(() => feedPage([record('a1', 'happy'), record('b2', 'surprised')], null));
    renderWithProviders(<HistoryPage />);

    const table = await screen.findByRole('table', { name: 'Detection history' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[1]!).getByText('Happy')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('94%')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('4s')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 detections (all)')).toBeInTheDocument();
  });

  it('loads the next page with the cursor from the previous one', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url) =>
      url.searchParams.get('cursor') === ''
        ? feedPage([record('a1', 'happy')], 'CURSOR-1')
        : feedPage([record('b2', 'sad')], null),
    );
    renderWithProviders(<HistoryPage />);

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Showing 2 detections (all)')).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toEqual([
      '/api/v1/expressions?limit=20&cursor=',
      '/api/v1/expressions?limit=20&cursor=CURSOR-1',
    ]);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('restarts the feed when the filter changes', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => feedPage([], null));
    renderWithProviders(<HistoryPage />);
    await screen.findByText(/No detections saved yet/);

    await user.click(screen.getByRole('combobox', { name: 'Expression' }));
    await user.click(await screen.findByRole('option', { name: 'Sad' }));

    await vi.waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe(
        '/api/v1/expressions?limit=20&expression=sad&cursor=',
      ),
    );
  });

  it('deletes a detection', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((_url, init) =>
      init?.method === 'DELETE'
        ? { body: { success: true, data: { id: 'a1' } } }
        : feedPage([record('a1', 'happy')], null),
    );
    renderWithProviders(<HistoryPage />);

    await user.click(await screen.findByRole('button', { name: /Delete Happy detection/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/expressions/a1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('shows a retryable error when the API fails', async () => {
    mockFetch(() => ({
      status: 500,
      body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    }));
    renderWithProviders(<HistoryPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load data');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
