import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpressionDetector } from '../../services/expressionDetector';
import {
  createFakeStream,
  mockGetUserMedia,
  mockMediaDevices,
  removeMediaDevices,
} from '../../test/mediaMocks';
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

  it('lets desktop users pick a camera source and switches the running camera', async () => {
    const user = userEvent.setup();
    const media = mockMediaDevices(
      (constraints) => {
        const video = constraints.video as MediaTrackConstraints;
        const requested = (video.deviceId as ConstrainDOMStringParameters | undefined)?.exact;
        const deviceId = typeof requested === 'string' ? requested : 'cam-a';
        return Promise.resolve(createFakeStream({ deviceId }).stream);
      },
      [
        { deviceId: 'cam-a', label: 'Integrated Webcam' },
        { deviceId: 'cam-b', label: 'USB Webcam' },
      ],
    );
    renderWithProviders(<HomePage />);

    const selector = await screen.findByRole('combobox', { name: 'Camera source' });
    expect(selector).toHaveTextContent('Integrated Webcam');
    await user.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(await screen.findByText('Camera on')).toBeInTheDocument();

    await user.click(selector);
    await user.click(screen.getByRole('option', { name: 'USB Webcam' }));

    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Camera source' })).toHaveTextContent('USB Webcam');
    expect(screen.getByRole('button', { name: 'Switch camera' })).toBeEnabled();
  });

  it('explains a disconnected camera', async () => {
    const user = userEvent.setup();
    const { stream, track } = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(stream));
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Start camera' }));
    await screen.findByText('Camera on');
    act(() => track.end());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Camera disconnected')).toBeInTheDocument();
    expect(within(alert).getByText(/Please select another camera/)).toBeInTheDocument();
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
