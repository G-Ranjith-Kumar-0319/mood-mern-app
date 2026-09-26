import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSignaling } from '../../services/signaling';
import {
  createFakeStream,
  mediaError,
  mockGetUserMedia,
  removeMediaDevices,
} from '../../test/mediaMocks';
import { renderWithProviders } from '../../test/renderWithProviders';
import {
  FakePeerConnection,
  FakeSocket,
  flushPromises,
  installFakeWebRtc,
} from '../../test/webrtcMocks';
import { PhoneCameraPage } from './PhoneCameraPage';

vi.mock('../../services/signaling', () => ({ connectSignaling: vi.fn() }));

let socket: FakeSocket;

function renderPage(route = '/camera/session-1#token=phone-token') {
  return renderWithProviders(
    <Routes>
      <Route path="camera/:sessionId" element={<PhoneCameraPage />} />
    </Routes>,
    { route },
  );
}

async function serverSays(event: string, ...args: unknown[]) {
  await act(async () => {
    socket.receive(event, ...args);
    await flushPromises();
  });
}

describe('PhoneCameraPage', () => {
  beforeEach(() => {
    installFakeWebRtc();
    socket = new FakeSocket();
    vi.mocked(connectSignaling).mockReturnValue(socket.asSocket);
  });

  afterEach(() => {
    removeMediaDevices();
    vi.unstubAllGlobals();
  });

  it('rejects a link without a token', () => {
    renderPage('/camera/session-1');
    expect(screen.getByText('Invalid camera link')).toBeInTheDocument();
    expect(connectSignaling).not.toHaveBeenCalled();
  });

  it('joins with the token from the URL fragment and waits for Start camera', async () => {
    const getUserMedia = mockGetUserMedia(() => Promise.resolve(createFakeStream().stream));
    renderPage();

    expect(connectSignaling).toHaveBeenCalledWith({ sessionId: 'session-1', token: 'phone-token' });
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: [] });

    expect(screen.getByText('Connected to laptop')).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(FakePeerConnection.instances).toHaveLength(0);
  });

  it('streams the rear camera (video only) to the laptop after Start camera', async () => {
    const user = userEvent.setup();
    const camera = createFakeStream({ facingMode: 'environment' });
    const getUserMedia = mockGetUserMedia(() => Promise.resolve(camera.stream));
    renderPage();
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: [] });

    await user.click(screen.getByRole('button', { name: 'Start camera' }));
    await act(flushPromises);

    const constraints = getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints;
    expect(constraints.audio).toBe(false);
    expect((constraints.video as MediaTrackConstraints).facingMode).toEqual({
      ideal: 'environment',
    });
    expect(socket.sentEvents('camera:offer')).toEqual([{ sdp: 'offer-sdp' }]);

    act(() => (FakePeerConnection.instances[0] as FakePeerConnection).setState('connected'));
    expect(screen.getByText('Streaming to laptop')).toBeInTheDocument();
  });

  it('stops the camera and hangs up on Stop camera', async () => {
    const user = userEvent.setup();
    const camera = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(camera.stream));
    renderPage();
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: [] });
    await user.click(screen.getByRole('button', { name: 'Start camera' }));

    await user.click(screen.getByRole('button', { name: 'Stop camera' }));

    expect(camera.track.stop).toHaveBeenCalled();
    expect(socket.sentEvents('camera:hangup')).toHaveLength(1);
    expect(FakePeerConnection.instances[0]?.closed).toBe(true);
  });

  it('releases the camera, the connection and the socket when leaving the page', async () => {
    const user = userEvent.setup();
    const camera = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(camera.stream));
    const { unmount } = renderPage();
    await serverSays('camera:joined', { role: 'phone', peerConnected: true, iceServers: [] });
    await user.click(screen.getByRole('button', { name: 'Start camera' }));

    unmount();

    expect(camera.track.stop).toHaveBeenCalled();
    expect(FakePeerConnection.instances[0]?.closed).toBe(true);
    expect(socket.disconnected).toBe(true);
  });

  it('explains a denied camera permission', async () => {
    const user = userEvent.setup();
    mockGetUserMedia(() => Promise.reject(mediaError('NotAllowedError')));
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Start camera' }));

    expect(await screen.findByText('Camera permission needed')).toBeInTheDocument();
  });

  it('explains an expired session', async () => {
    renderPage();
    socket.active = false;
    await serverSays('connect_error', new Error('SESSION_EXPIRED'));

    expect(screen.getByText('Cannot connect to the laptop')).toBeInTheDocument();
    expect(screen.getByText(/Camera session expired/)).toBeInTheDocument();
  });
});
