/**
 * LEAD_FIELDS is the TypeScript mirror of the server-side field catalog
 * (`internal/sdkforms/catalog.go` in snowtracker-ops-api) — the append-only
 * public contract every SDK surface renders. Shipped fields are never
 * removed, renamed, or retyped; additions bump `LEAD_CATALOG_VERSION`.
 *
 * The mirror is pinned against the server by the committed fixtures in
 * `src/__fixtures__/` (see contract.test.ts) so CI needs no live server.
 */

/** The only five field types the contract admits. */
export type LeadFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select';

export const LEAD_CATALOG_VERSION = 1;

export const LEAD_FIELDS = {
  name: { type: 'text', label: 'Full name', maxLen: 200, mapsTo: 'customer.name' },
  email: { type: 'email', label: 'Email', maxLen: 254, mapsTo: 'customer.email' },
  phone: { type: 'phone', label: 'Phone', maxLen: 30, mapsTo: 'customer.mobile_phone' },
  /** Composite: a single formatted string OR `{ line1, line2, city, region, postal, country }`. */
  address: { type: 'text', label: 'Property address', maxLen: 300, mapsTo: 'property.address' },
  driveway_surface: {
    type: 'select',
    label: 'Driveway surface',
    maxLen: 32,
    mapsTo: 'property.driveway_surface',
    values: ['paved', 'gravel', 'grass', 'unpaved_other', 'none'],
  },
  service_type: {
    type: 'select',
    label: 'Service type',
    maxLen: 32,
    values: ['residential', 'commercial'],
  },
  urgency: {
    type: 'select',
    label: 'When do you need service?',
    maxLen: 32,
    values: ['seasonal', 'on_demand', 'emergency'],
  },
  referral_source: {
    type: 'select',
    label: 'How did you hear about us?',
    maxLen: 32,
    values: ['google', 'facebook', 'instagram', 'neighbour_friend', 'sign', 'repeat', 'other'],
  },
  referral_details: { type: 'text', label: 'Referral details', maxLen: 500 },
  message: {
    type: 'textarea',
    label: 'Anything else we should know?',
    maxLen: 2000,
    mapsTo: 'property_notes.body',
  },
} as const satisfies Record<
  string,
  {
    type: LeadFieldType;
    label: string;
    maxLen: number;
    mapsTo?: string;
    values?: readonly string[];
  }
>;

/** A canonical catalog field key. An invalid key is a compile error. */
export type LeadFieldKey = keyof typeof LEAD_FIELDS;

type ValuesOf<K extends LeadFieldKey> = (typeof LEAD_FIELDS)[K] extends {
  values: readonly (infer V)[];
}
  ? V
  : never;

export type DrivewaySurface = ValuesOf<'driveway_surface'>;
export type ServiceType = ValuesOf<'service_type'>;
export type Urgency = ValuesOf<'urgency'>;
export type ReferralSource = ValuesOf<'referral_source'>;

/** A tenant-defined custom field key (`custom:…`), as configured in Settings → Website Forms. */
export type CustomFieldKey = `custom:${string}`;

/** Structured parts of the composite address field. Per-part caps: line1/line2 ≤ 200, others ≤ 100. */
export interface LeadAddressParts {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
}

/**
 * Typed answers for a lead submission, keyed by catalog field key.
 * `''` is allowed on selects (treated as unanswered). Custom (`custom:…`)
 * keys are accepted when the tenant's form defines them.
 */
export interface LeadFields {
  name?: string;
  email?: string;
  phone?: string;
  address?: string | LeadAddressParts;
  driveway_surface?: DrivewaySurface | '';
  service_type?: ServiceType | '';
  urgency?: Urgency | '';
  referral_source?: ReferralSource | '';
  referral_details?: string;
  message?: string;
}

/** LeadFields plus tenant-defined `custom:…` answers. */
export type LeadFieldValues = LeadFields & {
  [key: CustomFieldKey]: string | undefined;
};
