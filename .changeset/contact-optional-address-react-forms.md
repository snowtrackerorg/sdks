---
'@snowtrackerpro/sdk-forms-react': minor
---

Per-form-kind address invariant: the dev-time `console.warn` for `overrides.hideFields` including `address` now fires only for quote-kind schemas — contact forms no longer require an address server-side, so hiding it there is fine. The warning now fires once the form's kind is known (immediately for pinned schemas, after the schema fetch otherwise). Pulls in `@snowtrackerpro/sdk-core` 0.2.0 for the relaxed `validateLead`, so contact submissions without an address pass client-side pre-validation.

This is a validation relaxation: older 0.1.x clients remain compatible — they are merely stricter than the server (they still require an address on contact forms, which the server continues to accept).
