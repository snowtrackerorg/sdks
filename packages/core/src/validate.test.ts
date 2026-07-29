import { describe, expect, it } from 'vitest';

import type { FormSchema } from './types.js';
import { validateExtra, validateLead, type ValidatableSchema } from './validate.js';

// A representative merged schema: seeded quote-form fields plus one tenant
// custom select, as GET /v1/sdk/forms returns them.
const schema: ValidatableSchema = {
  kind: 'quote',
  fields: [
    { key: 'name', type: 'text', label: 'Full name', required: true, maxLen: 200 },
    { key: 'email', type: 'email', label: 'Email', required: true, maxLen: 254 },
    { key: 'phone', type: 'phone', label: 'Phone', required: true, maxLen: 30 },
    { key: 'address', type: 'text', label: 'Property address', required: true, maxLen: 300 },
    {
      key: 'driveway_surface',
      type: 'select',
      label: 'Driveway surface',
      required: false,
      maxLen: 32,
      options: [
        { value: 'paved', label: 'Paved' },
        { value: 'gravel', label: 'Gravel' },
      ],
    },
    { key: 'message', type: 'textarea', label: 'Message', required: false, maxLen: 2000 },
    {
      key: 'custom:sidewalk',
      type: 'select',
      label: 'Clear the sidewalk?',
      required: false,
      maxLen: 500,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
  ],
};

// The seeded contact form as the server serves it: same identity fields,
// but address is present with required:false (the per-kind invariant).
const contactSchema: ValidatableSchema = {
  kind: 'contact',
  fields: [
    { key: 'name', type: 'text', label: 'Full name', required: true, maxLen: 200 },
    { key: 'email', type: 'email', label: 'Email', required: true, maxLen: 254 },
    { key: 'phone', type: 'phone', label: 'Phone', required: true, maxLen: 30 },
    { key: 'address', type: 'text', label: 'Address', required: false, maxLen: 300 },
    { key: 'message', type: 'textarea', label: 'Message', required: false, maxLen: 2000 },
  ],
};

const valid = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '705 555 0101',
  address: '1 Main St, Collingwood',
} as const;

describe('validateLead', () => {
  it('passes a complete valid submission', () => {
    expect(validateLead(schema, valid)).toEqual({});
  });

  it('requires fields the schema marks required', () => {
    expect(validateLead(schema, { ...valid, name: '  ' })).toEqual({ name: 'required' });
  });

  it('enforces the email-or-phone invariant on the email key', () => {
    expect(validateLead(schema, { ...valid, email: '', phone: '' })).toEqual({
      email: 'email or phone is required',
    });
  });

  it('accepts phone-only even though the seeded schema marks email required', () => {
    expect(validateLead(schema, { ...valid, email: '' })).toEqual({});
  });

  it('enforces the name and address invariants even when the schema omits them', () => {
    const bare: Pick<FormSchema, 'fields'> = { fields: [] };
    // No `kind` on the schema — treated as quote (the server's default kind
    // and the stricter side), so the address invariant still applies.
    expect(validateLead(bare, { email: 'jane@example.com' })).toEqual({
      name: 'required',
      address: 'required',
    });
  });

  it('requires an address on quote schemas (per-kind invariant)', () => {
    const noAddress = { name: valid.name, email: valid.email, phone: valid.phone };
    expect(validateLead(schema, noAddress)).toEqual({ address: 'required' });
  });

  it('accepts a contact submission without an address', () => {
    const noAddress = { name: valid.name, email: valid.email, phone: valid.phone };
    expect(validateLead(contactSchema, noAddress)).toEqual({});
  });

  it('still validates a provided address on contact schemas (format and caps)', () => {
    // Over-cap part.
    expect(validateLead(contactSchema, { ...valid, address: { line1: 'x'.repeat(201) } })).toEqual({
      'address.line1': 'must be at most 200 characters',
    });
    // Unknown part.
    const withSuite = { ...valid, address: { line1: '1 Main St', suite: '4B' } };
    expect(validateLead(contactSchema, withSuite as never)).toEqual({
      'address.suite': 'unknown field',
    });
    // Over-cap single string.
    expect(validateLead(contactSchema, { ...valid, address: 'x'.repeat(301) })).toEqual({
      address: 'must be at most 300 characters',
    });
    // Wrong shape.
    expect(validateLead(contactSchema, { ...valid, address: 42 as never })).toEqual({
      address: 'must be a string or an object of parts',
    });
    // A well-formed address still passes.
    expect(validateLead(contactSchema, valid)).toEqual({});
  });

  it('treats an all-blank parts address as missing: fine on contact, required on quote', () => {
    expect(validateLead(contactSchema, { ...valid, address: { line1: ' ' } })).toEqual({});
    expect(validateLead(schema, { ...valid, address: { line1: ' ' } })).toEqual({
      address: 'required',
    });
  });

  it('keeps name and email-or-phone required on contact schemas', () => {
    expect(validateLead(contactSchema, { ...valid, name: ' ' })).toEqual({ name: 'required' });
    expect(validateLead(contactSchema, { ...valid, email: '', phone: '' })).toEqual({
      email: 'email or phone is required',
    });
  });

  it('rejects enum values outside the options', () => {
    const fields = { ...valid, driveway_surface: 'asphalt' };
    expect(validateLead(schema, fields as never)).toEqual({
      driveway_surface: 'invalid value "asphalt"',
    });
  });

  it('allows an empty select (unanswered)', () => {
    expect(validateLead(schema, { ...valid, driveway_surface: '' })).toEqual({});
  });

  it('enforces per-field length caps', () => {
    expect(validateLead(schema, { ...valid, message: 'x'.repeat(2001) })).toEqual({
      message: 'must be at most 2000 characters',
    });
  });

  it('rejects malformed emails', () => {
    expect(validateLead(schema, { ...valid, email: 'not-an-email' })).toEqual({
      email: 'invalid email address',
    });
  });

  it('rejects unknown keys, naming the key', () => {
    expect(validateLead(schema, { ...valid, 'custom:gate_code': 'x' })).toEqual({
      'custom:gate_code': 'unknown field',
    });
  });

  it('validates schema-defined custom fields against their options', () => {
    expect(validateLead(schema, { ...valid, 'custom:sidewalk': 'yes' })).toEqual({});
    expect(validateLead(schema, { ...valid, 'custom:sidewalk': 'maybe' })).toEqual({
      'custom:sidewalk': 'invalid value "maybe"',
    });
  });

  it('accepts catalog keys the tenant toggled off (code outranks config)', () => {
    expect(validateLead(schema, { ...valid, urgency: 'seasonal' })).toEqual({});
  });

  it('accepts the composite address as parts and caps each part', () => {
    expect(
      validateLead(schema, {
        ...valid,
        address: { line1: '1 Main St', city: 'Collingwood', region: 'ON', postal: 'L9Y 1B1' },
      }),
    ).toEqual({});
    expect(validateLead(schema, { ...valid, address: { line1: 'x'.repeat(201) } })).toEqual({
      'address.line1': 'must be at most 200 characters',
    });
    expect(validateLead(schema, { ...valid, address: { city: 'x'.repeat(101) } })).toEqual({
      'address.city': 'must be at most 100 characters',
    });
  });

  it('rejects unknown address parts', () => {
    const fields = { ...valid, address: { line1: '1 Main St', suite: '4B' } };
    expect(validateLead(schema, fields as never)).toEqual({
      'address.suite': 'unknown field',
    });
  });

  it('caps the single-string address at 300 characters', () => {
    expect(validateLead(schema, { ...valid, address: 'x'.repeat(301) })).toEqual({
      address: 'must be at most 300 characters',
    });
  });

  it('prefers the fetched schema spec: a server-appended enum option validates (catalog v2)', () => {
    const v2 = {
      fields: schema.fields.map((f) =>
        f.key === 'driveway_surface'
          ? { ...f, options: [...(f.options ?? []), { value: 'heated', label: 'Heated' }] }
          : f,
      ),
    };
    const fields = { ...valid, driveway_surface: 'heated' };
    expect(validateLead(v2, fields as never)).toEqual({});
    // The hardcoded LEAD_FIELDS mirror alone would reject it.
    expect(validateLead({ fields: [] }, fields as never)).toEqual({
      driveway_surface: 'invalid value "heated"',
    });
  });

  it('counts length caps in bytes, as the server does', () => {
    // 'é' is 1 UTF-16 unit but 2 UTF-8 bytes: 15 é = 30 bytes > phone cap 30? use name cap.
    const name = 'é'.repeat(101); // 101 chars, 202 bytes > 200-byte name cap
    expect(validateLead(schema, { ...valid, name })).toEqual({
      name: 'must be at most 200 characters',
    });
    // Same char count under the cap in UTF-16 terms passes only if bytes fit.
    expect(validateLead(schema, { ...valid, name: 'é'.repeat(100) })).toEqual({});
    // Address line1 caps at 200 bytes too.
    expect(validateLead(schema, { ...valid, address: { line1: 'Ç'.repeat(101) } })).toEqual({
      'address.line1': 'must be at most 200 characters',
    });
  });
});

describe('validateExtra', () => {
  it('passes a small extra object', () => {
    expect(validateExtra({ gate_code: '1234', note: 42 })).toEqual({});
  });

  it('caps the key count at 10', () => {
    const extra = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 'v']));
    expect(validateExtra(extra)).toEqual({ extra: 'at most 10 keys' });
  });

  it('caps key names at 64 bytes', () => {
    expect(validateExtra({ ['k'.repeat(65)]: 'v' })).toEqual({
      [`extra.${'k'.repeat(65)}`]: 'key must be 1–64 characters',
    });
  });

  it('caps JSON-encoded values at 1024 bytes', () => {
    expect(validateExtra({ big: 'x'.repeat(1023) })).toEqual({
      'extra.big': 'value must encode to at most 1024 bytes',
    });
    expect(validateExtra({ ok: 'x'.repeat(1022) })).toEqual({});
  });
});
