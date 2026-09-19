import type { TrackingSnapshot } from '@snowtrackerpro/sdk-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrackingPoller, type PollerClient } from './poller.js';

const SNAPSHOT: TrackingSnapshot = {
  asOf: '2026-12-01T10:00:00Z',
  center: null,
  routes: [],
  tractors: [],
};

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Lets the awaited getTracking() settle and the poller schedule its next run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

function harness(getTracking: PollerClient['getTracking']) {
  const client = { getTracking: vi.fn(getTracking) };
  const handlers = { onSnapshot: vi.fn(), onError: vi.fn() };
  const poller = new TrackingPoller(client, handlers);
  return { client, handlers, poller };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

describe('TrackingPoller', () => {
  it('fetches at once, then every 10 s', async () => {
    const { client, handlers, poller } = harness(async () => SNAPSHOT);
    poller.start();
    await settle();
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    expect(handlers.onSnapshot).toHaveBeenCalledWith(SNAPSHOT);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getTracking).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getTracking).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('never overlaps: a slow request holds the next one back', async () => {
    let release: (s: TrackingSnapshot) => void = () => {};
    const { client, poller } = harness(
      () => new Promise<TrackingSnapshot>((resolve) => (release = resolve)),
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(client.getTracking).toHaveBeenCalledTimes(1);

    // Even a visibility flip mid-request must not start a second one.
    setHidden(true);
    setHidden(false);
    expect(client.getTracking).toHaveBeenCalledTimes(1);

    release(SNAPSHOT);
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getTracking).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('pauses while the tab is hidden and refetches the moment it is shown', async () => {
    const { client, poller } = harness(async () => SNAPSHOT);
    poller.start();
    await settle();
    expect(client.getTracking).toHaveBeenCalledTimes(1);

    setHidden(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(client.getTracking).toHaveBeenCalledTimes(1);

    setHidden(false);
    await settle();
    expect(client.getTracking).toHaveBeenCalledTimes(2);
    // …and the regular cadence resumes from there.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getTracking).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('does not fetch when started in a hidden tab, until shown', async () => {
    setHidden(true);
    const { client, poller } = harness(async () => SNAPSHOT);
    poller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.getTracking).not.toHaveBeenCalled();
    setHidden(false);
    await settle();
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('backs off exponentially to 60 s on errors, and recovers to 10 s', async () => {
    let fail = true;
    const { client, handlers, poller } = harness(async () => {
      if (fail) throw new Error('boom');
      return SNAPSHOT;
    });
    poller.start();
    await settle();
    expect(handlers.onError).toHaveBeenCalledTimes(1);

    // 20 s, 40 s, 60 s, 60 s
    for (const [wait, calls] of [
      [20_000, 2],
      [40_000, 3],
      [60_000, 4],
      [60_000, 5],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(client.getTracking).toHaveBeenCalledTimes(calls - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(client.getTracking).toHaveBeenCalledTimes(calls);
    }

    fail = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(handlers.onSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getTracking).toHaveBeenCalledTimes(7);
    poller.stop();
  });

  it('honours Retry-After, even across a hide/show', async () => {
    let calls = 0;
    const { client, poller } = harness(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('slow down'), { status: 429, retryAfter: 90 });
      return SNAPSHOT;
    });
    poller.start();
    await settle();

    await vi.advanceTimersByTimeAsync(30_000);
    setHidden(true);
    setHidden(false); // an eager refetch here would break the server's ask
    await vi.advanceTimersByTimeAsync(59_999);
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getTracking).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('falls back to its own backoff when a 429 carries no Retry-After', async () => {
    let calls = 0;
    const { client, poller } = harness(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('slow down'), { status: 429 });
      return SNAPSHOT;
    });
    poller.start();
    await settle();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getTracking).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('never retries sooner than its backoff, whatever Retry-After says', async () => {
    let calls = 0;
    const { client, poller } = harness(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('slow down'), { status: 429, retryAfter: 0 });
      return SNAPSHOT;
    });
    poller.start();
    await settle();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('stop() aborts the in-flight request, reports nothing, and schedules nothing', async () => {
    let signal: AbortSignal | undefined;
    const { client, handlers, poller } = harness(
      (opts) =>
        new Promise<TrackingSnapshot>((_, reject) => {
          signal = opts.signal;
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    poller.start();
    await settle();
    expect(signal?.aborted).toBe(false);

    poller.stop();
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onSnapshot).not.toHaveBeenCalled();

    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(client.getTracking).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
