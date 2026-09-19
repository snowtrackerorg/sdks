# @snowtrackerpro/sdk-core

## 0.5.0

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

## 0.4.0

### Minor Changes

- 8c724f1: `referral_source` gains two options, `billboard` ("Billboard") and `flyer` ("Flyer"), mirroring the ops-api catalog. `ReferralSource` widens accordingly.

## 0.3.0

### Minor Changes

- 8562d21: Lead catalog v2: two dynamic select fields, `driveway_type` and `driveway_size`, whose options are the tenant's own driveway-type price list and named size tiers. They arrive only in the served form schema (a tenant with nothing configured does not get the field), the value is the tenant row's id, and it binds straight onto the property when the lead converts. Render them from the schema's `options`, never from a hardcoded list.

## 0.2.0

### Minor Changes

- c22ef53: `validateLead`: the address invariant is per-form-kind — address stays required for `kind: 'quote'` schemas but is now optional on `kind: 'contact'` schemas (a provided address still validates for shape and byte caps). A schema without `kind` keeps the stricter quote behaviour, matching the server's default kind. New exported `ValidatableSchema` type describes the schema shape `validateLead` accepts.

  This is a validation relaxation, mirroring the same server-side change: older 0.1.x clients remain compatible — they are merely stricter than the server (they still require an address on contact forms, which the server continues to accept).

## 0.1.0

### Minor Changes

- c62d580: Leads module: form schema, lead submission, typed field catalog, client-side validation.

  - `LEAD_FIELDS` — the typed mirror of the canonical field catalog (keys, types, enum
    values, length caps), pinned against the server by committed contract fixtures.
  - `client.getFormSchema({ formId } | { kind })` — the tenant's form schema (merged
    catalog ⊗ config fields, branding, captcha block, signed submission token).
  - `client.submitLead({ formId, fields, extra?, website?, token })` — submits a lead;
    422 maps to `validation_error` carrying per-field `fieldErrors`, 429 to
    `rate_limited` carrying `retryAfter`.
  - `validateLead(schema, fields)` / `validateExtra(extra)` — pure client-side
    pre-validation mirroring the server's rules (required fields, enum membership,
    byte-accurate length caps, composite address, `extra` escape-hatch caps).
  - `LEAD_LIMITS` — the contract's numeric caps (address/custom/extra, token age
    window), pinned by the contract fixtures like the catalog itself.

## 0.0.1

### Patch Changes

- acfcfeb: Initial release: `createClient` with publishable-key auth and `getTenant()`.
