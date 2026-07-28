# @snowtrackerpro/sdk-core

Core client for the [SnowTracker.pro](https://snowtracker.pro) SDKs. Framework-free, zero runtime dependencies.

## Install

```sh
npm install @snowtrackerpro/sdk-core
```

## Usage

```ts
import { createClient } from '@snowtrackerpro/sdk-core';

const client = createClient({
  publishableKey: 'pk_live_…', // Settings → Publishable Keys in your SnowTracker dashboard
});

const tenant = await client.getTenant();
// { tenantId, tenantName, mode, logoUrl, primaryHex }
```

## Quote / contact forms

Fetch a form schema, validate answers client-side, submit a lead:

```ts
import { createClient, validateLead } from '@snowtrackerpro/sdk-core';

const client = createClient({ publishableKey: 'pk_live_…' });

// The tenant's default quote form ({ kind: 'contact' } and { formId } also work).
const schema = await client.getFormSchema({ kind: 'quote' });

const fields = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  address: '1 Main St, Collingwood', // or { line1, line2, city, region, postal, country }
  driveway_surface: 'gravel', // typed: an invalid value is a compile error
};

const errors = validateLead(schema, fields); // {} when valid, else { fieldKey: message }
if (Object.keys(errors).length === 0) {
  const { submissionId, status } = await client.submitLead({
    formId: schema.id,
    fields,
    token: schema.token, // signed issued-at token from the schema fetch
    website: '', // honeypot — render it hidden and forward the value verbatim
  });
}
```

`LEAD_FIELDS` is the typed catalog of canonical field keys (name, email, phone, address,
driveway_surface, service_type, urgency, referral_source, referral_details, message) with
their types, enum values, and length caps. The catalog is append-only — shipped fields are
never removed, renamed, or retyped — and is pinned against the server by a contract test.
Keys are checked at compile time: `fields: { adress: … }` will not build.

## Authentication

Requests are authenticated with a **publishable key** (`pk_live_…` / `pk_test_…`). Publishable keys are safe to ship in browser code: they identify your SnowTracker account and are restricted to the origins you allowlist in the dashboard. Test-mode keys additionally work from `localhost`. Submitting leads requires the key to carry the `quotes:create` scope.

## Errors

All failures throw `SnowTrackerError` with a stable `code` (`config_error`, `unauthorized`, `forbidden`, `not_found`, `validation_error`, `rate_limited`, `network_error`, `http_error`) and the HTTP `status` (`0` for network failures). `validation_error` (422) carries `fieldErrors` — per-field messages keyed by field key; `rate_limited` (429) carries `retryAfter` in seconds.

## License

[MIT](./LICENSE)
