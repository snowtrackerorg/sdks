import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClient } from './client.js';
import { SnowTrackerError } from './errors.js';

const WIRE = {
  as_of: '2026-12-01T10:00:00Z',
  center: { lat: 44.5, lng: -80.2 },
  routes: [
    { id: 'rte_1', name: 'North loop', color: '#208aef' },
    { id: 'rte_2', name: 'Harbour', color: '#12b76a' },
  ],
  tractors: [
    {
      id: 'trk_1',
      vehicle_name: 'Tractor 4',
      icon: 'tractor',
      route_id: 'rte_1',
      lat: 44.51,
      lng: -80.21,
      heading_deg: 90,
      recorded_at: '2026-12-01T09:59:50Z',
    },
    {
      id: 'trk_2',
      vehicle_name: 'Plow 2',
      icon: 'plow-truck',
      route_id: 'rte_2',
      lat: 44.52,
      lng: -80.22,
      heading_deg: null,
      recorded_at: '2026-12-01T09:59:55Z',
    },
  ],
};

function mockFetch(
  body: unknown,
  init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  } as Response);
}

const client = () => createClient({ publishableKey: 'pk_test_x' });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getTracking', () => {
  it('GETs /v1/sdk/tracking with the publishable-key header and the abort signal', async () => {
    const fetchMock = mockFetch(WIRE);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await client().getTracking({ signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith('https://api.snowtracker.pro/v1/sdk/tracking', {
      headers: { 'X-Snowtracker-Publishable-Key': 'pk_test_x' },
      signal: controller.signal,
    });
  });

  it('maps the wire snapshot into TrackingSnapshot', async () => {
    vi.stubGlobal('fetch', mockFetch(WIRE));
    expect(await client().getTracking()).toEqual({
      asOf: '2026-12-01T10:00:00Z',
      center: { lat: 44.5, lng: -80.2 },
      routes: [
        { id: 'rte_1', name: 'North loop', color: '#208aef' },
        { id: 'rte_2', name: 'Harbour', color: '#12b76a' },
      ],
      tractors: [
        {
          id: 'trk_1',
          vehicleName: 'Tractor 4',
          icon: 'tractor',
          routeId: 'rte_1',
          lat: 44.51,
          lng: -80.21,
          headingDeg: 90,
          recordedAt: '2026-12-01T09:59:50Z',
        },
        {
          id: 'trk_2',
          vehicleName: 'Plow 2',
          icon: 'plow-truck',
          routeId: 'rte_2',
          lat: 44.52,
          lng: -80.22,
          headingDeg: null,
          recordedAt: '2026-12-01T09:59:55Z',
        },
      ],
    });
  });

  it('reads null lists and a null center as empty', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ as_of: WIRE.as_of, center: null, routes: null, tractors: null }),
    );
    expect(await client().getTracking()).toEqual({
      asOf: WIRE.as_of,
      center: null,
      routes: [],
      tractors: [],
    });
  });

  it('maps a 404 to tracking_unavailable — a state the UI can branch on', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'not found' }, { ok: false, status: 404 }));
    const err = await client()
      .getTracking()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SnowTrackerError);
    expect(err).toMatchObject({ code: 'tracking_unavailable', status: 404 });
  });

  it('leaves a 404 on other endpoints as not_found', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'gone' }, { ok: false, status: 404 }));
    await expect(client().getTenant()).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('maps a 403 to forbidden and keeps the server detail', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ detail: 'origin not allowed for this key' }, { ok: false, status: 403 }),
    );
    await expect(client().getTracking()).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
      message: 'origin not allowed for this key',
    });
  });
});

describe('Retry-After on a 429', () => {
  async function retryAfterFor(headers: Record<string, string>) {
    vi.stubGlobal('fetch', mockFetch({ detail: 'slow down' }, { ok: false, status: 429, headers }));
    const err = (await client()
      .getTracking()
      .catch((e: unknown) => e)) as SnowTrackerError;
    expect(err).toMatchObject({ code: 'rate_limited', status: 429 });
    return err;
  }

  it('carries delay-seconds', async () => {
    expect((await retryAfterFor({ 'Retry-After': '37' })).retryAfter).toBe(37);
  });

  it('is undefined — not 0 — when the header is missing', async () => {
    const err = await retryAfterFor({});
    expect(err.retryAfter).toBeUndefined();
    expect('retryAfter' in err).toBe(false);
  });

  it('is undefined when the header is empty or unreadable', async () => {
    expect((await retryAfterFor({ 'Retry-After': '' })).retryAfter).toBeUndefined();
    expect((await retryAfterFor({ 'Retry-After': 'soon' })).retryAfter).toBeUndefined();
    expect((await retryAfterFor({ 'Retry-After': '-5' })).retryAfter).toBeUndefined();
  });

  it('keeps an explicit 0 from the server', async () => {
    expect((await retryAfterFor({ 'Retry-After': '0' })).retryAfter).toBe(0);
  });

  it('converts an HTTP-date to seconds from now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
    const err = await retryAfterFor({ 'Retry-After': 'Tue, 01 Dec 2026 10:00:30 GMT' });
    expect(err.retryAfter).toBe(30);
  });
});
