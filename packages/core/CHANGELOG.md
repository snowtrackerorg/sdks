# @snowtrackerpro/sdk-core

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
