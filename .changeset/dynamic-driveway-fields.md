---
'@snowtrackerpro/sdk-core': minor
---

Lead catalog v2: two dynamic select fields, `driveway_type` and `driveway_size`, whose options are the tenant's own driveway-type price list and named size tiers. They arrive only in the served form schema (a tenant with nothing configured does not get the field), the value is the tenant row's id, and it binds straight onto the property when the lead converts. Render them from the schema's `options`, never from a hardcoded list.
