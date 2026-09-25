import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpressionDetector } from '../../services/expressionDetector';
import { createFakeStream, mockGetUserMedia, removeMediaDevices } from '../../test/mediaMocks';
import { mockFetch, renderWithProviders } from '../../test/renderWithProviders';
import { HomePage } from './HomePage';

const loadDetector = vi.fn<() => Promise<ExpressionDetector>>();
vi.mock('../../services/detectorFactory', () => ({
  loadDetector: () => loadDetector(),
}));

describe('HomePage', () => {
  beforeEach(() => {
    // Detector that never finds a face — enough to exercise the camera/UI states.
    loadDetector.mockResolvedValue({
      kind: 'main-thread',
      tfBackend: 'cpu',
      analyze: () =>
        Promise.resolve({ faces: [], sourceWidth: 640, sourceHeight: 480, inferenceMs: 20 }),
      dispose: () => undefined,
    });
    mockFetch((url) => {
      if (url.pathname === '/api/v1/auth/me')
        return { body: { success: true, data: { user: null } } };
      return {
        body: {
          success: true,
          data: [],
          pagination: { page: 1, limit: 5, total: 0, totalPages: 0 },
        },
      };
    });
  });

  afterEach(() => {
    removeMediaDevices();
    vi.unstubAllGlobals();
  });

  it('starts in the initial state with the disclaimer', async () => {
    renderWithProviders(<HomePage />);
    expect(
      screen.getByRole('heading', { name: 'AI Facial Expression Detector' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not determine or diagnose/)).toBeInTheDocument();
    expect(screen.getByText('Camera status:')).toHaveTextContent('Camera status: Off');
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeDisabled();
    expect(await screen.findByText('Nothing saved yet.')).toBeInTheDocument();
  });

  it('starts and stops the camera, showing the active indicator', async () => {
    const user = userEvent.setup();
    const { stream, track } = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(stream));
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(screen.getByText('Camera status:')).toHaveTextContent('On');

    await user.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByText('Camera on')).not.toBeInTheDocument();
  });

  it('explains how to fix a denied camera permission', async () => {
    const user = userEvent.setup();
    mockGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Start camera' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Camera permission needed')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('disables "Save now" until a confident expression is detected', async () => {
    renderWithProviders(<HomePage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled());
  });
});

describe('HomePage detection settings', () => {
  it('persists a changed setting on this device', async () => {
    const user = userEvent.setup();
    mockFetch((url) =>
      url.pathname === '/api/v1/auth/me'
        ? { body: { success: true, data: { user: null } } }
        : {
            body: {
              success: true,
              data: [],
              pagination: { page: 1, limit: 5, total: 0, totalPages: 0 },
            },
          },
    );
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole('button', { name: /Detection settings/ }));
    await user.click(screen.getByLabelText('Detect multiple faces'));

    expect(localStorage.getItem('expression-detector:settings:v1')).toContain('"multiFace":true');
    localStorage.clear();
    vi.unstubAllGlobals();
  });
});
