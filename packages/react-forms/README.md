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
import { createClient, useSnowtrackerForm } from '@snowtrackerpro/sdk-forms-react';

const client = createClient({ publishableKey: 'pk_live_…' });

export function QuoteForm() {
  const { schema, values, setValue, errors, submitting, submitted, error, submit } =
    useSnowtrackerForm({
      client,
      kind: 'quote', // or formId: 'form_…' for a specific form
      onSuccess: ({ submissionId }) => console.log('lead received', submissionId),
    });

  if (submitted) return <p>Thanks — we’ll be in touch.</p>;
  if (!schema) return <p>Loading…</p>;

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
              value={(values[field.key] as string) ?? ''}
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
              value={(values[field.key] as string) ?? ''}
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
        value={(values.website as string) ?? ''}
        onChange={(e) => setValue('website', e.target.value)}
      />

      {error && <p role="alert">{error.message}</p>}
      <button disabled={submitting}>Request a quote</button>
    </form>
  );
}
```

`submit()` pre-validates client-side (required fields, enum membership, length caps —
the same rules the server enforces) and puts messages in `errors`, keyed by field key.
Server-side 422s land in `errors` the same way.

## Customization — three escalating tiers

1. **Zero-config.** Call the hook with just `client` (+ `kind` or `formId`) and render
   `schema.fields` verbatim: field set, order, labels, and required flags come from the
   tenant's **Settings → Website Forms** configuration and work on day one.

2. **Pinned / overridden.** The fetched config is a _default_, not an authority:

   ```ts
   import pinned from './snowtracker-form.snapshot.json'; // a saved getFormSchema() result

   useSnowtrackerForm({
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
   developer-built form never changes shape because a tenant clicked a checkbox. With
   `pinnedSchema` the hook still mints a fresh submission token at submit time (one
   schema fetch) because snapshot tokens expire, but the _shape_ is entirely yours.

   `extraFields` notes: catalog keys (fields the tenant toggled off) and tenant-defined
   `custom:…` keys submit as regular fields; any other key is submitted under the
   bounded `extra` object (≤10 keys, ≤1KB each, archived verbatim on the submission),
   because the server rejects unknown field keys with a 422.

3. **Fully headless.** Everything above already is — there is no rendered component in
   this package. If you want to skip the hook too, `@snowtrackerpro/sdk-core` exposes
   `getFormSchema()`, `validateLead()`, and `submitLead()` directly.

## Authentication

Requests authenticate with a **publishable key** (`pk_live_…` / `pk_test_…`) from
**Settings → Publishable Keys**, restricted to the origins you allowlist. Submitting
leads requires the `quotes:create` scope on the key.

## License

[MIT](./LICENSE)
