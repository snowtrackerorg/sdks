import { describe, expect, it } from 'vitest';

import type { FormSchema } from './types.js';
import { validateLead } from './validate.js';

// A representative merged schema: seeded quote-form fields plus one tenant
// custom select, as GET /v1/sdk/forms returns them.
const schema: Pick<FormSchema, 'fields'> = {
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
    expect(validateLead(bare, { email: 'jane@example.com' })).toEqual({
      name: 'required',
      address: 'required',
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

  it('treats an all-blank parts address as missing', () => {
    expect(validateLead(schema, { ...valid, address: { line1: ' ' } })).toEqual({
      address: 'required',
    });
  });
});
