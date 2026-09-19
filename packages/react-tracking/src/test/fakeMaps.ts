// A stand-in for the three Google Maps classes <LiveTracker> uses, so tests
// never load the real API. Records what the component asked the map to do.
import { vi } from 'vitest';

import type { MapsApi } from '../mapsLoader.js';

export interface FakeLatLng {
  lat: number;
  lng: number;
}

export class FakeMap {
  static instances: FakeMap[] = [];
  setCenter = vi.fn();
  setZoom = vi.fn();
  fitBounds = vi.fn();
  constructor(
    readonly el: HTMLElement,
    readonly options: Record<string, unknown>,
  ) {
    FakeMap.instances.push(this);
  }
}

export class FakeMarker {
  static instances: FakeMarker[] = [];
  map: FakeMap | null;
  position: FakeLatLng;
  content: HTMLElement;
  title: string;
  zIndex: number;
  constructor(o: {
    map: FakeMap;
    position: FakeLatLng;
    content: HTMLElement;
    title: string;
    zIndex: number;
  }) {
    this.map = o.map;
    this.position = o.position;
    this.content = o.content;
    this.title = o.title;
    this.zIndex = o.zIndex;
    FakeMarker.instances.push(this);
  }
  /** Markers still on a map. */
  static live(): FakeMarker[] {
    return FakeMarker.instances.filter((m) => m.map !== null);
  }
  get label(): string {
    return this.content.querySelector('.stp-lt-marker__label')?.textContent ?? '';
  }
  get quiet(): boolean {
    return this.content.classList.contains('stp-lt-marker--quiet');
  }
}

export class FakeBounds {
  points: FakeLatLng[] = [];
  extend(p: FakeLatLng): void {
    this.points.push(p);
  }
}

export function resetFakeMaps(): void {
  FakeMap.instances = [];
  FakeMarker.instances = [];
}

export const fakeMapsApi = {
  Map: FakeMap,
  AdvancedMarkerElement: FakeMarker,
  LatLngBounds: FakeBounds,
} as unknown as MapsApi;
