import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

describe('OfflineBanner', () => {
  afterEach(() => setOnline(true));

  it('appears when the connection drops and disappears when it returns', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();

    act(() => setOnline(false));
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();

    act(() => setOnline(true));
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
  });
});
