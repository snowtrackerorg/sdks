---
'@snowtrackerpro/sdk-core': minor
'@snowtrackerpro/sdk-tracking-react': minor
---

Live tracking.

**`@snowtrackerpro/sdk-core`**

- `client.getTracking({ signal? })` — the business's public live map (`GET /v1/sdk/tracking`):
  every saved route and the tractors out on one right now, as a typed `TrackingSnapshot`
  (`TrackingRoute`, `TrackingTractor`). A tractor carries a vehicle name only — nothing
  about the driver. Measure a fix's age against the snapshot's `asOf`, not the viewer's clock.
- New error code `tracking_unavailable` (status 404): the business has not switched on its
  public live map. It is a state to render, not a fault. Other endpoints keep `not_found`.
- Fix: a 429 with a missing or unreadable `Retry-After` header used to produce
  `retryAfter: 0`, which a client honouring it reads as "retry immediately". `retryAfter`
  is now left `undefined` in that case. HTTP-date values are understood as well as
  delay-seconds.

**`@snowtrackerpro/sdk-tracking-react`** — introduced. `<LiveTracker>`: a drop-in Google
map of the tractors that are out, with a native route filter (All tractors + every saved
route), vehicle-icon markers ringed in the route's colour with a heading arrow, smooth
movement between 10-second polls, dimming after 2 minutes of silence and removal after 15,
calm empty / not-available states, and every string overridable. You bring your own Google
Maps API key (and Map ID); SnowTracker never ships or proxies one. Marked `'use client'`,
so it renders straight from a Next.js Server Component. React ≥ 18.
