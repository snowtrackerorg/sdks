# @snowtrackerpro/sdk-tracking-react

## 0.1.1

### Patch Changes

- e2fe62f: A tractor whose driver has marked it broke down is now drawn with a red wrench on its marker and "Broke down" in its caption (`labels.brokeDown` to translate). `TrackingTractor` gains `status: 'on_route' | 'broke_down'` (new type `TrackingTractorStatus`); a server that sends no status reads as `on_route`.
- df266dc: The publishable key now decides the environment. A staging key (`pk_live_stg_…` / `pk_test_stg_…`) talks to `https://api.staging.snowtracker.pro`; any other key talks to `https://api.snowtracker.pro`. `baseUrl` becomes an override rather than a requirement. New exports from `@snowtrackerpro/sdk-core`: `resolveBaseUrl(publishableKey, baseUrl?)` and `API_BASE_URLS`.
- 4a23466: A tractor can carry the icon its driver picked. `TrackingTractor` gains `iconUrl: string | null` (an http(s) URL of a small PNG; anything else, or an older API that omits `icon_url`, reads as null). `<LiveTracker>` draws that image centred on the tractor's position, without the heading arrow, and falls back to the preset glyph from `icon` when there is no URL or the image fails to load. A broke-down tractor keeps the red wrench badge, drawn over the picked image.
- Updated dependencies [e2fe62f]
- Updated dependencies [df266dc]
- Updated dependencies [4a23466]
  - @snowtrackerpro/sdk-core@0.6.0

## 0.1.0

### Minor Changes

- 83298b5: Live tracking.

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

### Patch Changes

- Updated dependencies [83298b5]
  - @snowtrackerpro/sdk-core@0.5.0
