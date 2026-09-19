import type { LeadFieldType, LeadFieldValues } from './catalog.js';

export interface ClientOptions {
  /** A publishable key (pk_live_… / pk_test_…) from Settings → Publishable Keys. */
  publishableKey: string;
  /** API base URL. Defaults to https://api.snowtracker.pro. */
  baseUrl?: string;
}

export interface TenantInfo {
  tenantId: string;
  tenantName: string;
  mode: 'live' | 'test';
  logoUrl: string;
  primaryHex: string;
}

export type FormKind = 'quote' | 'contact';

export interface FormOption {
  value: string;
  label: string;
}

/** One field of a form schema: catalog spec merged with the tenant's config. */
export interface FormField {
  key: string;
  type: LeadFieldType;
  label: string;
  required: boolean;
  maxLen: number;
  options?: FormOption[];
  /** CRM binding (informational), e.g. `property.driveway_surface`. */
  mapsTo?: string;
}

export interface FormBranding {
  tenantName: string;
  logoUrl: string;
  primaryHex: string;
}

/** Reserved CAPTCHA block — non-null when the tenant has Turnstile switched on. */
export interface FormCaptcha {
  provider: string;
  sitekey: string;
}

/** The GET /v1/sdk/forms response: what a surface needs to render and submit a form. */
export interface FormSchema {
  id: string;
  name: string;
  kind: FormKind;
  catalogVersion: number;
  fields: FormField[];
  branding: FormBranding;
  captcha: FormCaptcha | null;
  /** Signed issued-at token; pass it back in `submitLead`. Valid 3s–24h after issue. */
  token: string;
}

export type GetFormSchemaOptions =
  | {
      /** Fetch a specific form by id (`form_…`). */
      formId: string;
      kind?: never;
      signal?: AbortSignal;
    }
  | {
      formId?: never;
      /** Resolve the tenant's default form of this kind. Defaults to `quote`. */
      kind?: FormKind;
      signal?: AbortSignal;
    };

export interface SubmitLeadOptions {
  /** The form this submission answers (`FormSchema.id`). */
  formId: string;
  /** Catalog-keyed answers. Unknown keys are rejected by the server (422 naming the key). */
  fields: LeadFieldValues;
  /** Bounded escape hatch: ≤10 keys, ≤1KB each, archived verbatim on the submission. */
  extra?: Record<string, unknown>;
  /** Honeypot. Render it hidden and forward whatever the browser filled in — leave `''` for humans. */
  website?: string;
  /** The signed token from `getFormSchema` (`FormSchema.token`). */
  token: string;
  /** Turnstile response token, required when the schema carries a `captcha` block. */
  captchaToken?: string;
  signal?: AbortSignal;
}

export interface SubmitLeadResult {
  /** `lsub_…` submission id. */
  submissionId: string;
  /** Always `received`. */
  status: string;
}

/** A saved route, as offered in a live-map filter. */
export interface TrackingRoute {
  id: string;
  name: string;
  /** CSS colour of the route (hex). */
  color: string;
}

/** One tractor that is out on a route right now. Carries a vehicle name only — never a driver. */
export interface TrackingTractor {
  id: string;
  vehicleName: string;
  /** Vehicle icon preset key (`tractor`, `plow-truck`, …). Treat unknown keys as `tractor`. */
  icon: string;
  routeId: string;
  lat: number;
  lng: number;
  /** Compass heading in degrees, or null when the device did not report one. */
  headingDeg: number | null;
  /** RFC 3339 time of the position fix. */
  recordedAt: string;
}

/** The GET /v1/sdk/tracking response: every saved route and the tractors out on them. */
export interface TrackingSnapshot {
  /** RFC 3339 server time of the snapshot. Measure a fix's age against this, not the viewer's clock. */
  asOf: string;
  /** Where to rest the map when nobody is out, or null when the business has no location set. */
  center: { lat: number; lng: number } | null;
  routes: TrackingRoute[];
  tractors: TrackingTractor[];
}

export interface GetTrackingOptions {
  signal?: AbortSignal;
}

export interface SnowTrackerClient {
  /** Fetch public display info for the key's tenant (GET /v1/sdk/tenant). */
  getTenant(): Promise<TenantInfo>;
  /** Fetch a form schema by id or by kind (GET /v1/sdk/forms[/{form_id}]). */
  getFormSchema(opts?: GetFormSchemaOptions): Promise<FormSchema>;
  /** Submit a lead (POST /v1/sdk/leads). */
  submitLead(opts: SubmitLeadOptions): Promise<SubmitLeadResult>;
  /**
   * Fetch the public live-map snapshot (GET /v1/sdk/tracking). Rejects with
   * code `tracking_unavailable` (status 404) when the business has not switched
   * on its public live map, `forbidden` (403) when the key lacks the tracking
   * scope or the page's origin is not allowed, and `rate_limited` (429).
   */
  getTracking(opts?: GetTrackingOptions): Promise<TrackingSnapshot>;
}
