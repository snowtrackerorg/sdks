---
'@snowtrackerpro/sdk-core': minor
---

Leads module: form schema, lead submission, typed field catalog, client-side validation.

- `LEAD_FIELDS` — the typed mirror of the canonical field catalog (keys, types, enum
  values, length caps), pinned against the server by committed contract fixtures.
- `client.getFormSchema({ formId } | { kind })` — the tenant's form schema (merged
  catalog ⊗ config fields, branding, captcha block, signed submission token).
- `client.submitLead({ formId, fields, extra?, website?, token })` — submits a lead;
  422 maps to `validation_error` carrying per-field `fieldErrors`, 429 to
  `rate_limited` carrying `retryAfter`.
- `validateLead(schema, fields)` — pure client-side pre-validation mirroring the
  server's rules (required fields, enum membership, length caps, composite address).
