# @snowtrackerpro/sdk-forms-react

Headless React hook for [SnowTracker.pro](https://snowtracker.pro) quote & contact forms.
You keep your own markup, styling, and component library — the hook supplies the form
schema, state, validation, and submission. React ≥ 18, no other runtime dependencies
beyond `@snowtrackerpro/sdk-core`.

## Install

```sh
npm install @snowtrackerpro/sdk-forms-react @snowtrackerpro/sdk-core
```

## Replace a custom quote form

```tsx
import { createClient, useSnowTrackerForm } from '@snowtrackerpro/sdk-forms-react';

const client = createClient({ publishableKey: 'pk_live_…' });

export function QuoteForm() {
  const {
    schema,
    status,
    getString,
    setValue,
    errors,
    submitting,
    submitted,
    error,
    clearError,
    retry,
    submit,
  } = useSnowTrackerForm({
    client,
    kind: 'quote', // or formId: 'form_…' for a specific form
    onSuccess: ({ submissionId }) => console.log('lead received', submissionId),
  });

  if (submitted) return <p>Thanks — we’ll be in touch.</p>;
  if (status === 'load_error')
    return (
      <p role="alert">
        Couldn’t load the form. <button onClick={retry}>Try again</button>
      </p>
    );
  if (status === 'loading' || !schema) return <p>Loading…</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {schema.fields.map((field) => (
        <label key={field.key}>
          {field.label}
          {field.type === 'select' ? (
            <select
              value={getString(field.key)}
              onChange={(e) => setValue(field.key, e.target.value)}
            >
              <option value="">—</option>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={getString(field.key)}
              onChange={(e) => setValue(field.key, e.target.value)}
            />
          )}
          {errors[field.key] && <span role="alert">{errors[field.key]}</span>}
        </label>
      ))}

      {/* Honeypot — keep it hidden; bots fill it, humans never see it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        value={getString('website')}
        onChange={(e) => setValue('website', e.target.value)}
      />

      {error && (
        <p role="alert">
          {error.message}{' '}
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}
      <button disabled={status !== 'ready' || submitting}>Request a quote</button>
    </form>
  );
}
```

`submit()` pre-validates client-side (required fields, enum membership, byte-length
caps — the same rules the server enforces) and puts messages in `errors`, keyed by
field key. Server-side 422s land in `errors` the same way; failures with no field to
point at (rate limit, network, token, captcha) land in `error`. **`submit()` is a no-op
until `status === 'ready'`** — disable the button on `status !== 'ready'`.

`getString(key)` returns the current value as a string (`''` when unset, or when the
value is an address-parts object) so text inputs need no `typeof` guards. Consumers
with fully hardcoded markup can render canonical enum labels from
`LEAD_FIELDS[key].optionLabels` (re-exported from this package).

## Server invariants — read this before hiding fields

The server requires on **every** lead, regardless of tenant configuration or overrides:

- `name`
- `email` **or** `phone` (one of them)

The `address` invariant is **per form kind**: contact forms don't require an address;
quote forms do. A quote submission lands as a CRM prospect property, so `address` is
mandatory on `kind: 'quote'` forms. On `kind: 'contact'` forms it is optional — when a
value is provided it is still validated for shape and length, but leaving it out (or
hiding the field) is fine.

Hiding `name`, both `email` and `phone`, or — on a quote form — `address` with
`overrides.hideFields` without setting the value programmatically
(`setValue('address', …)`) guarantees failed submissions; the hook logs a dev-time
`console.warn` when it sees those combinations (the `address` warning fires only for
quote-kind schemas).

## CAPTCHA

When the tenant has Turnstile switched on, `schema.captcha` is `{ provider, sitekey }`
(otherwise `null`). Render the challenge with the sitekey and pass the response token
through submit:

```ts
await submit({ captchaToken });
```

The server verifies it; a missing/failed token surfaces in `error`
(`captcha_token: required`).

## Customization — three escalating tiers

1. **Zero-config.** Call the hook with just `client` (+ `kind` or `formId`) and render
   `schema.fields` verbatim: field set, order, labels, and required flags come from the
   tenant's **Settings → Website Forms** configuration and work on day one.

2. **Pinned / overridden.** The fetched config is a _default_, not an authority:

   ```ts
   import pinned from './snowtracker-form.snapshot.json'; // a saved getFormSchema() result

   useSnowTrackerForm({
     client,
     overrides: {
       pinnedSchema: pinned, // skip the fetch — the local snapshot wins
       hideFields: ['referral_source'],
       labels: { message: 'Anything we should know about the property?' },
       extraFields: [
         { key: 'urgency', type: 'select', label: 'When?', required: false, maxLen: 32 },
       ],
     },
   });
   ```

   **The contract: code outranks config.** Overrides — and above all a pinned schema —
   are applied locally, so a Settings edit never mutates a deployed, QA'd page. A
   developer-built form never changes shape because a tenant clicked a checkbox.
   Overrides are **captured at mount** — inline object literals are safe, and later
   changes to the object are ignored for the lifetime of the hook.

   With `pinnedSchema` the _shape_ is entirely yours; the hook still mints a fresh
   submission token in the background at mount (snapshot tokens expire after 24h) and
   waits out the server's 3-second minimum token age before posting, so instant
   submits don't bounce.

   `extraFields` notes: a key that already exists in the schema replaces that field in
   place. Catalog keys (fields the tenant toggled off) and tenant-defined `custom:…`
   keys submit as regular fields; any other key is submitted under the bounded `extra`
   object (≤10 keys, ≤1KB each, archived verbatim on the submission), because the
   server rejects unknown field keys with a 422.

3. **Fully headless.** Everything above already is — there is no rendered component in
   this package. If you want to skip the hook too, `@snowtrackerpro/sdk-core` exposes
   `getFormSchema()`, `validateLead()`, and `submitLead()` directly.

## Authentication

Requests authenticate with a **publishable key** (`pk_live_…` / `pk_test_…`) from
**Settings → Publishable Keys**, restricted to the origins you allowlist. Submitting
leads requires the `quotes:create` scope on the key.

## License

[MIT](./LICENSE)
