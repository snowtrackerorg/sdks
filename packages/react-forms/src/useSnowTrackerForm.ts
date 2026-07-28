import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LEAD_FIELDS,
  LEAD_LIMITS,
  SnowTrackerError,
  validateExtra,
  validateLead,
  type CustomFieldKey,
  type FormField,
  type FormKind,
  type FormSchema,
  type LeadAddressParts,
  type LeadFieldKey,
  type LeadFieldValues,
  type SubmitLeadResult,
  type SnowTrackerClient,
} from '@snowtrackerpro/sdk-core';

/**
 * Code-outranks-config overrides. The tenant's Settings configure the
 * fetched schema; these overrides are applied on top, locally, so a
 * Settings edit never mutates a deployed, QA'd page.
 *
 * Overrides (including `pinnedSchema`) are captured on the hook's first
 * render — later identity or content changes are ignored, so inline
 * object literals are safe.
 */
export interface FormOverrides {
  /** Drop these fields from the rendered schema. */
  hideFields?: (LeadFieldKey | CustomFieldKey)[];
  /** Replace field labels, keyed by field key. */
  labels?: Partial<Record<LeadFieldKey | CustomFieldKey, string>>;
  /**
   * Extra fields appended to the schema client-side (a field whose key
   * already exists replaces it in place). Catalog keys (fields the tenant
   * toggled off) and tenant-defined `custom:…` keys submit as regular
   * fields; any other key is submitted under the bounded `extra` object
   * instead, since the server rejects unknown field keys.
   */
  extraFields?: FormField[];
  /**
   * Local schema snapshot — the schema fetch is skipped entirely and this
   * shape wins, so the form never changes because a tenant clicked a
   * checkbox. A fresh submission token is still minted in the background
   * at mount (snapshot tokens expire after 24h), and submits wait out the
   * server's 3s minimum token age when needed.
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

/** Schema lifecycle: `loading` → `ready` (or `load_error`; call `retry()`). Pinned schemas start `ready`. */
export type FormStatus = 'loading' | 'ready' | 'load_error';

export interface UseSnowTrackerFormOptions {
  client: SnowTrackerClient;
  /** Fetch a specific form by id. Wins over `kind`. */
  formId?: string;
  /** Resolve the tenant's default form of this kind. Defaults to `quote`. */
  kind?: FormKind;
  /** Called after a successful submission. */
  onSuccess?: (result: SubmitLeadResult) => void;
  overrides?: FormOverrides;
}

export interface UseSnowTrackerFormResult {
  /** The (override-adjusted) form schema, or null until loaded. */
  schema: FormSchema | null;
  /** `loading` | `ready` | `load_error` — disable the submit button while not `ready`. */
  status: FormStatus;
  /** Current answers keyed by field key, plus `website` (the honeypot). */
  values: FormValues;
  setValue: (key: FormValueKey, value: string | LeadAddressParts) => void;
  /** `values[key]` as a string (`''` for unset or address-parts values) — for text inputs. */
  getString: (key: FormValueKey) => string;
  /** Per-field errors keyed by field key — client-side on submit, server-side after a 422. */
  errors: Readonly<Record<string, string>>;
  submitting: boolean;
  submitted: boolean;
  submissionId: string | null;
  /** Schema-load or non-field submission failure (network, rate limit, token, captcha, …). */
  error: SnowTrackerError | null;
  /** No-op until `status === 'ready'`. */
  submit: (opts?: { extra?: Record<string, unknown>; captchaToken?: string }) => Promise<void>;
  reset: () => void;
  /** Clear `error` without touching values. */
  clearError: () => void;
  /** Re-run the schema fetch after a load failure. */
  retry: () => void;
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
    const next = [...fields];
    for (const ef of extra) {
      const at = next.findIndex((f) => f.key === ef.key);
      if (at >= 0) next[at] = ef;
      else next.push(ef);
    }
    fields = next;
  }
  return { ...schema, fields };
}

// Dev-time guardrail: the server requires name + (email or phone) on
// EVERY lead, and address on quote-kind forms — hiding them without
// setting values programmatically guarantees failed submissions. The
// address warning is per-form-kind: contact forms don't require an
// address, so hiding it there is fine.
function warnHiddenInvariants(
  hide: (LeadFieldKey | CustomFieldKey)[] | undefined,
  kind: FormKind,
): void {
  if (!hide || hide.length === 0) return;
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (nodeEnv === 'production') return;
  if (hide.includes('name')) {
    console.warn(
      '[snowtracker] overrides.hideFields includes "name", but the server requires name on every lead — submissions will fail unless you set it via setValue().',
    );
  }
  if (kind === 'quote' && hide.includes('address')) {
    console.warn(
      '[snowtracker] overrides.hideFields includes "address", but the server requires address on every quote lead — submissions will fail unless you set it via setValue().',
    );
  }
  if (hide.includes('email') && hide.includes('phone')) {
    console.warn(
      '[snowtracker] overrides.hideFields hides both "email" and "phone", but the server requires one of them on every lead.',
    );
  }
}

function asSnowTrackerError(err: unknown): SnowTrackerError {
  if (err instanceof SnowTrackerError) return err;
  const message = err instanceof Error ? err.message : 'unexpected error';
  return new SnowTrackerError(message, 'http_error', 0);
}

function isCatalogKey(key: string): boolean {
  return key in LEAD_FIELDS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Headless form state for a SnowTracker quote/contact form: fetches the
 * form schema (or uses a pinned snapshot), holds values, pre-validates
 * with `validateLead`, and submits through `client.submitLead`. You keep
 * your own markup — render `schema.fields` however you like, plus a
 * hidden `website` input wired to `setValue('website', …)` (honeypot).
 */
export function useSnowTrackerForm(options: UseSnowTrackerFormOptions): UseSnowTrackerFormResult {
  const { client, formId, kind, onSuccess } = options;

  // Overrides (incl. pinnedSchema) are captured at mount — see FormOverrides.
  const overridesRef = useRef(options.overrides);
  const pinned = overridesRef.current?.pinnedSchema ?? null;

  const [schema, setSchema] = useState<FormSchema | null>(() =>
    pinned ? applyOverrides(pinned, overridesRef.current) : null,
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [values, setValues] = useState<Record<string, string | LeadAddressParts>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState<SnowTrackerError | null>(null);
  const [fetchNonce, setFetchNonce] = useState(0);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // The schema as the server (or the pinned snapshot) defines it, before
  // overrides — used to tell real fields from override-added extras.
  const baseSchemaRef = useRef<FormSchema | null>(pinned);
  // Latest token minted by a schema fetch, with its client-side mint time
  // (used to wait out the server's minimum token age).
  const mintedRef = useRef<{ token: string; at: number } | null>(null);
  // Double-submit guard. A ref, not state: two synchronous submit() calls
  // must collapse before any re-render happens.
  const inFlightRef = useRef(false);

  // Warn once the (base) schema is known — the address warning depends on
  // the form's kind, which a formId-only mount learns from the fetch.
  const warnedRef = useRef(false);
  useEffect(() => {
    if (schema === null || warnedRef.current) return;
    warnedRef.current = true;
    warnHiddenInvariants(overridesRef.current?.hideFields, baseSchemaRef.current?.kind ?? 'quote');
  }, [schema]);

  useEffect(() => {
    const pinnedSchema = overridesRef.current?.pinnedSchema;
    const ac = new AbortController();
    if (pinnedSchema) {
      // Shape is pinned — but background-mint a fresh submission token now
      // so the server's 3s minimum token age has elapsed by first submit.
      client
        .getFormSchema({ formId: pinnedSchema.id, signal: ac.signal })
        .then((fresh) => {
          mintedRef.current = { token: fresh.token, at: Date.now() };
        })
        .catch(() => {
          // submit() mints lazily when the background mint failed.
        });
      return () => ac.abort();
    }
    client
      .getFormSchema(
        formId !== undefined
          ? { formId, signal: ac.signal }
          : { kind: kind ?? 'quote', signal: ac.signal },
      )
      .then((fetched) => {
        baseSchemaRef.current = fetched;
        mintedRef.current = { token: fetched.token, at: Date.now() };
        setSchema(applyOverrides(fetched, overridesRef.current));
        setLoadFailed(false);
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) {
          setLoadFailed(true);
          setError(asSnowTrackerError(err));
        }
      });
    return () => ac.abort();
  }, [client, formId, kind, fetchNonce]);

  const setValue = useCallback((key: FormValueKey, value: string | LeadAddressParts) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const getString = useCallback(
    (key: FormValueKey): string => {
      const v = values[key];
      return typeof v === 'string' ? v : '';
    },
    [values],
  );

  // Server 422s carry fieldErrors keyed by field key — but some keys
  // (token, captcha_token, form_id, extra, extra.*) have no input to
  // attach to. Route renderable keys into `errors`, the rest into `error`
  // so a failure is never silent.
  const routeSubmitError = useCallback((stErr: SnowTrackerError, effectiveSchema: FormSchema) => {
    if (stErr.code === 'validation_error' && stErr.fieldErrors) {
      const schemaKeys = new Set(effectiveSchema.fields.map((f) => f.key));
      const renderable: Record<string, string> = {};
      let hasNonField = false;
      for (const [key, message] of Object.entries(stErr.fieldErrors)) {
        const isAddressPart = key.startsWith('address.') && schemaKeys.has('address');
        if (schemaKeys.has(key) || isAddressPart) renderable[key] = message;
        else hasNonField = true;
      }
      if (Object.keys(renderable).length > 0) setErrors(renderable);
      if (hasNonField || Object.keys(renderable).length === 0) setError(stErr);
      return;
    }
    setError(stErr);
  }, []);

  const submit = useCallback(
    async (opts?: { extra?: Record<string, unknown>; captchaToken?: string }) => {
      const currentSchema = schema;
      const baseSchema = baseSchemaRef.current;
      if (!currentSchema || !baseSchema) return; // not ready — disable the button on status !== 'ready'
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        setError(null);

        // Gather non-empty answers (honeypot aside) and validate against
        // the effective schema.
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

        // Split: keys the server doesn't know (override-added, non-catalog,
        // not in the base schema) go under `extra` so they don't 422.
        const fields: Record<string, string | LeadAddressParts> = {};
        const extra: Record<string, unknown> = { ...opts?.extra };
        const baseKeys = new Set(baseSchema.fields.map((f) => f.key));
        for (const [key, value] of Object.entries(answered)) {
          if (isCatalogKey(key) || baseKeys.has(key)) fields[key] = value;
          else extra[key] = value;
        }

        // Mirror the server's extra caps — fail loudly before the POST.
        if (Object.keys(extra).length > 0) {
          const extraErrors = validateExtra(extra);
          const firstExtraError = Object.entries(extraErrors)[0];
          if (firstExtraError !== undefined) {
            setError(
              new SnowTrackerError(
                `${firstExtraError[0]}: ${firstExtraError[1]}`,
                'validation_error',
                0,
                { fieldErrors: extraErrors },
              ),
            );
            return;
          }
        }

        setErrors({});
        setSubmitting(true);
        const isPinned = overridesRef.current?.pinnedSchema !== undefined;
        const minAgeMs = LEAD_LIMITS.tokenMinAgeSeconds * 1000;

        // Mint (or refresh) the submission token and wait out the server's
        // minimum token age. Non-pinned mounts submit the schema-fetch
        // token as-is: a human can't reach submit inside 3s of render.
        const seasonedToken = async (refresh: boolean): Promise<string> => {
          if (refresh || mintedRef.current === null) {
            const fresh = await client.getFormSchema({ formId: baseSchema.id });
            mintedRef.current = { token: fresh.token, at: Date.now() };
            if (!isPinned) {
              baseSchemaRef.current = fresh;
              setSchema(applyOverrides(fresh, overridesRef.current));
            }
          }
          const wait = mintedRef.current.at + minAgeMs - Date.now();
          if (wait > 0) await sleep(wait);
          return mintedRef.current.token;
        };

        try {
          let token = isPinned ? await seasonedToken(false) : currentSchema.token;
          let retriedExpired = false;
          for (;;) {
            try {
              const result = await client.submitLead({
                formId: baseSchema.id,
                fields: fields as LeadFieldValues,
                ...(Object.keys(extra).length > 0 ? { extra } : {}),
                website,
                token,
                ...(opts?.captchaToken !== undefined ? { captchaToken: opts.captchaToken } : {}),
              });
              setSubmitted(true);
              setSubmissionId(result.submissionId);
              onSuccessRef.current?.(result);
              return;
            } catch (err) {
              const stErr = asSnowTrackerError(err);
              // Stale token (page open > 24h): re-mint once, wait out the
              // minimum age, retry automatically.
              if (
                !retriedExpired &&
                stErr.code === 'validation_error' &&
                stErr.fieldErrors?.token === 'form token expired'
              ) {
                retriedExpired = true;
                token = await seasonedToken(true);
                continue;
              }
              routeSubmitError(stErr, currentSchema);
              return;
            }
          }
        } catch (err) {
          // Token mint failed (network, revoked key, …).
          setError(asSnowTrackerError(err));
        } finally {
          setSubmitting(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [client, schema, values, routeSubmitError],
  );

  const reset = useCallback(() => {
    setValues({});
    setErrors({});
    setSubmitted(false);
    setSubmissionId(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setLoadFailed(false);
    setFetchNonce((n) => n + 1);
  }, []);

  const status: FormStatus = schema !== null ? 'ready' : loadFailed ? 'load_error' : 'loading';

  return {
    schema,
    status,
    values,
    setValue,
    getString,
    errors,
    submitting,
    submitted,
    submissionId,
    error,
    submit,
    reset,
    clearError,
    retry,
  };
}

/** @deprecated Renamed to {@link useSnowTrackerForm} (capital T, matching `SnowTrackerClient`/`SnowTrackerError`). Same function. */
export const useSnowtrackerForm = useSnowTrackerForm;

/** @deprecated Renamed to {@link UseSnowTrackerFormOptions}. */
export type UseSnowtrackerFormOptions = UseSnowTrackerFormOptions;
/** @deprecated Renamed to {@link UseSnowTrackerFormResult}. */
export type UseSnowtrackerFormResult = UseSnowTrackerFormResult;
