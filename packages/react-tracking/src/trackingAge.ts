// Age rules for a tractor's position, ported from the SnowTracker ops app.
//
// The API carries positions and nothing else — there is no "went home" frame —
// so silence is the only signal that a tractor has stopped. Two rules turn that
// silence into something honest:
//
//   * a fix older than STALE_AFTER_MS is drawn dimmed and captioned with its
//     age, because a tractor that stopped reporting is not a tractor at that spot;
//   * a fix older than DROP_AFTER_MS is not drawn at all — a parked ghost is
//     worse than nothing.
//
// Age is measured against the SERVER's clock (the snapshot's `asOf`), never the
// viewer's: a visitor whose laptop clock is ten minutes off must not see every
// tractor greyed out. Between polls the server's "now" is carried forward by
// the time elapsed locally since the snapshot arrived, so a viewer who loses
// their connection still watches the markers age out.
//
// Pure — no DOM — so it stays testable.

/** A fix this old is shown as "not reporting" rather than live. */
export const STALE_AFTER_MS = 2 * 60_000;

/** A fix this old stops being drawn at all. */
export const DROP_AFTER_MS = 15 * 60_000;

/**
 * The server's "now" in epoch ms: the snapshot's `asOf` plus the time elapsed
 * locally since it was received. An unreadable `asOf` yields NaN, which makes
 * every age read as 0 (see `ageMs`) — fresh, rather than wrongly hidden.
 */
export function serverNowMs(asOf: string, receivedAtMs: number, localNowMs: number): number {
  return Date.parse(asOf) + Math.max(0, localNowMs - receivedAtMs);
}

/**
 * Age of a fix in milliseconds. Unparseable or future timestamps read as 0 —
 * a device with a skewed clock shouldn't grey itself out.
 */
export function ageMs(recordedAt: string, serverNow: number): number {
  const t = Date.parse(recordedAt);
  if (Number.isNaN(t) || Number.isNaN(serverNow)) return 0;
  return Math.max(0, serverNow - t);
}

export function isStale(recordedAt: string, serverNow: number): boolean {
  return ageMs(recordedAt, serverNow) >= STALE_AFTER_MS;
}

export function isDropped(recordedAt: string, serverNow: number): boolean {
  return ageMs(recordedAt, serverNow) >= DROP_AFTER_MS;
}
