import { SnowTrackerError, type SnowTrackerErrorOptions } from './errors.js';
import type {
  ClientOptions,
  FormSchema,
  GetFormSchemaOptions,
  SnowTrackerClient,
  SubmitLeadOptions,
  SubmitLeadResult,
  TenantInfo,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.snowtracker.pro';
const KEY_HEADER = 'X-Snowtracker-Publishable-Key';

function statusToCode(status: number): string {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 422:
      return 'validation_error';
    case 429:
      return 'rate_limited';
    default:
      return 'http_error';
  }
}

interface SDKTenantWire {
  tenant_id: string;
  tenant_name: string;
  mode: 'live' | 'test';
  logo_url: string;
  primary_hex: string;
}

interface SDKFormWire {
  id: string;
  name: string;
  kind: string;
  catalog_version: number;
  fields:
    | {
        key: string;
        type: string;
        label: string;
        required: boolean;
        max_len: number;
        options?: { value: string; label: string }[] | null;
        maps_to?: string;
      }[]
    | null;
  branding: { tenant_name: string; logo_url: string; primary_hex: string };
  captcha: { provider: string; sitekey: string } | null;
  token: string;
}

interface SDKLeadWire {
  submission_id: string;
  status: string;
}

interface ProblemWire {
  detail?: unknown;
  message?: unknown;
  errors?: unknown;
}

// A huma problem detail names the offending key as "key: message"
// (e.g. "email: invalid email address", "address.line1: must be at most
// 200 characters"). Recover {key: message} pairs from the detail string
// and from the structured errors[] list (location "body.fields.<key>").
function fieldErrorsFromProblem(detail: string, errors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (e === null || typeof e !== 'object') continue;
      const { location, message } = e as { location?: unknown; message?: unknown };
      if (typeof location !== 'string' || typeof message !== 'string') continue;
      const key = location.startsWith('body.fields.')
        ? location.slice('body.fields.'.length)
        : location.startsWith('body.')
          ? location.slice('body.'.length)
          : location;
      if (key !== '') out[key] = message;
    }
  }
  const m = /^([A-Za-z0-9_.:-]+): (.+)$/s.exec(detail);
  if (m !== null && m[1] !== undefined && m[2] !== undefined && out[m[1]] === undefined) {
    out[m[1]] = m[2];
  }
  return out;
}

interface RequestOptions {
  method?: 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

/** Create a SnowTracker SDK client bound to a publishable key. */
export function createClient(opts: ClientOptions): SnowTrackerClient {
  if (!opts || !opts.publishableKey) {
    throw new SnowTrackerError('publishableKey is required', 'config_error', 0);
  }
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const key = opts.publishableKey;

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { [KEY_HEADER]: key };
    const init: RequestInit = { headers };
    if (options.method) init.method = options.method;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.signal) init.signal = options.signal;

    let res: Response;
    try {
      res = await fetch(baseUrl + path, init);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network request failed';
      throw new SnowTrackerError(message, 'network_error', 0);
    }
    if (!res.ok) {
      let message = `request failed with status ${res.status}`;
      let problem: ProblemWire = {};
      try {
        problem = (await res.json()) as ProblemWire;
        if (typeof problem.detail === 'string') message = problem.detail;
        else if (typeof problem.message === 'string') message = problem.message;
      } catch {
        // non-JSON body; keep the default message
      }
      const errOpts: SnowTrackerErrorOptions = {};
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter)) errOpts.retryAfter = retryAfter;
      }
      if (res.status === 422) {
        const fieldErrors = fieldErrorsFromProblem(message, problem.errors);
        if (Object.keys(fieldErrors).length > 0) errOpts.fieldErrors = fieldErrors;
      }
      throw new SnowTrackerError(message, statusToCode(res.status), res.status, errOpts);
    }
    return (await res.json()) as T;
  }

  return {
    async getTenant(): Promise<TenantInfo> {
      const data = await request<SDKTenantWire>('/v1/sdk/tenant');
      return {
        tenantId: data.tenant_id,
        tenantName: data.tenant_name,
        mode: data.mode,
        logoUrl: data.logo_url,
        primaryHex: data.primary_hex,
      };
    },

    async getFormSchema(schemaOpts: GetFormSchemaOptions = {}): Promise<FormSchema> {
      const path =
        schemaOpts.formId !== undefined
          ? `/v1/sdk/forms/${encodeURIComponent(schemaOpts.formId)}`
          : `/v1/sdk/forms?kind=${encodeURIComponent(schemaOpts.kind ?? 'quote')}`;
      const data = await request<SDKFormWire>(path, { signal: schemaOpts.signal });
      return {
        id: data.id,
        name: data.name,
        kind: data.kind as FormSchema['kind'],
        catalogVersion: data.catalog_version,
        fields: (data.fields ?? []).map((f) => ({
          key: f.key,
          type: f.type as FormSchema['fields'][number]['type'],
          label: f.label,
          required: f.required,
          maxLen: f.max_len,
          ...(f.options != null ? { options: f.options } : {}),
          ...(f.maps_to !== undefined && f.maps_to !== '' ? { mapsTo: f.maps_to } : {}),
        })),
        branding: {
          tenantName: data.branding.tenant_name,
          logoUrl: data.branding.logo_url,
          primaryHex: data.branding.primary_hex,
        },
        captcha: data.captcha,
        token: data.token,
      };
    },

    async submitLead(leadOpts: SubmitLeadOptions): Promise<SubmitLeadResult> {
      const body: Record<string, unknown> = {
        form_id: leadOpts.formId,
        fields: leadOpts.fields,
        // Honeypot: forwarded verbatim — '' for humans, whatever a bot typed otherwise.
        website: leadOpts.website ?? '',
        token: leadOpts.token,
      };
      if (leadOpts.extra !== undefined) body.extra = leadOpts.extra;
      if (leadOpts.captchaToken !== undefined) body.captcha_token = leadOpts.captchaToken;
      const data = await request<SDKLeadWire>('/v1/sdk/leads', {
        method: 'POST',
        body,
        signal: leadOpts.signal,
      });
      return { submissionId: data.submission_id, status: data.status };
    },
  };
}
