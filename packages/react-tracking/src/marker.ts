// What a tractor looks like on the map — the same round badge, vehicle glyph
// and caption the SnowTracker ops app draws, plus the route's colour as a ring
// and an arrow for the heading. Pure DOM, no Maps API, no React.
//
// When the driver picked their own icon (iconUrl, ENG-173) the marker is that
// image instead, centred on the fix — no badge circle, no pointer, no heading arrow,
// and the image is never rotated. If the image fails to load, the marker goes
// back to the glyph for that URL.
import { BROKE_DOWN_BADGE_SVG, vehicleIconSvg } from './vehicleIcons.js';

export interface MarkerPaint {
  /** The vehicle's name, already suffixed with its age when stale. */
  caption: string;
  icon: string;
  /** The driver's own icon (an http(s) PNG URL), or null for the `icon` glyph. */
  iconUrl?: string | null;
  /** Route colour for the ring; null falls back to the default navy. */
  ringColor: string | null;
  headingDeg: number | null;
  stale: boolean;
  /** The driver has the tractor marked broke down: a red wrench on the badge's shoulder. */
  brokeDown: boolean;
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
  const wrench = doc.createElement('div');
  wrench.className = 'stp-lt-marker__broke-down';
  wrench.innerHTML = BROKE_DOWN_BADGE_SVG; // our own constant SVG, never API text
  wrench.hidden = true;
  root.append(heading, badge, wrench, label);
  paintMarkerContent(root, paint);
  return root;
}

/** The last paint each marker got — what an image error repaints with. */
const lastPaint = new WeakMap<HTMLElement, MarkerPaint>();

export function paintMarkerContent(root: HTMLElement, paint: MarkerPaint): void {
  lastPaint.set(root, paint);
  root.classList.toggle('stp-lt-marker--quiet', paint.stale);
  root.classList.toggle('stp-lt-marker--broke-down', paint.brokeDown);
  const wrench = root.querySelector<HTMLElement>('.stp-lt-marker__broke-down');
  if (wrench) wrench.hidden = !paint.brokeDown;
  // Set through the CSSOM: an unparseable colour is simply ignored, so a bad
  // value from the API can never inject CSS.
  if (paint.ringColor) root.style.setProperty('--stp-lt-ring', paint.ringColor);
  else root.style.removeProperty('--stp-lt-ring');

  const badge = root.querySelector<HTMLElement>('.stp-lt-marker__badge');
  const url = paint.iconUrl ?? null;
  // A URL that already failed in this marker is not retried on every poll.
  const useImage = url !== null && root.dataset.iconFailed !== url;
  root.classList.toggle('stp-lt-marker--custom', useImage);
  if (badge) {
    const key = useImage ? `url:${url}` : `glyph:${paint.icon}`;
    if (badge.dataset.icon !== key) {
      badge.dataset.icon = key;
      if (useImage) {
        const img = root.ownerDocument.createElement('img');
        img.className = 'stp-lt-marker__img';
        // Decorative: the caption beside it already names the vehicle.
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.addEventListener('error', () => {
          // Only if this image is still the one being shown.
          if (badge.dataset.icon !== key) return;
          root.dataset.iconFailed = url;
          paintMarkerContent(root, lastPaint.get(root) ?? paint);
        });
        img.src = url; // set as a property, never as markup
        badge.replaceChildren(img);
      } else {
        badge.innerHTML = vehicleIconSvg(paint.icon); // our own constant SVG, never API text
      }
    }
  }

  const label = root.querySelector<HTMLElement>('.stp-lt-marker__label');
  if (label && label.textContent !== paint.caption) label.textContent = paint.caption;

  const heading = root.querySelector<HTMLElement>('.stp-lt-marker__heading');
  if (heading) {
    const deg = paint.headingDeg;
    const known = typeof deg === 'number' && Number.isFinite(deg);
    // A picked icon is drawn as the office drew it: no heading arrow.
    heading.hidden = !known || useImage;
    if (known) heading.style.transform = `rotate(${deg}deg)`;
  }
}
