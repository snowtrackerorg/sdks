import { LEAD_FIELDS, type LeadAddressParts, type LeadFieldValues } from './catalog.js';
import type { FormField, FormSchema } from './types.js';

/** Per-field validation messages, keyed by field key (`address.line1` for address parts). */
export type LeadFieldErrors = Record<string, string>;

// Address caps, mirroring the server (the "line1-LONG" gotcha: line1 is
// capped tighter than the composite formatted string).
const MAX_ADDRESS_FORMATTED = 300;
const MAX_ADDRESS_LINE = 200;
const MAX_ADDRESS_PART = 100;
const ADDRESS_PART_KEYS = ['line1', 'line2', 'city', 'region', 'postal', 'country'];

/**
 * Client-side pre-validation mirroring the server's default-deny rules
 * (POST /v1/sdk/leads): unknown keys, enum membership, per-field length
 * caps, required fields per the schema, and the server invariants that
 * hold regardless of tenant config — name, email-or-phone, address.
 *
 * Unlike the server (which reports the first violation), all errors are
 * collected. An empty result means the submission passes client-side.
 * Pure function: no I/O, no mutation.
 */
export function validateLead(
  schema: Pick<FormSchema, 'fields'>,
  fields: LeadFieldValues,
): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  const schemaByKey = new Map<string, FormField>(schema.fields.map((f) => [f.key, f]));

  for (const [key, raw] of Object.entries(fields)) {
    if (raw === undefined || raw === null) continue;

    if (key === 'address') {
      validateAddress(raw, errors);
      continue;
    }

    const spec = specFor(key, schemaByKey);
    if (!spec) {
      errors[key] = 'unknown field';
      continue;
    }
    if (typeof raw !== 'string') {
      errors[key] = 'must be a string';
      continue;
    }
    const val = raw.trim();
    if (val.length > spec.maxLen) {
      errors[key] = `must be at most ${spec.maxLen} characters`;
      continue;
    }
    if (
      spec.type === 'select' &&
      val !== '' &&
      !(spec.options ?? []).some((o) => o.value === val)
    ) {
      errors[key] = `invalid value "${val}"`;
      continue;
    }
    if (spec.type === 'email' && val !== '' && !looksLikeEmail(val)) {
      errors[key] = 'invalid email address';
    }
  }

  // Required per the schema. email/phone are excluded here: the seeded
  // config marks both required, but the server only ever enforces
  // email-OR-phone (the invariant below) — enforcing both would reject
  // submissions the server accepts.
  for (const f of schema.fields) {
    if (!f.required || f.key === 'email' || f.key === 'phone') continue;
    if (errors[f.key] !== undefined) continue;
    if (isEmpty(fields[f.key as keyof LeadFieldValues])) errors[f.key] = 'required';
  }

  // Server invariants — enforced regardless of tenant config.
  if (errors.name === undefined && trimmed(fields.name) === '') {
    errors.name = 'required';
  }
  if (
    errors.email === undefined &&
    errors.phone === undefined &&
    trimmed(fields.email) === '' &&
    trimmed(fields.phone) === ''
  ) {
    errors.email = 'email or phone is required';
  }
  if (errors.address === undefined && addressFormatted(fields.address) === '') {
    errors.address = 'required';
  }

  return errors;
}

/**
 * Resolve the validation spec for a key: catalog keys are always accepted
 * (code outranks config — a pinned form must not break when a tenant unticks
 * a box); other keys (tenant `custom:…` fields, hook-added extra fields) are
 * accepted only when the schema defines them.
 */
function specFor(
  key: string,
  schemaByKey: Map<string, FormField>,
): Pick<FormField, 'type' | 'maxLen' | 'options'> | undefined {
  if (key in LEAD_FIELDS) {
    const spec = LEAD_FIELDS[key as keyof typeof LEAD_FIELDS];
    const values = 'values' in spec ? spec.values : undefined;
    return {
      type: spec.type,
      maxLen: spec.maxLen,
      options: values?.map((v) => ({ value: v, label: v })),
    };
  }
  return schemaByKey.get(key);
}

function validateAddress(raw: unknown, errors: LeadFieldErrors): void {
  if (typeof raw === 'string') {
    if (raw.trim().length > MAX_ADDRESS_FORMATTED) {
      errors.address = `must be at most ${MAX_ADDRESS_FORMATTED} characters`;
    }
    return;
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [part, value] of Object.entries(raw)) {
      if (!ADDRESS_PART_KEYS.includes(part)) {
        errors[`address.${part}`] = 'unknown field';
        continue;
      }
      if (typeof value !== 'string') {
        errors[`address.${part}`] = 'must be a string';
        continue;
      }
      const max = part === 'line1' || part === 'line2' ? MAX_ADDRESS_LINE : MAX_ADDRESS_PART;
      if (value.trim().length > max) {
        errors[`address.${part}`] = `must be at most ${max} characters`;
      }
    }
    return;
  }
  errors.address = 'must be a string or an object of parts';
}

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isEmpty(v: string | LeadAddressParts | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return addressFormatted(v) === '';
}

/** Mirror of the server's FormatAddress concatenation, used for emptiness checks. */
function addressFormatted(v: string | LeadAddressParts | undefined): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  const line1 = [trimmed(v.line1), trimmed(v.line2)].filter(Boolean).join(' ');
  const regionPostal = [trimmed(v.region), trimmed(v.postal)].filter(Boolean).join(' ');
  return [line1, trimmed(v.city), regionPostal, trimmed(v.country)].filter(Boolean).join(', ');
}

// Mirror of the server's shape check: one "@" with something on both sides,
// a dot in the domain, no whitespace. Deliverability is not the client's
// problem; garbage rejection is.
function looksLikeEmail(s: string): boolean {
  const at = s.indexOf('@');
  if (at <= 0 || at === s.length - 1) return false;
  if (/\s/.test(s)) return false;
  return s.slice(at + 1).includes('.');
}
