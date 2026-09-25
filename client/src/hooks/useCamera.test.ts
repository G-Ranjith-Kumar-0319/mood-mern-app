import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeStream, mockGetUserMedia, removeMediaDevices } from '../test/mediaMocks';
import { useCamera } from './useCamera';

describe('useCamera', () => {
  afterEach(() => removeMediaDevices());

  it('starts in the off state', () => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.status).toBe('off');
    expect(result.current.stream).toBeNull();
  });

  it('requests video only (never audio) and becomes active', async () => {
    const { stream } = createFakeStream();
    const getUserMedia = mockGetUserMedia(() => Promise.resolve(stream));
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.start());

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(result.current.status).toBe('active');
    expect(result.current.stream).toBe(stream);
  });

  it('stops every track when stopped', async () => {
    const { stream, track } = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(stream));
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.start());
    act(() => result.current.stop());

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('off');
    expect(result.current.stream).toBeNull();
  });

  it('stops every track on unmount', async () => {
    const { stream, track } = createFakeStream();
    mockGetUserMedia(() => Promise.resolve(stream));
    const { result, unmount } = renderHook(() => useCamera());

    await act(() => result.current.start());
    unmount();

    expect(track.stop).toHaveBeenCalled();
  });

  it('maps a denied permission to CAMERA_PERMISSION_DENIED', async () => {
    mockGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.start());

    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('CAMERA_PERMISSION_DENIED');
  });

  it('reports unsupported browsers', async () => {
    removeMediaDevices();
    const { result } = renderHook(() => useCamera());

    await act(() => result.current.start());

    expect(result.current.error?.code).toBe('CAMERA_NOT_SUPPORTED');
  });

  it('discards a stream that arrives after the user pressed stop', async () => {
    const { stream, track } = createFakeStream();
    let resolvePermission: (value: MediaStream) => void = () => undefined;
    mockGetUserMedia(() => new Promise((resolve) => (resolvePermission = resolve)));
    const { result } = renderHook(() => useCamera());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start();
    });
    act(() => result.current.stop());
    await act(async () => {
      resolvePermission(stream);
      await pending;
    });

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe('off');
  });
});
