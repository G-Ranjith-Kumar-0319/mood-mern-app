import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS_URL, useLiveUpdates } from './useLiveUpdates';

/** Minimal EventSource stand-in (jsdom has none). */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, () => void>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  emit(type: string) {
    this.listeners.get(type)?.();
  }
  close() {
    this.closed = true;
  }
}

function setup(identity = 'anonymous') {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const hook = renderHook(({ id }) => useLiveUpdates(id), {
    wrapper,
    initialProps: { id: identity },
  });
  return { ...hook, invalidate };
}

describe('useLiveUpdates', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to the event stream and reports "live" once open', () => {
    const { result } = setup();
    expect(FakeEventSource.instances[0]?.url).toBe(EVENTS_URL);
    expect(result.current).toBe('connecting');
    act(() => FakeEventSource.instances[0]?.onopen?.());
    expect(result.current).toBe('live');
  });

  it('refreshes expression data once per burst of events', () => {
    const { invalidate } = setup();
    const source = FakeEventSource.instances[0]!;
    act(() => {
      source.emit('detection.created');
      source.emit('detection.created');
      source.emit('detection.created');
      vi.advanceTimersByTime(400);
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['expressions'] });
  });

  it('reopens the stream when the signed-in identity changes', () => {
    const { rerender } = setup('anonymous');
    rerender({ id: 'user-1' });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });
});
