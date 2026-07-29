# @snowtrackerpro/sdk-forms-react

## 0.2.0

### Minor Changes

- c22ef53: Per-form-kind address invariant: the dev-time `console.warn` for `overrides.hideFields` including `address` now fires only for quote-kind schemas — contact forms no longer require an address server-side, so hiding it there is fine. The warning now fires once the form's kind is known (immediately for pinned schemas, after the schema fetch otherwise). Pulls in `@snowtrackerpro/sdk-core` 0.2.0 for the relaxed `validateLead`, so contact submissions without an address pass client-side pre-validation.

  This is a validation relaxation: older 0.1.x clients remain compatible — they are merely stricter than the server (they still require an address on contact forms, which the server continues to accept).

### Patch Changes

- Updated dependencies [c22ef53]
  - @snowtrackerpro/sdk-core@0.2.0

## 0.1.0

### Minor Changes

- c62d580: Introduce `@snowtrackerpro/sdk-forms-react`: the headless `useSnowTrackerForm()` hook —
  schema fetch (or a pinned local snapshot with background token minting), form state,
  client-side validation, honeypot passthrough, CAPTCHA token pass-through, automatic
  expired-token retry, and lead submission, with code-outranks-config overrides
  (`hideFields`, `labels`, `extraFields`, `pinnedSchema`) captured at mount. React ≥ 18
  as a peer dependency; bring your own markup.

### Patch Changes

- Updated dependencies [c62d580]
  - @snowtrackerpro/sdk-core@0.1.0
