import { vi } from 'vitest';

type Listener = () => void;

export interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, listener: Listener) => void;
  getSettings: () => MediaTrackSettings;
  /** Simulates the browser ending the track (camera unplugged, permission revoked). */
  end: () => void;
}

export interface FakeStream {
  stream: MediaStream;
  track: FakeTrack;
}

/** Minimal MediaStream stand-in: jsdom has no real media implementation. */
export function createFakeStream(settings: MediaTrackSettings = {}): FakeStream {
  const endedListeners: Listener[] = [];
  const track: FakeTrack = {
    stop: vi.fn(),
    addEventListener: (type, listener) => {
      if (type === 'ended') endedListeners.push(listener);
    },
    getSettings: () => settings,
    end: () => endedListeners.forEach((listener) => listener()),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

export interface FakeDevice {
  deviceId: string;
  label: string;
  kind?: MediaDeviceKind;
}

export interface FakeMediaDevices {
  getUserMedia: ReturnType<typeof vi.fn>;
  enumerateDevices: ReturnType<typeof vi.fn>;
  /** Replace the connected devices and fire "devicechange" (a USB camera plugged/unplugged). */
  changeDevices: (devices: FakeDevice[]) => void;
}

export function mockMediaDevices(
  getUserMediaImpl: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  initialDevices: FakeDevice[] = [],
): FakeMediaDevices {
  let devices = initialDevices;
  const listeners = new Set<Listener>();
  const getUserMedia = vi.fn(getUserMediaImpl);
  const enumerateDevices = vi.fn(() =>
    Promise.resolve(
      devices.map((device) => ({ groupId: '', kind: 'videoinput', ...device, toJSON: () => ({}) })),
    ),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    },
  });
  return {
    getUserMedia,
    enumerateDevices,
    changeDevices: (next) => {
      devices = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export function mockGetUserMedia(
  implementation: () => Promise<MediaStream>,
): ReturnType<typeof vi.fn> {
  return mockMediaDevices(implementation).getUserMedia;
}

export function removeMediaDevices(): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
}

/** Rejects like getUserMedia does, e.g. `mediaError('NotAllowedError')`. */
export function mediaError(name: string): DOMException {
  return new DOMException(name, name);
}
