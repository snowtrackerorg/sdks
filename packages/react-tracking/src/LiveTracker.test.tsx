import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveTracker } from './index.js';
import { loadMaps } from './mapsLoader.js';
import { FakeMap, FakeMarker, fakeMapsApi, resetFakeMaps } from './test/fakeMaps.js';

// Never load the real Google Maps API in tests.
vi.mock('./mapsLoader.js', () => ({ loadMaps: vi.fn() }));

const AS_OF = '2026-12-01T10:00:00Z';
const ago = (seconds: number) => new Date(Date.parse(AS_OF) - seconds * 1000).toISOString();

const ROUTES = [
  { id: 'rte_north', name: 'North loop', color: '#208aef' },
  { id: 'rte_harbour', name: 'Harbour', color: '#12b76a' },
  { id: 'rte_empty', name: 'Blue Mountain', color: '#f79009' },
];

function wireTractor(over: Record<string, unknown> = {}) {
  return {
    id: 'trk_1',
    vehicle_name: 'Tractor 4',
    icon: 'tractor',
    route_id: 'rte_north',
    lat: 44.51,
    lng: -80.21,
    heading_deg: 90,
    recorded_at: ago(10),
    ...over,
  };
}

const TWO_OUT = {
  as_of: AS_OF,
  center: { lat: 44.5, lng: -80.2 },
  routes: ROUTES,
  tractors: [
    wireTractor(),
    wireTractor({ id: 'trk_2', vehicle_name: 'Plow 2', route_id: 'rte_harbour', lat: 44.49 }),
  ],
};

function respond(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const KEYS = { publishableKey: 'pk_test_x', googleMapsApiKey: 'maps-key' };
const labels = () => FakeMarker.live().map((m) => m.label);

beforeEach(() => {
  resetFakeMaps();
  vi.mocked(loadMaps).mockReset().mockResolvedValue(fakeMapsApi);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('<LiveTracker> configuration', () => {
  it('shows an inline error box — and never throws — without a Google Maps key', () => {
    const fetchMock = respond(TWO_OUT);
    for (const key of ['', '   ', undefined as unknown as string]) {
      render(<LiveTracker publishableKey="pk_test_x" googleMapsApiKey={key} />);
    }
    const boxes = screen.getAllByRole('alert');
    expect(boxes).toHaveLength(3);
    expect(boxes[0]?.textContent).toBe(
      'LiveTracker needs a Google Maps API key — pass googleMapsApiKey',
    );
    // Logged once for the page, not once per mount; and nothing was fetched or loaded.
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadMaps).not.toHaveBeenCalled();
  });

  it('shows an inline error box without a publishable key', () => {
    respond(TWO_OUT);
    render(<LiveTracker publishableKey="" googleMapsApiKey="maps-key" />);
    expect(screen.getByRole('alert').textContent).toMatch(/pass publishableKey/);
  });

  it('calls the API with the key and base URL, and creates the map on the given Map ID', async () => {
    const fetchMock = respond(TWO_OUT);
    render(<LiveTracker {...KEYS} baseUrl="https://api.staging.example/" mapId="my-map-id" />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.staging.example/v1/sdk/tracking');
    expect(fetchMock.mock.calls[0]?.[1].headers).toEqual({
      'X-Snowtracker-Publishable-Key': 'pk_test_x',
    });
    expect(loadMaps).toHaveBeenCalledWith('maps-key');
    expect(FakeMap.instances[0]?.options.mapId).toBe('my-map-id');
  });

  it('defaults the Map ID to DEMO_MAP_ID', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    expect(FakeMap.instances[0]?.options.mapId).toBe('DEMO_MAP_ID');
  });

  it('injects its stylesheet once, however many trackers mount', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} />);
    render(<LiveTracker {...KEYS} />);
    expect(document.querySelectorAll('style#stp-lt-styles')).toHaveLength(1);
  });

  it('passes className, style and selectClassName through', async () => {
    respond(TWO_OUT);
    const { container } = render(
      <LiveTracker
        {...KEYS}
        className="my-map"
        style={{ height: 600 }}
        selectClassName="my-select"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe('stp-lt my-map');
    expect(root.style.height).toBe('600px');
    expect(screen.getByRole('combobox').className).toBe('stp-lt-select my-select');
  });
});

describe('<LiveTracker> route filter', () => {
  it('lists "All tractors" first, then EVERY saved route — including ones with nobody out', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All tractors',
      'North loop',
      'Harbour',
      'Blue Mountain',
    ]);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
    await waitFor(() => expect(labels()).toEqual(['Tractor 4', 'Plow 2']));
  });

  it('shows only the selected route’s tractors and frames the camera on them', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(labels()).toEqual(['Tractor 4', 'Plow 2']));
    const map = FakeMap.instances[0]!;
    expect(map.fitBounds).toHaveBeenCalledTimes(1); // framed on both

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rte_harbour' } });
    await waitFor(() => expect(labels()).toEqual(['Plow 2']));
    expect(map.setCenter).toHaveBeenLastCalledWith({ lat: 44.49, lng: -80.21 });
    expect(map.setZoom).toHaveBeenLastCalledWith(15);
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    // Tractor 4's marker is a new one, so it now sorts after Plow 2's.
    await waitFor(() => expect(labels().sort()).toEqual(['Plow 2', 'Tractor 4']));
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('starts on defaultRouteId', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} defaultRouteId="rte_north" />);
    await waitFor(() => expect(labels()).toEqual(['Tractor 4']));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('rte_north');
  });

  it('falls back to "All tractors" when defaultRouteId is not a saved route', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} defaultRouteId="rte_deleted" />);
    await waitFor(() => expect(labels()).toEqual(['Tractor 4', 'Plow 2']));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
  });

  it('draws the route colour as the marker ring, and the vehicle name — nothing else — as the label', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(FakeMarker.live()).toHaveLength(2));
    const rings = FakeMarker.live().map((m) => m.content.style.getPropertyValue('--stp-lt-ring'));
    expect(rings).toEqual(['#208aef', '#12b76a']);
  });
});

describe('<LiveTracker> empty states', () => {
  it('a route with nobody out → a centred overlay', async () => {
    respond(TWO_OUT);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(labels()).toHaveLength(2));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rte_empty' } });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('No tractors on this route right now.'),
    );
    expect(FakeMarker.live()).toHaveLength(0);
  });

  it('nobody out at all → overlay, and the map rests on the business’s centre', async () => {
    respond({ ...TWO_OUT, tractors: [] });
    render(<LiveTracker {...KEYS} defaultCenter={{ lat: 1, lng: 2 }} defaultZoom={11} />);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('No tractors are out right now.'),
    );
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    const map = FakeMap.instances[0]!;
    await waitFor(() => expect(map.setCenter).toHaveBeenCalledWith({ lat: 44.5, lng: -80.2 }));
    expect(map.setZoom).toHaveBeenCalledWith(11);
    // The route list is still complete.
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('nobody out and no business centre → rests on defaultCenter', async () => {
    respond({ ...TWO_OUT, center: null, tractors: null });
    render(<LiveTracker {...KEYS} defaultCenter={{ lat: 1, lng: 2 }} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    const map = FakeMap.instances[0]!;
    expect(map.options.center).toEqual({ lat: 1, lng: 2 });
    await waitFor(() => expect(map.setCenter).toHaveBeenCalledWith({ lat: 1, lng: 2 }));
  });

  it('nobody out and nowhere to rest → stays on the neutral default view', async () => {
    respond({ ...TWO_OUT, center: null, tractors: [] });
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    await screen.findByText('No tractors are out right now.');
    const map = FakeMap.instances[0]!;
    expect(map.options.zoom).toBe(4);
    expect(map.setCenter).not.toHaveBeenCalled();
  });

  it('every string is overridable through labels', async () => {
    respond({ ...TWO_OUT, tractors: [] });
    render(
      <LiveTracker
        {...KEYS}
        labels={{ allTractors: 'Tous les tracteurs', noTractors: 'Aucun tracteur en route.' }}
      />,
    );
    await screen.findByText('Aucun tracteur en route.');
    expect(screen.getAllByRole('option')[0]?.textContent).toBe('Tous les tracteurs');
  });
});

describe('<LiveTracker> when the API says no', () => {
  it('404 → a calm panel, onUnavailable once, and Google Maps is never loaded', async () => {
    respond({ detail: 'not found' }, { status: 404 });
    const onUnavailable = vi.fn();
    render(<LiveTracker {...KEYS} onUnavailable={onUnavailable} />);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Live tracking isn’t available right now.',
      ),
    );
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(loadMaps).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('403 → a developer-facing message naming the likely cause', async () => {
    respond({ detail: 'forbidden' }, { status: 403 });
    render(<LiveTracker {...KEYS} />);
    const box = await screen.findByRole('alert');
    expect(box.textContent).toMatch(/403/);
    expect(box.textContent).toMatch(/live tracking scope/);
    expect(box.textContent).toMatch(/origin is not on the key’s allowed list/);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/403/));
  });

  it('a passing fault before any data → a quiet "trying again"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<LiveTracker {...KEYS} />);
    await screen.findByText('Live tracking couldn’t load. Trying again…');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('<LiveTracker> staleness, measured against as_of', () => {
  const FLEET = {
    ...TWO_OUT,
    tractors: [
      wireTractor({ id: 'fresh', vehicle_name: 'Fresh', recorded_at: ago(30) }),
      wireTractor({ id: 'quiet', vehicle_name: 'Quiet', recorded_at: ago(3 * 60 + 5) }),
      wireTractor({ id: 'gone', vehicle_name: 'Gone', recorded_at: ago(16 * 60) }),
    ],
  };

  it('dims a fix older than 2 min, drops one older than 15 min', async () => {
    respond(FLEET);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(labels()).toEqual(['Fresh', 'Quiet · 3m ago']));
    const [fresh, quiet] = FakeMarker.live();
    expect(fresh?.quiet).toBe(false);
    expect(quiet?.quiet).toBe(true);
  });

  it("ignores the viewer's clock entirely", async () => {
    // as_of is 2026-12-01; this test runs "now". If ages were measured against
    // the local clock every tractor above would be long dropped (or, for a
    // viewer whose clock is behind, none would ever dim).
    respond(FLEET);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2031-01-01T00:00:00Z'));
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(labels()).toEqual(['Fresh', 'Quiet · 3m ago']));
  });

  it('only dropped tractors out → reads as nobody out', async () => {
    respond({ ...TWO_OUT, tractors: [wireTractor({ recorded_at: ago(20 * 60) })] });
    render(<LiveTracker {...KEYS} />);
    await screen.findByText('No tractors are out right now.');
    expect(FakeMarker.live()).toHaveLength(0);
  });

  it('frames the camera on reporting tractors, not on where a quiet one was', async () => {
    respond(FLEET);
    render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(labels()).toHaveLength(2));
    const map = FakeMap.instances[0]!;
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.setCenter).toHaveBeenCalledWith({ lat: 44.51, lng: -80.21 });
  });
});

describe('<LiveTracker> teardown', () => {
  it('unmount takes the markers down', async () => {
    respond(TWO_OUT);
    const { unmount } = render(<LiveTracker {...KEYS} />);
    await waitFor(() => expect(FakeMarker.live()).toHaveLength(2));
    unmount();
    expect(FakeMarker.live()).toHaveLength(0);
  });
});
