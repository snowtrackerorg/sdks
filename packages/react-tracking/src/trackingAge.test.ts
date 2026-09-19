import { describe, expect, it } from 'vitest';

import {
  ageMs,
  DROP_AFTER_MS,
  isDropped,
  isStale,
  serverNowMs,
  STALE_AFTER_MS,
} from './trackingAge.js';

const AS_OF = '2026-12-01T10:00:00Z';
const NOW = Date.parse(AS_OF);
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('tracking age rules', () => {
  it('dims after 2 minutes and drops after 15', () => {
    expect(STALE_AFTER_MS).toBe(120_000);
    expect(DROP_AFTER_MS).toBe(900_000);
    expect(isStale(at(119_000), NOW)).toBe(false);
    expect(isStale(at(120_000), NOW)).toBe(true);
    expect(isDropped(at(899_000), NOW)).toBe(false);
    expect(isDropped(at(900_000), NOW)).toBe(true);
  });

  it('reads unparseable and future timestamps as fresh', () => {
    expect(ageMs('not a date', NOW)).toBe(0);
    expect(ageMs(at(-60_000), NOW)).toBe(0);
    expect(isStale('not a date', NOW)).toBe(false);
  });

  it("measures against the server's clock, carried forward by local elapsed time only", () => {
    // The viewer's wall clock is a year out; only the 30 s that passed since
    // the snapshot arrived may count.
    const receivedAt = Date.parse('2027-12-01T10:00:00Z');
    expect(serverNowMs(AS_OF, receivedAt, receivedAt + 30_000)).toBe(NOW + 30_000);
    // A local clock that stepped backwards never makes the server's clock run backwards.
    expect(serverNowMs(AS_OF, receivedAt, receivedAt - 5_000)).toBe(NOW);
  });

  it('treats an unreadable as_of as "everything is fresh" rather than hiding the fleet', () => {
    const now = serverNowMs('garbage', 0, 0);
    expect(isStale(at(3_600_000), now)).toBe(false);
    expect(isDropped(at(3_600_000), now)).toBe(false);
  });
});
