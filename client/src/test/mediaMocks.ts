import { vi } from 'vitest';

export interface FakeStream {
  stream: MediaStream;
  track: { stop: ReturnType<typeof vi.fn> };
}

/** Minimal MediaStream stand-in: jsdom has no real media implementation. */
export function createFakeStream(): FakeStream {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

export function mockGetUserMedia(
  implementation: () => Promise<MediaStream>,
): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(implementation);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return getUserMedia;
}

export function removeMediaDevices(): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
}
