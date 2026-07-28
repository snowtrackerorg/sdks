// Contract test: pins LEAD_FIELDS and the client's wire assumptions against
// committed snapshots of the ops-api contract, so CI needs no live server.
//
// Fixtures (regenerate against a running local ops-api after a catalog or
// endpoint change):
//
//   sdk-openapi.json — the /sdk/forms + /sdk/leads OpenAPI subset:
//     curl -s localhost:8080/openapi.json \
//       | node scripts/extract-sdk-openapi.mjs \
//       | pnpm exec prettier --parser json > src/__fixtures__/sdk-openapi.json
//
//   sdk-catalog.json — the canonical field catalog + numeric limits, dumped
//     from the server source of truth (snowtracker-ops-api). From the ops-api
//     repo root, put a tiny main in tmp_catalogdump/main.go printing JSON:
//       {"catalog_version": sdkforms.CatalogVersion,
//        "fields": sdkforms.Catalog(),
//        "limits": {"max_address_line": sdkforms.MaxAddressLine,
//                   "max_address_part": sdkforms.MaxAddressPart,
//                   "max_address_formatted": sdkforms.MaxAddressFormatted,
//                   "max_custom_text_len": sdkforms.MaxCustomTextLen,
//                   "max_custom_textarea_len": sdkforms.MaxCustomTextareaLen,
//                   "max_extra_keys": sdkforms.MaxExtraKeys,
//                   "max_extra_key_len": sdkforms.MaxExtraKeyLen,
//                   "max_extra_val_len": sdkforms.MaxExtraValLen,
//                   "token_min_age_seconds": int(sdkforms.TokenMinAge / time.Second),
//                   "token_max_age_seconds": int(sdkforms.TokenMaxAge / time.Second)}}
//     then: go run ./tmp_catalogdump | pnpm exec prettier --parser json \
//       > .../src/__fixtures__/sdk-catalog.json
import { describe, expect, it } from 'vitest';

import { LEAD_CATALOG_VERSION, LEAD_FIELDS, LEAD_LIMITS } from './catalog.js';
import catalogFixtureJson from './__fixtures__/sdk-catalog.json';
import openapiFixture from './__fixtures__/sdk-openapi.json';

interface CatalogFixtureField {
  key: string;
  type: string;
  label: string;
  max_len: number;
  maps_to?: string;
  options?: { value: string; label: string }[];
}

const catalogFixture = catalogFixtureJson as {
  catalog_version: number;
  fields: CatalogFixtureField[];
  limits: Record<string, number>;
};

describe('LEAD_FIELDS mirrors the server catalog', () => {
  it('matches the catalog version', () => {
    expect(LEAD_CATALOG_VERSION).toBe(catalogFixture.catalog_version);
  });

  it('has exactly the catalog keys, in catalog order', () => {
    expect(Object.keys(LEAD_FIELDS)).toEqual(catalogFixture.fields.map((f) => f.key));
  });

  it.each(catalogFixture.fields)('mirrors $key (type/label/max_len/maps_to/enums)', (server) => {
    const mirror = LEAD_FIELDS[server.key as keyof typeof LEAD_FIELDS];
    expect(mirror.type).toBe(server.type);
    expect(mirror.label).toBe(server.label);
    expect(mirror.maxLen).toBe(server.max_len);
    expect('mapsTo' in mirror ? mirror.mapsTo : undefined).toBe(server.maps_to);
    const mirrorValues = 'values' in mirror ? [...mirror.values] : undefined;
    expect(mirrorValues).toEqual(server.options?.map((o) => o.value));
    const mirrorLabels =
      'optionLabels' in mirror && mirrorValues
        ? mirrorValues.map((v) => mirror.optionLabels[v as keyof typeof mirror.optionLabels])
        : undefined;
    expect(mirrorLabels).toEqual(server.options?.map((o) => o.label));
  });

  it('mirrors the numeric limits the client hardcodes', () => {
    expect({
      max_address_line: LEAD_LIMITS.addressLineBytes,
      max_address_part: LEAD_LIMITS.addressPartBytes,
      max_address_formatted: LEAD_LIMITS.addressFormattedBytes,
      max_custom_text_len: LEAD_LIMITS.customTextBytes,
      max_custom_textarea_len: LEAD_LIMITS.customTextareaBytes,
      max_extra_keys: LEAD_LIMITS.extraMaxKeys,
      max_extra_key_len: LEAD_LIMITS.extraKeyMaxBytes,
      max_extra_val_len: LEAD_LIMITS.extraValueMaxBytes,
      token_min_age_seconds: LEAD_LIMITS.tokenMinAgeSeconds,
      token_max_age_seconds: LEAD_LIMITS.tokenMaxAgeSeconds,
    }).toEqual(catalogFixture.limits);
  });
});

describe('client wire assumptions match the OpenAPI subset', () => {
  const schemas = openapiFixture.components.schemas;

  it('serves the SDK endpoints under /v1', () => {
    expect(openapiFixture.servers).toEqual([expect.objectContaining({ url: '/v1' })]);
    expect(openapiFixture.paths['/sdk/forms'].get).toBeDefined();
    expect(openapiFixture.paths['/sdk/forms/{form_id}'].get).toBeDefined();
    expect(openapiFixture.paths['/sdk/leads'].post).toBeDefined();
  });

  it('GET /sdk/forms takes kind=quote|contact defaulting to quote', () => {
    const kind = openapiFixture.paths['/sdk/forms'].get.parameters[0];
    expect(kind).toMatchObject({
      name: 'kind',
      in: 'query',
      schema: expect.objectContaining({ enum: ['quote', 'contact'], default: 'quote' }),
    });
  });

  it('form schema response has the fields getFormSchema maps', () => {
    expect(schemas.SDKFormBody.required).toEqual([
      'id',
      'name',
      'kind',
      'catalog_version',
      'fields',
      'branding',
      'captcha',
      'token',
    ]);
    expect(schemas.SDKFormBranding.required).toEqual(['tenant_name', 'logo_url', 'primary_hex']);
    expect(schemas.MergedField.required).toEqual(['key', 'type', 'label', 'required', 'max_len']);
    expect(Object.keys(schemas.MergedField.properties).sort()).toEqual([
      'key',
      'label',
      'maps_to',
      'max_len',
      'options',
      'required',
      'type',
    ]);
    expect(schemas.SDKCaptchaBody.required).toEqual(['provider', 'sitekey']);
  });

  it('lead submission request/response match submitLead', () => {
    expect(schemas.SDKLeadInputBody.required).toEqual(['form_id', 'fields', 'token']);
    expect(Object.keys(schemas.SDKLeadInputBody.properties).sort()).toEqual([
      '$schema',
      'captcha_token',
      'extra',
      'fields',
      'form_id',
      'token',
      'website',
    ]);
    expect(schemas.SDKLeadBody.required).toEqual(['submission_id', 'status']);
  });

  it('errors are RFC7807 problems with a detail string and optional errors list', () => {
    expect(schemas.ErrorModel.properties.detail.type).toBe('string');
    expect(schemas.ErrorModel.properties.errors.items.$ref).toBe(
      '#/components/schemas/ErrorDetail',
    );
    expect(Object.keys(schemas.ErrorDetail.properties).sort()).toEqual([
      'location',
      'message',
      'value',
    ]);
  });
});
