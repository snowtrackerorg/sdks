import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkerLayer, TWEEN_MS, type LayerTractor } from './markerLayer.js';
import { FakeMap, FakeMarker, fakeMapsApi, resetFakeMaps } from './test/fakeMaps.js';

const tractor = (over: Partial<LayerTractor> = {}): LayerTractor => ({
  id: 'trk_1',
  lat: 44.5,
  lng: -80.2,
  caption: 'Tractor 4',
  icon: 'tractor',
  ringColor: '#208aef',
  headingDeg: 90,
  stale: false,
  ...over,
});

// A hand-cranked requestAnimationFrame.
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function runFrame(now: number): void {
  const due = [...frames.values()];
  frames = new Map();
  for (const cb of due) cb(now);
}

function newLayer() {
  const map = new FakeMap(document.createElement('div'), {});
  return {
    map,
    layer: new MarkerLayer(fakeMapsApi, map as unknown as google.maps.Map, document),
  };
}

beforeEach(() => {
  resetFakeMaps();
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void frames.delete(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MarkerLayer', () => {
  it('draws a marker with the vehicle name, glyph, route ring and heading', () => {
    const { layer } = newLayer();
    layer.sync([tractor()]);
    const [m] = FakeMarker.live();
    expect(m?.label).toBe('Tractor 4');
    expect(m?.position).toEqual({ lat: 44.5, lng: -80.2 });
    expect(m?.content.style.getPropertyValue('--stp-lt-ring')).toBe('#208aef');
    expect(m?.content.querySelector('.stp-lt-marker__badge svg')).not.toBeNull();
    const heading = m?.content.querySelector<HTMLElement>('.stp-lt-marker__heading');
    expect(heading?.hidden).toBe(false);
    expect(heading?.style.transform).toBe('rotate(90deg)');
  });

  it('hides the heading arrow when the device reported none', () => {
    const { layer } = newLayer();
    layer.sync([tractor({ headingDeg: null })]);
    const heading =
      FakeMarker.live()[0]?.content.querySelector<HTMLElement>('.stp-lt-marker__heading');
    expect(heading?.hidden).toBe(true);
  });

  it('writes the name as text — markup in a vehicle name is never parsed', () => {
    const { layer } = newLayer();
    layer.sync([tractor({ caption: '<img src=x onerror=alert(1)>' })]);
    const m = FakeMarker.live()[0];
    expect(m?.content.querySelector('img')).toBeNull();
    expect(m?.label).toBe('<img src=x onerror=alert(1)>');
  });

  it('glides an existing marker to its new position, reusing the same marker', () => {
    const { layer } = newLayer();
    layer.sync([tractor()]);
    layer.sync([tractor({ lat: 44.501, lng: -80.201 })]);
    expect(FakeMarker.instances).toHaveLength(1);
    const m = FakeMarker.instances[0];
    expect(m?.position).toEqual({ lat: 44.5, lng: -80.2 }); // not jumped

    runFrame(1_000);
    runFrame(1_000 + TWEEN_MS / 2);
    expect(m?.position.lat).toBeCloseTo(44.5005, 6);
    runFrame(1_000 + TWEEN_MS);
    expect(m?.position).toEqual({ lat: 44.501, lng: -80.201 });
    expect(frames.size).toBe(0);
  });

  it('jumps rather than glides across a long gap', () => {
    const { layer } = newLayer();
    layer.sync([tractor()]);
    layer.sync([tractor({ lat: 45.5 })]);
    expect(FakeMarker.instances[0]?.position).toEqual({ lat: 45.5, lng: -80.2 });
    expect(frames.size).toBe(0);
  });

  it('removes markers that are no longer listed, and repaints the ones that stay', () => {
    const { layer } = newLayer();
    layer.sync([tractor(), tractor({ id: 'trk_2', caption: 'Plow 2' })]);
    layer.sync([tractor({ id: 'trk_2', caption: 'Plow 2 · 3m ago', stale: true })]);
    const live = FakeMarker.live();
    expect(live.map((m) => m.label)).toEqual(['Plow 2 · 3m ago']);
    expect(live[0]?.quiet).toBe(true);
  });

  it('destroy() cancels a glide in progress and takes every marker down', () => {
    const { layer } = newLayer();
    layer.sync([tractor()]);
    layer.sync([tractor({ lat: 44.501 })]);
    expect(frames.size).toBe(1);
    layer.destroy();
    expect(frames.size).toBe(0);
    expect(FakeMarker.live()).toHaveLength(0);
  });

  it('frames one tractor at street zoom and several by their bounds', () => {
    const { layer, map } = newLayer();
    layer.fit([{ lat: 1, lng: 2 }]);
    expect(map.setCenter).toHaveBeenCalledWith({ lat: 1, lng: 2 });
    expect(map.setZoom).toHaveBeenCalledWith(15);
    layer.fit([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0]?.[0].points).toEqual([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
  });
});
