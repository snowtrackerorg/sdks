// Keeps a set of AdvancedMarkerElements in step with the tractors to show.
// Framework-free: <LiveTracker> hands it the loaded Maps classes and a list.
//
// Between polls a marker glides to its new position instead of jumping — a
// short position tween on requestAnimationFrame, cancelled on destroy().
import { createMarkerContent, paintMarkerContent, type MarkerPaint } from './marker.js';
import type { MapsApi } from './mapsLoader.js';

export interface LayerTractor extends MarkerPaint {
  id: string;
  lat: number;
  lng: number;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface Entry {
  marker: google.maps.marker.AdvancedMarkerElement;
  content: HTMLElement;
  /** Where the marker is drawn right now (mid-tween this trails `target`). */
  shown: LatLng;
  target: LatLng;
  frame: number | null;
}

export const TWEEN_MS = 1_000;
/** Beyond this many degrees (~2 km) a glide would read as teleporting slowly — just jump. */
const MAX_TWEEN_DEGREES = 0.02;
/** A lone tractor is shown at street scale, never at the zoom a one-point fit lands on. */
export const SINGLE_TRACTOR_ZOOM = 15;
const FIT_PADDING_PX = 80;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function canAnimate(): boolean {
  if (typeof requestAnimationFrame !== 'function') return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof matchMedia === 'function') {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch {
      // matchMedia unavailable in this environment — animate
    }
  }
  return true;
}

export class MarkerLayer {
  private readonly entries = new Map<string, Entry>();
  private destroyed = false;

  constructor(
    private readonly api: MapsApi,
    private readonly map: google.maps.Map,
    private readonly doc: Document,
  ) {}

  /** Draw exactly these tractors: add the new, move + repaint the known, remove the rest. */
  sync(tractors: readonly LayerTractor[]): void {
    if (this.destroyed) return;
    const seen = new Set<string>();
    for (const t of tractors) {
      seen.add(t.id);
      const target = { lat: t.lat, lng: t.lng };
      const entry = this.entries.get(t.id);
      if (!entry) {
        const content = createMarkerContent(this.doc, t);
        const marker = new this.api.AdvancedMarkerElement({
          map: this.map,
          position: target,
          content,
          title: t.caption,
          // Fresh tractors draw over quiet ones.
          zIndex: t.stale ? 1 : 2,
        });
        this.entries.set(t.id, { marker, content, shown: target, target, frame: null });
        continue;
      }
      paintMarkerContent(entry.content, t);
      entry.marker.title = t.caption;
      entry.marker.zIndex = t.stale ? 1 : 2;
      if (entry.target.lat !== target.lat || entry.target.lng !== target.lng) {
        this.moveTo(entry, target);
      }
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.cancel(entry);
      entry.marker.map = null;
      this.entries.delete(id);
    }
  }

  /** Frame these tractors; a single one gets a fixed street-level zoom. */
  fit(tractors: readonly LatLng[]): void {
    if (this.destroyed || tractors.length === 0) return;
    const first = tractors[0];
    if (tractors.length === 1 && first) {
      this.map.setCenter({ lat: first.lat, lng: first.lng });
      this.map.setZoom(SINGLE_TRACTOR_ZOOM);
      return;
    }
    const bounds = new this.api.LatLngBounds();
    for (const t of tractors) bounds.extend({ lat: t.lat, lng: t.lng });
    this.map.fitBounds(bounds, FIT_PADDING_PX);
  }

  destroy(): void {
    this.destroyed = true;
    for (const entry of this.entries.values()) {
      this.cancel(entry);
      entry.marker.map = null;
    }
    this.entries.clear();
  }

  private cancel(entry: Entry): void {
    if (entry.frame !== null) {
      cancelAnimationFrame(entry.frame);
      entry.frame = null;
    }
  }

  private moveTo(entry: Entry, target: LatLng): void {
    this.cancel(entry);
    entry.target = target;
    const from = entry.shown;
    const far =
      Math.abs(target.lat - from.lat) > MAX_TWEEN_DEGREES ||
      Math.abs(target.lng - from.lng) > MAX_TWEEN_DEGREES;
    if (far || !canAnimate()) {
      entry.shown = target;
      entry.marker.position = target;
      return;
    }
    let startedAt: number | null = null;
    const step = (now: number): void => {
      entry.frame = null;
      if (this.destroyed) return;
      if (startedAt === null) startedAt = now;
      const t = Math.min(1, (now - startedAt) / TWEEN_MS);
      const k = easeInOut(t);
      entry.shown = {
        lat: from.lat + (target.lat - from.lat) * k,
        lng: from.lng + (target.lng - from.lng) * k,
      };
      entry.marker.position = entry.shown;
      if (t < 1) entry.frame = requestAnimationFrame(step);
    };
    entry.frame = requestAnimationFrame(step);
  }
}
