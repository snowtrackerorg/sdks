// What a tractor looks like on the map — the same round badge, vehicle glyph
// and caption the SnowTracker ops app draws, plus the route's colour as a ring
// and an arrow for the heading. Pure DOM, no Maps API, no React.
import { vehicleIconSvg } from './vehicleIcons.js';

export interface MarkerPaint {
  /** The vehicle's name, already suffixed with its age when stale. */
  caption: string;
  icon: string;
  /** Route colour for the ring; null falls back to the default navy. */
  ringColor: string | null;
  headingDeg: number | null;
  stale: boolean;
}

// The marker content is a ZERO-SIZE anchor: AdvancedMarkerElement pins the
// content's bottom-centre to the coordinate, so a 0×0 root puts the coordinate
// exactly at the origin. The badge sits just above the origin with a small
// pointer down to it and the caption hangs to the right — neither contributes
// to the anchor box, so the pointer's tip is the GPS fix at every zoom level.
export function createMarkerContent(doc: Document, paint: MarkerPaint): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'stp-lt-marker';
  const heading = doc.createElement('div');
  heading.className = 'stp-lt-marker__heading';
  const badge = doc.createElement('div');
  badge.className = 'stp-lt-marker__badge';
  const label = doc.createElement('div');
  label.className = 'stp-lt-marker__label';
  root.append(heading, badge, label);
  paintMarkerContent(root, paint);
  return root;
}

export function paintMarkerContent(root: HTMLElement, paint: MarkerPaint): void {
  root.classList.toggle('stp-lt-marker--quiet', paint.stale);
  // Set through the CSSOM: an unparseable colour is simply ignored, so a bad
  // value from the API can never inject CSS.
  if (paint.ringColor) root.style.setProperty('--stp-lt-ring', paint.ringColor);
  else root.style.removeProperty('--stp-lt-ring');

  const badge = root.querySelector<HTMLElement>('.stp-lt-marker__badge');
  if (badge && badge.dataset.icon !== paint.icon) {
    badge.dataset.icon = paint.icon;
    badge.innerHTML = vehicleIconSvg(paint.icon); // our own constant SVG, never API text
  }

  const label = root.querySelector<HTMLElement>('.stp-lt-marker__label');
  if (label && label.textContent !== paint.caption) label.textContent = paint.caption;

  const heading = root.querySelector<HTMLElement>('.stp-lt-marker__heading');
  if (heading) {
    const deg = paint.headingDeg;
    const known = typeof deg === 'number' && Number.isFinite(deg);
    heading.hidden = !known;
    if (known) heading.style.transform = `rotate(${deg}deg)`;
  }
}
