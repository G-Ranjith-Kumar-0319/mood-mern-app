import { describe, expect, it } from 'vitest';
import type { CameraDevice } from '../types/camera';
import {
  chooseDefaultCamera,
  getNextCamera,
  getOppositeFacingMode,
  inferFacingMode,
  isMobileDevice,
  shouldMirror,
  toCameraDevices,
} from './camera.utils';

const camera = (deviceId: string, facingMode: CameraDevice['facingMode'] = 'unknown') => ({
  deviceId,
  label: deviceId,
  facingMode,
});

describe('toCameraDevices', () => {
  it('keeps only video inputs that can be selected, without duplicates', () => {
    const cameras = toCameraDevices([
      { deviceId: 'a', kind: 'videoinput', label: 'Integrated Webcam' },
      { deviceId: 'mic', kind: 'audioinput', label: 'Microphone' },
      { deviceId: '', kind: 'videoinput', label: '' },
      { deviceId: 'a', kind: 'videoinput', label: 'Integrated Webcam' },
    ]);
    expect(cameras.map((device) => device.deviceId)).toEqual(['a']);
  });

  it('numbers cameras whose labels are hidden', () => {
    const cameras = toCameraDevices([
      { deviceId: 'a', kind: 'videoinput', label: '' },
      { deviceId: 'b', kind: 'videoinput', label: '  ' },
    ]);
    expect(cameras.map((device) => device.label)).toEqual(['Camera 1', 'Camera 2']);
  });
});

describe('inferFacingMode', () => {
  it('prefers the facing modes the browser reports', () => {
    expect(inferFacingMode('Back Camera', ['user'])).toBe('user');
    expect(inferFacingMode('', ['environment'])).toBe('environment');
  });

  it.each([
    ['Front Camera', 'user'],
    ['camera2 1, facing front', 'user'],
    ['FaceTime HD Camera', 'user'],
    ['Back Dual Wide Camera', 'environment'],
    ['camera2 0, facing back', 'environment'],
    ['Logitech BRIO', 'unknown'],
  ] as const)('reads "%s" as %s', (label, expected) => {
    expect(inferFacingMode(label)).toBe(expected);
  });
});

describe('chooseDefaultCamera', () => {
  const cameras = [camera('back', 'environment'), camera('front', 'user'), camera('usb')];

  it('keeps the previous choice when it is still connected', () => {
    expect(
      chooseDefaultCamera(cameras, { preferredId: 'usb', preferredFacing: 'user' })?.deviceId,
    ).toBe('usb');
  });

  it('prefers the requested side on phones', () => {
    expect(
      chooseDefaultCamera(cameras, { preferredId: 'gone', preferredFacing: 'user' })?.deviceId,
    ).toBe('front');
    expect(chooseDefaultCamera(cameras, { preferredFacing: 'environment' })?.deviceId).toBe('back');
  });

  it('uses the first camera on desktop', () => {
    expect(chooseDefaultCamera(cameras, { preferredFacing: null })?.deviceId).toBe('back');
  });

  it('returns null when there is no camera', () => {
    expect(chooseDefaultCamera([], { preferredFacing: null })).toBeNull();
  });
});

describe('getNextCamera', () => {
  const cameras = [camera('a'), camera('b'), camera('c')];

  it('cycles through cameras', () => {
    expect(getNextCamera(cameras, 'a')?.deviceId).toBe('b');
    expect(getNextCamera(cameras, 'c')?.deviceId).toBe('a');
    expect(getNextCamera(cameras, null)?.deviceId).toBe('a');
  });

  it('returns null when there is nothing to switch to', () => {
    expect(getNextCamera([camera('a')], 'a')).toBeNull();
  });
});

describe('facing mode helpers', () => {
  it('flips front and rear (unknown counts as front)', () => {
    expect(getOppositeFacingMode('user')).toBe('environment');
    expect(getOppositeFacingMode('environment')).toBe('user');
    expect(getOppositeFacingMode('unknown')).toBe('environment');
  });

  it('mirrors everything except the rear camera', () => {
    expect(shouldMirror('user')).toBe(true);
    expect(shouldMirror('unknown')).toBe(true);
    expect(shouldMirror('environment')).toBe(false);
  });
});

describe('isMobileDevice', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36', 0, true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5, true], // iPadOS
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0, false],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0', 0, false],
  ])('%s (touch points %d) → %s', (userAgent, maxTouchPoints, expected) => {
    expect(isMobileDevice({ userAgent, maxTouchPoints })).toBe(expected);
  });

  it('trusts User-Agent Client Hints when available', () => {
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0', userAgentData: { mobile: true } })).toBe(
      true,
    );
  });
});
