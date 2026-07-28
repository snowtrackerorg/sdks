import {
  LEAD_FIELDS,
  LEAD_LIMITS,
  type LeadAddressParts,
  type LeadFieldValues,
} from './catalog.js';
import type { FormField, FormSchema } from './types.js';

/** The schema shape `validateLead` needs: the fields, plus (optionally) the form kind. */
export type ValidatableSchema = Pick<FormSchema, 'fields'> & Partial<Pick<FormSchema, 'kind'>>;

/** Per-field validation messages, keyed by field key (`address.line1` for address parts). */
export type LeadFieldErrors = Record<string, string>;

const ADDRESS_PART_KEYS = ['line1', 'line2', 'city', 'region', 'postal', 'country'];

const encoder = new TextEncoder();

// The server measures every cap with Go len() — BYTES of the UTF-8
// encoding. "Jean-François Côté" is 18 chars but 21 bytes; counting
// UTF-16 units here would pass values the server 422s.
function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/**
 * Client-side pre-validation mirroring the server's default-deny rules
 * (POST /v1/sdk/leads): unknown keys, enum membership, per-field length
 * caps (in bytes, as the server counts), required fields per the schema,
 * and the server invariants that hold regardless of tenant config —
 * name, email-or-phone, and (on quote forms) address.
 *
 * The address invariant is per-form-kind: required when
 * `schema.kind === 'quote'`, optional on contact schemas (format and caps
 * still validate when a value is provided). A schema without `kind` gets
 * quote behaviour — the stricter side, and the server's default kind.
 *
 * Unlike the server (which reports the first violation), all errors are
 * collected. An empty result means the submission passes client-side.
 * Pure function: no I/O, no mutation.
 */
export function validateLead(schema: ValidatableSchema, fields: LeadFieldValues): LeadFieldErrors {
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
    if (byteLength(val) > spec.maxLen) {
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
  if (
    (schema.kind ?? 'quote') === 'quote' &&
    errors.address === undefined &&
    addressFormatted(fields.address) === ''
  ) {
    errors.address = 'required';
  }

  return errors;
}

/**
 * Mirror of the server's `extra` escape-hatch caps: at most
 * `LEAD_LIMITS.extraMaxKeys` keys, key names ≤ `extraKeyMaxBytes` bytes,
 * each JSON-encoded value ≤ `extraValueMaxBytes` bytes. Returns errors
 * keyed `extra` / `extra.<key>` (empty when valid). Pure function.
 *
 * (The server JSON-encodes with Go's HTML escaping, which expands `<`,
 * `>`, `&` to \u-sequences — a value within a few bytes of the cap that
 * contains those characters may still 422 server-side.)
 */
export function validateExtra(extra: Record<string, unknown>): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  const keys = Object.keys(extra);
  if (keys.length > LEAD_LIMITS.extraMaxKeys) {
    errors.extra = `at most ${LEAD_LIMITS.extraMaxKeys} keys`;
    return errors;
  }
  for (const k of keys) {
    const keyBytes = byteLength(k);
    if (keyBytes === 0 || keyBytes > LEAD_LIMITS.extraKeyMaxBytes) {
      errors[`extra.${k}`] = `key must be 1–${LEAD_LIMITS.extraKeyMaxBytes} characters`;
      continue;
    }
    let encoded: string;
    try {
      encoded = JSON.stringify(extra[k]) ?? 'null';
    } catch {
      errors[`extra.${k}`] = `value must encode to at most ${LEAD_LIMITS.extraValueMaxBytes} bytes`;
      continue;
    }
    if (byteLength(encoded) > LEAD_LIMITS.extraValueMaxBytes) {
      errors[`extra.${k}`] = `value must encode to at most ${LEAD_LIMITS.extraValueMaxBytes} bytes`;
    }
  }
  return errors;
}

/**
 * Resolve the validation spec for a key. The fetched schema wins whenever
 * it defines the key — its spec comes from the server's current catalog,
 * so an appended enum option (catalog v2) validates even on an older SDK.
 * `LEAD_FIELDS` is the fallback for catalog keys the schema omits (code
 * outranks config — a pinned form must not break when a tenant unticks a
 * box). Keys in neither place are unknown.
 */
function specFor(
  key: string,
  schemaByKey: Map<string, FormField>,
): Pick<FormField, 'type' | 'maxLen' | 'options'> | undefined {
  const fromSchema = schemaByKey.get(key);
  if (fromSchema) return fromSchema;
  if (key in LEAD_FIELDS) {
    const spec = LEAD_FIELDS[key as keyof typeof LEAD_FIELDS];
    const values = 'values' in spec ? spec.values : undefined;
    return {
      type: spec.type,
      maxLen: spec.maxLen,
      options: values?.map((v) => ({ value: v, label: v })),
    };
  }
  return undefined;
}

function validateAddress(raw: unknown, errors: LeadFieldErrors): void {
  if (typeof raw === 'string') {
    if (byteLength(raw.trim()) > LEAD_LIMITS.addressFormattedBytes) {
      errors.address = `must be at most ${LEAD_LIMITS.addressFormattedBytes} characters`;
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
      const max =
        part === 'line1' || part === 'line2'
          ? LEAD_LIMITS.addressLineBytes
          : LEAD_LIMITS.addressPartBytes;
      if (byteLength(value.trim()) > max) {
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
// a dot in the domain, none of space/tab/newline (exactly the server's
// character set — not \s, which is wider). Deliverability is not the
// client's problem; garbage rejection is.
function looksLikeEmail(s: string): boolean {
  const at = s.indexOf('@');
  if (at <= 0 || at === s.length - 1) return false;
  if (/[ \t\n]/.test(s)) return false;
  return s.slice(at + 1).includes('.');
}
