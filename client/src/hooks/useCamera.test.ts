import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeStream,
  mediaError,
  mockGetUserMedia,
  mockMediaDevices,
  removeMediaDevices,
  type FakeDevice,
} from '../test/mediaMocks';
import { useCamera } from './useCamera';

const WEBCAM: FakeDevice = { deviceId: 'cam-a', label: 'Integrated Webcam' };
const USB: FakeDevice = { deviceId: 'cam-b', label: 'USB Webcam' };
const FRONT: FakeDevice = { deviceId: 'front', label: 'Front Camera' };
const BACK: FakeDevice = { deviceId: 'back', label: 'Back Camera' };

function videoOf(constraints: MediaStreamConstraints): MediaTrackConstraints {
  return constraints.video as MediaTrackConstraints;
}

/** getUserMedia that returns a stream reporting whichever device was asked for. */
function deviceStreams() {
  const opened: ReturnType<typeof createFakeStream>[] = [];
  const impl = (constraints: MediaStreamConstraints) => {
    const video = videoOf(constraints);
    const deviceId = (video.deviceId as ConstrainDOMStringParameters | undefined)?.exact;
    const fake = createFakeStream({ deviceId: typeof deviceId === 'string' ? deviceId : 'cam-a' });
    opened.push(fake);
    return Promise.resolve(fake.stream);
  };
  return { opened, impl };
}

function mockUserAgent(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

describe('useCamera', () => {
  afterEach(() => {
    removeMediaDevices();
    vi.restoreAllMocks();
  });

  it('starts idle with no camera open', () => {
    mockMediaDevices(() => Promise.reject(new Error('not called')));
    const { result } = renderHook(() => useCamera());
    expect(result.current.status).toBe('idle');
    expect(result.current.stream).toBeNull();
    expect(result.current.isMobile).toBe(false);
  });

  it('lists already-permitted cameras on mount and selects the first on desktop', async () => {
    mockMediaDevices(() => Promise.reject(new Error('not called')), [WEBCAM, USB]);
    const { result } = renderHook(() => useCamera());

    await waitFor(() => expect(result.current.cameras).toHaveLength(2));
    expect(result.current.cameras.map((camera) => camera.label)).toEqual([
      'Integrated Webcam',
      'USB Webcam',
    ]);
    expect(result.current.selectedCameraId).toBe('cam-a');
    expect(result.current.canSwitchCamera).toBe(true);
  });

  it('requests video only (never audio), then enumerates the now-labelled cameras', async () => {
    const { stream } = createFakeStream({ deviceId: 'cam-a' });
    const media = mockMediaDevices(() => Promise.resolve(stream));
    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(media.enumerateDevices).toHaveBeenCalled());

    // Before permission the browser hides devices; after it, they appear.
    media.enumerateDevices.mockResolvedValue([
      { ...WEBCAM, kind: 'videoinput', groupId: '' },
      { deviceId: 'mic', label: 'Microphone', kind: 'audioinput', groupId: '' },
    ]);
    await act(() => result.current.startCamera());

    const constraints = media.getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints;
    expect(constraints.audio).toBe(false);
    expect(videoOf(constraints).facingMode).toEqual({ ideal: 'user' });
    expect(result.current.status).toBe('active');
    expect(result.current.stream).toBe(stream);
    expect(result.current.cameras).toEqual([
      { deviceId: 'cam-a', label: 'Integrated Webcam', facingMode: 'unknown' },
    ]);
    expect(result.current.selectedCameraId).toBe('cam-a');
  });

  it('stops every track when stopped', async () => {
    const { stream, track } = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(stream));
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.startCamera());
    act(() => result.current.stopCamera());

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.stream).toBeNull();
  });

  it('stops every track and the devicechange listener on unmount', async () => {
    const { stream, track } = createFakeStream();
    const media = mockMediaDevices(() => Promise.resolve(stream));
    const { result, unmount } = renderHook(() => useCamera());

    await act(() => result.current.startCamera());
    unmount();
    const callsBefore = media.enumerateDevices.mock.calls.length;
    media.changeDevices([WEBCAM]);

    expect(track.stop).toHaveBeenCalled();
    expect(media.enumerateDevices).toHaveBeenCalledTimes(callsBefore);
  });

  it.each([
    ['NotAllowedError', 'CAMERA_PERMISSION_DENIED'],
    ['NotFoundError', 'CAMERA_NOT_FOUND'],
    ['NotReadableError', 'CAMERA_IN_USE'],
  ])('maps %s to %s', async (name, code) => {
    mockGetUserMedia(() => Promise.reject(mediaError(name)));
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.startCamera());

    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe(code);
  });

  it('reports unsupported browsers', async () => {
    removeMediaDevices();
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.startCamera());

    expect(result.current.error?.code).toBe('CAMERA_NOT_SUPPORTED');
  });

  it('discards a stream that arrives after the user pressed stop', async () => {
    const { stream, track } = createFakeStream();
    let resolvePermission: (value: MediaStream) => void = () => undefined;
    mockGetUserMedia(() => new Promise((resolve) => (resolvePermission = resolve)));
    const { result } = renderHook(() => useCamera());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.startCamera();
    });
    act(() => result.current.stopCamera());
    await act(async () => {
      resolvePermission(stream);
      await pending;
    });

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('selecting another camera releases the current one before opening the new one', async () => {
    const { opened, impl } = deviceStreams();
    const stoppedBeforeNextRequest: boolean[] = [];
    const media = mockMediaDevices(
      (constraints) => {
        const previous = opened.at(-1);
        if (previous) stoppedBeforeNextRequest.push(previous.track.stop.mock.calls.length > 0);
        return impl(constraints);
      },
      [WEBCAM, USB],
    );
    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.selectedCameraId).toBe('cam-a'));
    await act(() => result.current.startCamera());

    await act(() => result.current.selectCamera('cam-b'));

    expect(videoOf(media.getUserMedia.mock.calls[1]?.[0]).deviceId).toEqual({ exact: 'cam-b' });
    expect(stoppedBeforeNextRequest).toEqual([true]);
    expect(result.current.status).toBe('active');
    expect(result.current.selectedCameraId).toBe('cam-b');
    expect(result.current.stream).toBe(opened[1]?.stream);
  });

  it('shows the switching state while the new camera opens', async () => {
    const first = createFakeStream({ deviceId: 'cam-a' });
    let resolveSecond: (value: MediaStream) => void = () => undefined;
    const media = mockMediaDevices(() => Promise.resolve(first.stream), [WEBCAM, USB]);
    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.cameras).toHaveLength(2));
    await act(() => result.current.startCamera());

    media.getUserMedia.mockImplementation(
      () => new Promise((resolve) => (resolveSecond = resolve)),
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.switchCamera();
    });

    expect(result.current.status).toBe('switching');
    expect(result.current.stream).toBeNull();
    await act(async () => {
      resolveSecond(createFakeStream({ deviceId: 'cam-b' }).stream);
      await pending;
    });
    expect(result.current.status).toBe('active');
    expect(result.current.selectedCameraId).toBe('cam-b');
  });

  it('only remembers the choice when selecting while the camera is off', async () => {
    const media = mockMediaDevices(() => Promise.reject(new Error('not called')), [WEBCAM, USB]);
    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.cameras).toHaveLength(2));

    await act(() => result.current.selectCamera('cam-b'));

    expect(result.current.selectedCameraId).toBe('cam-b');
    expect(media.getUserMedia).not.toHaveBeenCalled();
  });

  it('falls back to any front camera when the remembered camera is gone', async () => {
    const fallback = createFakeStream({ deviceId: 'cam-b' });
    const media = mockMediaDevices(
      () => Promise.reject(mediaError('OverconstrainedError')),
      [WEBCAM, USB],
    );
    const { result } = renderHook(() => useCamera());
    await waitFor(() => expect(result.current.selectedCameraId).toBe('cam-a'));
    media.getUserMedia
      .mockRejectedValueOnce(mediaError('OverconstrainedError'))
      .mockResolvedValueOnce(fallback.stream);

    await act(() => result.current.startCamera());

    expect(videoOf(media.getUserMedia.mock.calls[1]?.[0]).facingMode).toEqual({ ideal: 'user' });
    expect(result.current.status).toBe('active');
    expect(result.current.selectedCameraId).toBe('cam-b');
  });

  describe('on a phone', () => {
    it('opens the front camera by default and switches to the rear with facingMode', async () => {
      mockUserAgent(IPHONE_UA);
      const media = mockMediaDevices(
        (constraints) => {
          const facing = videoOf(constraints).facingMode as ConstrainDOMStringParameters;
          const value = facing.exact ?? facing.ideal;
          const deviceId = value === 'environment' ? 'back' : 'front';
          return Promise.resolve(createFakeStream({ deviceId, facingMode: String(value) }).stream);
        },
        [BACK, FRONT],
      );
      const { result } = renderHook(() => useCamera());
      await waitFor(() => expect(result.current.selectedCameraId).toBe('front'));
      expect(result.current.isMobile).toBe(true);

      // The first start uses the pre-selected front camera's id.
      media.getUserMedia.mockImplementationOnce(() =>
        Promise.resolve(createFakeStream({ deviceId: 'front', facingMode: 'user' }).stream),
      );
      await act(() => result.current.startCamera());
      expect(result.current.facingMode).toBe('user');

      await act(() => result.current.switchCamera());
      expect(videoOf(media.getUserMedia.mock.calls[1]?.[0]).facingMode).toEqual({
        exact: 'environment',
      });
      expect(result.current.facingMode).toBe('environment');
      expect(result.current.selectedCameraId).toBe('back');

      await act(() => result.current.switchCamera());
      expect(videoOf(media.getUserMedia.mock.calls[2]?.[0]).facingMode).toEqual({ exact: 'user' });
      expect(result.current.facingMode).toBe('user');
    });

    it('falls back to the next listed camera when the opposite facing mode is unsupported', async () => {
      mockUserAgent(IPHONE_UA);
      const media = mockMediaDevices(
        () => Promise.resolve(createFakeStream({ deviceId: 'front' }).stream),
        [FRONT, { deviceId: 'ext', label: 'External' }],
      );
      const { result } = renderHook(() => useCamera());
      await waitFor(() => expect(result.current.cameras).toHaveLength(2));
      await act(() => result.current.startCamera());

      media.getUserMedia
        .mockRejectedValueOnce(mediaError('OverconstrainedError'))
        .mockResolvedValueOnce(createFakeStream({ deviceId: 'ext' }).stream);
      await act(() => result.current.switchCamera());

      expect(videoOf(media.getUserMedia.mock.calls[2]?.[0]).deviceId).toEqual({ exact: 'ext' });
      expect(result.current.status).toBe('active');
      expect(result.current.selectedCameraId).toBe('ext');
    });
  });

  describe('device changes', () => {
    it('keeps the selection when another camera is plugged in', async () => {
      const media = mockMediaDevices(() => Promise.reject(new Error('not called')), [WEBCAM, USB]);
      const { result } = renderHook(() => useCamera());
      await waitFor(() => expect(result.current.cameras).toHaveLength(2));
      await act(() => result.current.selectCamera('cam-b'));

      await act(async () => media.changeDevices([WEBCAM, USB, { deviceId: 'v', label: 'OBS' }]));

      await waitFor(() => expect(result.current.cameras).toHaveLength(3));
      expect(result.current.selectedCameraId).toBe('cam-b');
    });

    it('falls back to a remaining camera when the selected one is unplugged while off', async () => {
      const media = mockMediaDevices(() => Promise.reject(new Error('not called')), [WEBCAM, USB]);
      const { result } = renderHook(() => useCamera());
      await waitFor(() => expect(result.current.cameras).toHaveLength(2));
      await act(() => result.current.selectCamera('cam-b'));

      await act(async () => media.changeDevices([WEBCAM]));

      await waitFor(() => expect(result.current.selectedCameraId).toBe('cam-a'));
      expect(result.current.status).toBe('idle');
    });

    it('reports a disconnect and releases the stream when the active camera is unplugged', async () => {
      const { opened, impl } = deviceStreams();
      const media = mockMediaDevices(impl, [WEBCAM, USB]);
      const { result } = renderHook(() => useCamera());
      await waitFor(() => expect(result.current.selectedCameraId).toBe('cam-a'));
      await act(() => result.current.startCamera());

      await act(async () => media.changeDevices([USB]));

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.error?.code).toBe('CAMERA_DISCONNECTED');
      expect(opened[0]?.track.stop).toHaveBeenCalled();
      expect(result.current.stream).toBeNull();
      expect(result.current.selectedCameraId).toBe('cam-b');
    });

    it('reports a disconnect when the browser ends the track', async () => {
      const { stream, track } = createFakeStream();
      mockGetUserMedia(() => Promise.resolve(stream));
      const { result } = renderHook(() => useCamera());
      await act(() => result.current.startCamera());

      act(() => track.end());

      expect(result.current.status).toBe('error');
      expect(result.current.error?.code).toBe('CAMERA_DISCONNECTED');
    });
  });
});
