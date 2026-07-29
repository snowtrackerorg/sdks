---
'@snowtrackerpro/sdk-core': minor
---

`validateLead`: the address invariant is per-form-kind — address stays required for `kind: 'quote'` schemas but is now optional on `kind: 'contact'` schemas (a provided address still validates for shape and byte caps). A schema without `kind` keeps the stricter quote behaviour, matching the server's default kind. New exported `ValidatableSchema` type describes the schema shape `validateLead` accepts.

This is a validation relaxation, mirroring the same server-side change: older 0.1.x clients remain compatible — they are merely stricter than the server (they still require an address on contact forms, which the server continues to accept).
