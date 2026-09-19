import { describe, expect, it } from 'vitest';

import { VEHICLE_ICON_SVG, vehicleIconSvg } from './vehicleIcons.js';

describe('vehicle icon presets', () => {
  it('carries the ops app preset keys', () => {
    expect(Object.keys(VEHICLE_ICON_SVG).sort()).toEqual([
      'blower',
      'mower',
      'pickup',
      'plow-truck',
      'snowflake',
      'tractor',
      'truck',
      'wrench',
    ]);
  });

  it('draws the default tractor for unknown, empty and prototype keys', () => {
    const tractor = VEHICLE_ICON_SVG.tractor;
    expect(vehicleIconSvg('hovercraft')).toBe(tractor);
    expect(vehicleIconSvg('')).toBe(tractor);
    expect(vehicleIconSvg(null)).toBe(tractor);
    expect(vehicleIconSvg('constructor')).toBe(tractor);
    expect(vehicleIconSvg('blower')).toBe(VEHICLE_ICON_SVG.blower);
  });
});
