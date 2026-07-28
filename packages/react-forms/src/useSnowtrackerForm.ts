import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LEAD_FIELDS,
  SnowTrackerError,
  validateLead,
  type CustomFieldKey,
  type FormField,
  type FormKind,
  type FormSchema,
  type LeadAddressParts,
  type LeadFieldKey,
  type LeadFieldValues,
  type SnowTrackerClient,
  type SubmitLeadResult,
} from '@snowtrackerpro/sdk-core';

/**
 * Code-outranks-config overrides. The tenant's Settings configure the
 * fetched schema; these overrides are applied on top, locally, so a
 * Settings edit never mutates a deployed, QA'd page.
 */
export interface FormOverrides {
  /** Drop these catalog fields from the rendered schema. */
  hideFields?: LeadFieldKey[];
  /** Replace field labels, keyed by catalog field key. */
  labels?: Partial<Record<LeadFieldKey, string>>;
  /**
   * Extra fields appended to the schema client-side. Catalog keys (fields
   * the tenant toggled off) and tenant-defined `custom:…` keys submit as
   * regular fields; any other key is submitted under the bounded `extra`
   * object instead, since the server rejects unknown field keys.
   */
  extraFields?: FormField[];
  /**
   * Local schema snapshot — the fetch is skipped entirely and this shape
   * wins, so the form never changes because a tenant clicked a checkbox.
   * A fresh submission token is still minted (one schema fetch) at submit
   * time, because snapshot tokens expire after 24h.
   */
  pinnedSchema?: FormSchema;
}

/** Keys accepted by `setValue`: catalog fields, custom fields, the honeypot, or override-added extras. */
export type FormValueKey =
  | LeadFieldKey
  | CustomFieldKey
  | 'website'
  | (string & Record<never, never>);

export type FormValues = Readonly<Record<string, string | LeadAddressParts>>;

export interface UseSnowtrackerFormOptions {
  client: SnowTrackerClient;
  /** Fetch a specific form by id. Wins over `kind`. */
  formId?: string;
  /** Resolve the tenant's default form of this kind. Defaults to `quote`. */
  kind?: FormKind;
  /** Called after a successful submission. */
  onSuccess?: (result: SubmitLeadResult) => void;
  overrides?: FormOverrides;
}

export interface UseSnowtrackerFormResult {
  /** The (override-adjusted) form schema, or null while loading / after a failed load. */
  schema: FormSchema | null;
  /** Current answers keyed by field key, plus `website` (the honeypot). */
  values: FormValues;
  setValue: (key: FormValueKey, value: string | LeadAddressParts) => void;
  /** Per-field errors keyed by field key — client-side on submit, server-side after a 422. */
  errors: Readonly<Record<string, string>>;
  submitting: boolean;
  submitted: boolean;
  submissionId: string | null;
  /** Schema-load or non-field submission failure (network, rate limit, …). */
  error: SnowTrackerError | null;
  submit: (opts?: { extra?: Record<string, unknown> }) => Promise<void>;
  reset: () => void;
}

function applyOverrides(schema: FormSchema, overrides?: FormOverrides): FormSchema {
  if (!overrides) return schema;
  let fields = schema.fields;
  const hide = overrides.hideFields;
  if (hide && hide.length > 0) {
    fields = fields.filter((f) => !(hide as string[]).includes(f.key));
  }
  const labels = overrides.labels;
  if (labels) {
    fields = fields.map((f) => {
      const label = labels[f.key as LeadFieldKey];
      return label !== undefined ? { ...f, label } : f;
    });
  }
  const extra = overrides.extraFields;
  if (extra && extra.length > 0) {
    fields = [...fields, ...extra];
  }
  return { ...schema, fields };
}

function asSnowTrackerError(err: unknown): SnowTrackerError {
  if (err instanceof SnowTrackerError) return err;
  const message = err instanceof Error ? err.message : 'unexpected error';
  return new SnowTrackerError(message, 'http_error', 0);
}

/**
 * Headless form state for a SnowTracker quote/contact form: fetches the
 * form schema (or uses a pinned snapshot), holds values, pre-validates
 * with `validateLead`, and submits through `client.submitLead`. You keep
 * your own markup — render `schema.fields` however you like, plus a
 * hidden `website` input wired to `setValue('website', …)` (honeypot).
 */
export function useSnowtrackerForm(options: UseSnowtrackerFormOptions): UseSnowtrackerFormResult {
  const { client, formId, kind, onSuccess, overrides } = options;
  const pinned = overrides?.pinnedSchema;

  const [schema, setSchema] = useState<FormSchema | null>(() =>
    pinned ? applyOverrides(pinned, overrides) : null,
  );
  const [values, setValues] = useState<Record<string, string | LeadAddressParts>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState<SnowTrackerError | null>(null);

  // Latest callbacks/overrides without re-running the fetch effect on
  // every render (callers rarely memoize these).
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // The schema as the server (or the pinned snapshot) defines it, before
  // overrides — used to tell real fields from override-added extras.
  const baseSchemaRef = useRef<FormSchema | null>(pinned ?? null);
  // Fresh token minted at submit time when the schema is pinned.
  const freshTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (pinned) {
      baseSchemaRef.current = pinned;
      setSchema(applyOverrides(pinned, overridesRef.current));
      return;
    }
    const ac = new AbortController();
    client
      .getFormSchema(
        formId !== undefined
          ? { formId, signal: ac.signal }
          : { kind: kind ?? 'quote', signal: ac.signal },
      )
      .then((fetched) => {
        baseSchemaRef.current = fetched;
        setSchema(applyOverrides(fetched, overridesRef.current));
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(asSnowTrackerError(err));
      });
    return () => ac.abort();
  }, [client, formId, kind, pinned]);

  const setValue = useCallback((key: FormValueKey, value: string | LeadAddressParts) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const submit = useCallback(
    async (opts?: { extra?: Record<string, unknown> }) => {
      const currentSchema = schema;
      const baseSchema = baseSchemaRef.current;
      if (!currentSchema || !baseSchema || submitting) return;
      setError(null);

      // Gather non-empty answers (honeypot aside), validate against the
      // effective schema, then split: keys the server doesn't know
      // (override-added, non-catalog, not in the base schema) go under
      // `extra` so they don't 422.
      const answered: Record<string, string | LeadAddressParts> = {};
      let website = '';
      for (const [key, value] of Object.entries(values)) {
        if (key === 'website') {
          if (typeof value === 'string') website = value;
          continue;
        }
        if (typeof value === 'string' && value === '') continue;
        answered[key] = value;
      }

      const fieldErrors = validateLead(currentSchema, answered as LeadFieldValues);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }

      const fields: Record<string, string | LeadAddressParts> = {};
      const extra: Record<string, unknown> = { ...opts?.extra };
      const baseKeys = new Set(baseSchema.fields.map((f) => f.key));
      for (const [key, value] of Object.entries(answered)) {
        if (key in LEAD_FIELDS || baseKeys.has(key)) fields[key] = value;
        else extra[key] = value;
      }
      setErrors({});
      setSubmitting(true);
      try {
        // Pinned schemas carry a stale snapshot token (tokens expire after
        // 24h) — mint a fresh one with a single schema fetch, then reuse it.
        let token = currentSchema.token;
        if (pinned) {
          if (freshTokenRef.current === null) {
            const fresh = await client.getFormSchema({ formId: baseSchema.id });
            freshTokenRef.current = fresh.token;
          }
          token = freshTokenRef.current;
        }
        const result = await client.submitLead({
          formId: baseSchema.id,
          fields: fields as LeadFieldValues,
          ...(Object.keys(extra).length > 0 ? { extra } : {}),
          website,
          token,
        });
        setSubmitted(true);
        setSubmissionId(result.submissionId);
        onSuccessRef.current?.(result);
      } catch (err) {
        const stErr = asSnowTrackerError(err);
        if (stErr.code === 'validation_error' && stErr.fieldErrors) {
          setErrors(stErr.fieldErrors);
        } else {
          setError(stErr);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [client, pinned, schema, submitting, values],
  );

  const reset = useCallback(() => {
    setValues({});
    setErrors({});
    setSubmitted(false);
    setSubmissionId(null);
    setError(null);
  }, []);

  return {
    schema,
    values,
    setValue,
    errors,
    submitting,
    submitted,
    submissionId,
    error,
    submit,
    reset,
  };
}
