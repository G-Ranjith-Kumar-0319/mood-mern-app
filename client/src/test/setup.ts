import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// React Testing Library only auto-cleans when test globals are enabled; we import explicitly instead.
afterEach(() => cleanup());

// jsdom does not implement media playback; browsers return a Promise from play().
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn(() => Promise.resolve()),
});
