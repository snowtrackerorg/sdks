// Vehicle-icon presets, copied from the SnowTracker ops app so a tractor looks
// the same on a customer's website as it does in the office.
//
// Framework-free: plain data + a pure lookup. Presets are inline 24x24 SVG
// strings drawn from the Lucide icon set (ISC licence). They stroke with
// `currentColor`, so the marker tints them through CSS `color`.

// Wrap Lucide path bodies in a consistent 24x24 stroke SVG.
function svg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

// Lucide "tractor".
const TRACTOR = svg(
  '<path d="m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20"/>' +
    '<path d="M16 18h-5"/>' +
    '<path d="M18 5a1 1 0 0 0-1 1v5.573"/>' +
    '<path d="M3 4h8.129a1 1 0 0 1 .99.863L13 11.246"/>' +
    '<path d="M4 11V4"/>' +
    '<path d="M7 15h.01"/>' +
    '<path d="M8 10.1V4"/>' +
    '<circle cx="18" cy="18" r="2"/>' +
    '<circle cx="7" cy="15" r="5"/>',
);

// Lucide "truck" — used for both the plow-truck and plain truck presets.
const TRUCK = svg(
  '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>' +
    '<path d="M15 18H9"/>' +
    '<path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>' +
    '<circle cx="17" cy="18" r="2"/>' +
    '<circle cx="7" cy="18" r="2"/>',
);

// Lucide "car-front" — a lighter vehicle.
const PICKUP = svg(
  '<path d="M21 8L18.74 5.45A2 2 0 0 0 17.24 4H6.76a2 2 0 0 0-1.5.66L3 8"/>' +
    '<path d="M7 14h.01"/>' +
    '<path d="M17 14h.01"/>' +
    '<rect width="18" height="8" x="3" y="10" rx="2"/>' +
    '<path d="M5 18v2"/>' +
    '<path d="M19 18v2"/>',
);

// Lucide "snowflake".
const SNOWFLAKE = svg(
  '<path d="m10 20-1.25-2.5L6 18"/>' +
    '<path d="M10 4 8.75 6.5 6 6"/>' +
    '<path d="m14 20 1.25-2.5L18 18"/>' +
    '<path d="m14 4 1.25 2.5L18 6"/>' +
    '<path d="m17 21-3-6h-4"/>' +
    '<path d="m17 3-3 6 1.5 3"/>' +
    '<path d="M2 12h6.5L10 9"/>' +
    '<path d="m20 10-1.5 2 1.5 2"/>' +
    '<path d="M22 12h-6.5L14 15"/>' +
    '<path d="m4 10 1.5 2L4 14"/>' +
    '<path d="m7 21 3-6-1.5-3"/>' +
    '<path d="m7 3 3 6h4"/>',
);

// Lucide "wind" — stands in for a snow blower.
const BLOWER = svg(
  '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/>' +
    '<path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/>' +
    '<path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
);

// Lucide "fan" — stands in for a lawn mower.
const MOWER = svg(
  '<path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"/>' +
    '<path d="M12 12v.01"/>',
);

// Lucide "wrench" — mechanic / repair vehicle.
const WRENCH = svg(
  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
);

/** Preset key → inline SVG. Keys match the ops app's vehicle icon presets. */
export const VEHICLE_ICON_SVG: Readonly<Record<string, string>> = {
  tractor: TRACTOR,
  'plow-truck': TRUCK,
  truck: TRUCK,
  pickup: PICKUP,
  snowflake: SNOWFLAKE,
  blower: BLOWER,
  mower: MOWER,
  wrench: WRENCH,
};

export const DEFAULT_VEHICLE_ICON_KEY = 'tractor';

/**
 * The SVG for a preset key. An unknown key — a preset added server-side after
 * this package shipped — draws the default tractor: that is what the fleet is.
 */
export function vehicleIconSvg(key: string | null | undefined): string {
  if (key && Object.prototype.hasOwnProperty.call(VEHICLE_ICON_SVG, key)) {
    return VEHICLE_ICON_SVG[key] ?? TRACTOR;
  }
  return TRACTOR;
}
