import { describe, expect, it } from 'vitest';

import { createMarkerContent, paintMarkerContent, type MarkerPaint } from './marker.js';

const FROSTY = 'https://images.snowtracker.pro/tenants/t/tractor-icons/frosty.png';

const paint = (over: Partial<MarkerPaint> = {}): MarkerPaint => ({
  caption: 'Tractor 4',
  icon: 'tractor',
  iconUrl: null,
  ringColor: '#208aef',
  headingDeg: 90,
  stale: false,
  brokeDown: false,
  ...over,
});

const badgeOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.stp-lt-marker__badge')!;
const headingOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('.stp-lt-marker__heading')!;

describe('marker content — the driver’s own icon (ENG-173)', () => {
  it('draws the glyph and the heading arrow when there is no icon URL', () => {
    const root = createMarkerContent(document, paint());
    expect(badgeOf(root).querySelector('svg')).not.toBeNull();
    expect(badgeOf(root).querySelector('img')).toBeNull();
    expect(root.classList.contains('stp-lt-marker--custom')).toBe(false);
    expect(headingOf(root).hidden).toBe(false);
  });

  it('treats an older API’s missing iconUrl as no icon', () => {
    const older: MarkerPaint = paint();
    delete older.iconUrl;
    const root = createMarkerContent(document, older);
    expect(badgeOf(root).querySelector('svg')).not.toBeNull();
  });

  it('draws the picked image instead, centred, with no heading arrow and no rotation', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY }));
    const img = badgeOf(root).querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(FROSTY);
    expect(img?.alt).toBe('');
    expect(img?.style.transform).toBe('');
    expect(badgeOf(root).querySelector('svg')).toBeNull();
    expect(root.classList.contains('stp-lt-marker--custom')).toBe(true);
    expect(headingOf(root).hidden).toBe(true);
    // The caption is still there, naming the vehicle.
    expect(root.querySelector('.stp-lt-marker__label')?.textContent).toBe('Tractor 4');
  });

  it('keeps the same <img> across repaints of the same URL', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY }));
    const first = badgeOf(root).querySelector('img');
    paintMarkerContent(root, paint({ iconUrl: FROSTY, caption: 'Tractor 4 · 3 min ago' }));
    expect(badgeOf(root).querySelector('img')).toBe(first);
  });

  it('switches between image and glyph as the pick changes', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY }));
    paintMarkerContent(root, paint({ iconUrl: null }));
    expect(badgeOf(root).querySelector('svg')).not.toBeNull();
    expect(root.classList.contains('stp-lt-marker--custom')).toBe(false);
    expect(headingOf(root).hidden).toBe(false);
    paintMarkerContent(root, paint({ iconUrl: FROSTY }));
    expect(badgeOf(root).querySelector('img')).not.toBeNull();
  });

  it('falls back to the glyph when the image fails, and does not retry that URL', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY }));
    // A repaint between load start and the error: the fallback uses the latest caption.
    paintMarkerContent(root, paint({ iconUrl: FROSTY, caption: 'Tractor 4 · 2 min ago' }));
    badgeOf(root).querySelector('img')!.dispatchEvent(new Event('error'));
    expect(badgeOf(root).querySelector('img')).toBeNull();
    expect(badgeOf(root).querySelector('svg')).not.toBeNull();
    expect(root.querySelector('.stp-lt-marker__label')?.textContent).toBe('Tractor 4 · 2 min ago');
    paintMarkerContent(root, paint({ iconUrl: FROSTY }));
    expect(badgeOf(root).querySelector('img')).toBeNull();
    // A different URL is tried.
    paintMarkerContent(root, paint({ iconUrl: FROSTY.replace('frosty', 'other') }));
    expect(badgeOf(root).querySelector('img')).not.toBeNull();
  });

  it('never parses the URL as markup', () => {
    const evil = 'https://x.example/a.png"><script>alert(1)</script>';
    const root = createMarkerContent(document, paint({ iconUrl: evil }));
    expect(root.querySelector('script')).toBeNull();
    expect(badgeOf(root).querySelector('img')?.getAttribute('src')).toBe(evil);
  });
});

describe('marker content — broke down over a picked icon (ENG-170 + ENG-173)', () => {
  const wrenchOf = (root: HTMLElement) =>
    root.querySelector<HTMLElement>('.stp-lt-marker__broke-down')!;

  it('draws the picked image with the wrench badge over it', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY, brokeDown: true }));
    expect(badgeOf(root).querySelector('img')?.getAttribute('src')).toBe(FROSTY);
    expect(wrenchOf(root).hidden).toBe(false);
    expect(wrenchOf(root).querySelector('svg')).not.toBeNull();
    expect(root.classList.contains('stp-lt-marker--custom')).toBe(true);
    expect(root.classList.contains('stp-lt-marker--broke-down')).toBe(true);
    // Later in the DOM than the image, so it paints on top of it.
    expect(badgeOf(root).compareDocumentPosition(wrenchOf(root)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('drops the wrench when he is back on the road, keeping the image', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY, brokeDown: true }));
    const img = badgeOf(root).querySelector('img');
    paintMarkerContent(root, paint({ iconUrl: FROSTY, brokeDown: false }));
    expect(wrenchOf(root).hidden).toBe(true);
    expect(badgeOf(root).querySelector('img')).toBe(img);
  });

  it('keeps the wrench when the image fails and the glyph comes back', () => {
    const root = createMarkerContent(document, paint({ iconUrl: FROSTY, brokeDown: true }));
    badgeOf(root).querySelector('img')!.dispatchEvent(new Event('error'));
    expect(badgeOf(root).querySelector('svg')).not.toBeNull();
    expect(wrenchOf(root).hidden).toBe(false);
  });
});
