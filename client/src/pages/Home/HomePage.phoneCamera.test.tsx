import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpressionDetector } from '../../services/expressionDetector';
import { connectSignaling } from '../../services/signaling';
import { createFakeStream, mockGetUserMedia, removeMediaDevices } from '../../test/mediaMocks';
import { mockFetch, renderWithProviders } from '../../test/renderWithProviders';
import {
  FakePeerConnection,
  FakeSocket,
  flushPromises,
  installFakeWebRtc,
} from '../../test/webrtcMocks';
import type { CameraSession } from '../../types/remoteCamera';
import { HomePage } from './HomePage';

vi.mock('../../services/signaling', () => ({ connectSignaling: vi.fn() }));
const loadDetector = vi.fn<() => Promise<ExpressionDetector>>();
vi.mock('../../services/detectorFactory', () => ({ loadDetector: () => loadDetector() }));

const CAMERA_URL = 'https://192.168.1.100:5173/camera/session-1#token=phone-token';

function sessionExpiringIn(ms: number): CameraSession {
  return {
    sessionId: 'session-1',
    hostToken: 'host-token',
    phoneToken: 'phone-token',
    cameraUrl: CAMERA_URL,
    expiresAt: new Date(Date.now() + ms).toISOString(),
    iceServers: [],
  };
}

let socket: FakeSocket;
let session: CameraSession;

async function serverSays(event: string, ...args: unknown[]) {
  await act(async () => {
    socket.receive(event, ...args);
    await flushPromises();
  });
}

describe('HomePage with a phone camera', () => {
  beforeEach(() => {
    sessionStorage.clear();
    installFakeWebRtc();
    socket = new FakeSocket();
    vi.mocked(connectSignaling).mockReturnValue(socket.asSocket);
    session = sessionExpiringIn(10 * 60 * 1000);
    loadDetector.mockResolvedValue({
      kind: 'main-thread',
      tfBackend: 'cpu',
      analyze: () =>
        Promise.resolve({ faces: [], sourceWidth: 640, sourceHeight: 480, inferenceMs: 20 }),
      dispose: () => undefined,
    });
    mockFetch((url, init) => {
      if (url.pathname === '/api/v1/camera/sessions' && init?.method === 'POST') {
        return { status: 201, body: { success: true, data: session } };
      }
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

  it('shows a QR code and link, then the phone connection status', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Phone camera' }));

    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByTestId('phone-camera-link')).toHaveTextContent(CAMERA_URL);
    expect(connectSignaling).toHaveBeenCalledWith({ sessionId: 'session-1', token: 'host-token' });
    expect(screen.getByTestId('expression-title')).toHaveTextContent('Waiting for phone camera…');

    await serverSays('camera:joined', { role: 'host', peerConnected: false, iceServers: [] });
    expect(screen.getByText('Waiting for phone…')).toBeInTheDocument();

    await serverSays('camera:peer-joined', { role: 'phone' });
    expect(screen.getByText('Phone connected')).toBeInTheDocument();
    expect(screen.getByText(/Press Start camera on the phone/)).toBeInTheDocument();
  });

  it('shows the phone video once WebRTC connects', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Phone camera' }));
    await screen.findByRole('img', { name: /QR code/ });
    await serverSays('camera:joined', { role: 'host', peerConnected: true, iceServers: [] });

    await serverSays('camera:offer', { sdp: 'offer-sdp' });
    const connection = FakePeerConnection.instances.at(-1) as FakePeerConnection;
    act(() => connection.emitTrack(createFakeStream().stream));
    act(() => connection.setState('connected'));

    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
  });

  it('explains a failed WebRTC connection and offers a new QR code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Phone camera' }));
    await screen.findByRole('img', { name: /QR code/ });
    await serverSays('camera:joined', { role: 'host', peerConnected: true, iceServers: [] });
    await serverSays('camera:offer', { sdp: 'offer-sdp' });

    act(() =>
      (FakePeerConnection.instances.at(-1) as FakePeerConnection).setState('failed', 'failed'),
    );

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Phone connection failed')).toBeInTheDocument();
    expect(within(alert).getByText(/Check your network connection/)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'New QR code' })).toBeInTheDocument();
  });

  it('reports an expired, unused QR code', async () => {
    session = sessionExpiringIn(50);
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Phone camera' }));

    const alert = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(within(alert).getByText('Camera session expired')).toBeInTheDocument();
  });

  it('ends the phone session and stops the local camera when switching sources', async () => {
    const user = userEvent.setup();
    const { stream, track } = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(stream));
    renderWithProviders(<HomePage />);
    await user.click(screen.getByRole('button', { name: 'Start camera' }));
    await screen.findByText('Camera on');

    await user.click(screen.getByRole('button', { name: 'Phone camera' }));
    expect(track.stop).toHaveBeenCalled();
    await screen.findByRole('img', { name: /QR code/ });
    await serverSays('camera:joined', { role: 'host', peerConnected: false, iceServers: [] });

    await user.click(screen.getByRole('button', { name: 'This device' }));

    expect(socket.sentEvents('camera:end-session')).toHaveLength(1);
    await waitFor(() => expect(socket.disconnected).toBe(true));
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeInTheDocument();
  });
});
