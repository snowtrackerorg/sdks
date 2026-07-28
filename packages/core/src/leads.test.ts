import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClient } from './client.js';

const FORM_WIRE = {
  id: 'form_01H',
  name: 'Quote request',
  kind: 'quote',
  catalog_version: 1,
  fields: [
    {
      key: 'name',
      type: 'text',
      label: 'Full name',
      required: true,
      max_len: 200,
      maps_to: 'customer.name',
    },
    {
      key: 'driveway_surface',
      type: 'select',
      label: 'Driveway surface',
      required: false,
      max_len: 32,
      options: [{ value: 'paved', label: 'Paved' }],
      maps_to: 'property.driveway_surface',
    },
    {
      key: 'referral_details',
      type: 'text',
      label: 'Referral details',
      required: false,
      max_len: 500,
    },
  ],
  branding: { tenant_name: 'Acme Snow', logo_url: 'https://img/x.png', primary_hex: '#00bfff' },
  captcha: null,
  token: 'tok_abc',
};

function mockFetchOnce(
  body: unknown,
  init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  } as Response);
}

function client() {
  return createClient({ publishableKey: 'pk_test_x', baseUrl: 'http://localhost:8080' });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getFormSchema', () => {
  it('fetches the default form by kind and maps the wire response', async () => {
    const fetchMock = mockFetchOnce(FORM_WIRE);
    vi.stubGlobal('fetch', fetchMock);
    const schema = await client().getFormSchema({ kind: 'quote' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/v1/sdk/forms?kind=quote', {
      headers: { 'X-Snowtracker-Publishable-Key': 'pk_test_x' },
    });
    expect(schema).toEqual({
      id: 'form_01H',
      name: 'Quote request',
      kind: 'quote',
      catalogVersion: 1,
      fields: [
        {
          key: 'name',
          type: 'text',
          label: 'Full name',
          required: true,
          maxLen: 200,
          mapsTo: 'customer.name',
        },
        {
          key: 'driveway_surface',
          type: 'select',
          label: 'Driveway surface',
          required: false,
          maxLen: 32,
          options: [{ value: 'paved', label: 'Paved' }],
          mapsTo: 'property.driveway_surface',
        },
        {
          key: 'referral_details',
          type: 'text',
          label: 'Referral details',
          required: false,
          maxLen: 500,
        },
      ],
      branding: { tenantName: 'Acme Snow', logoUrl: 'https://img/x.png', primaryHex: '#00bfff' },
      captcha: null,
      token: 'tok_abc',
    });
  });

  it('defaults to kind=quote when called with no arguments', async () => {
    const fetchMock = mockFetchOnce(FORM_WIRE);
    vi.stubGlobal('fetch', fetchMock);
    await client().getFormSchema();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/sdk/forms?kind=quote',
      expect.anything(),
    );
  });

  it('fetches by form id when formId is given', async () => {
    const fetchMock = mockFetchOnce(FORM_WIRE);
    vi.stubGlobal('fetch', fetchMock);
    await client().getFormSchema({ formId: 'form_01H' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/sdk/forms/form_01H',
      expect.anything(),
    );
  });

  it('passes the captcha block through when present', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce({ ...FORM_WIRE, captcha: { provider: 'turnstile', sitekey: 'sk_1' } }),
    );
    const schema = await client().getFormSchema();
    expect(schema.captcha).toEqual({ provider: 'turnstile', sitekey: 'sk_1' });
  });
});

describe('submitLead', () => {
  it('POSTs the lead and maps the 201 response', async () => {
    const fetchMock = mockFetchOnce(
      { submission_id: 'lsub_01H', status: 'received' },
      { status: 201 },
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await client().submitLead({
      formId: 'form_01H',
      fields: { name: 'Jane Doe', email: 'jane@example.com', address: '1 Main St' },
      token: 'tok_abc',
    });
    expect(result).toEqual({ submissionId: 'lsub_01H', status: 'received' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/v1/sdk/leads');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'X-Snowtracker-Publishable-Key': 'pk_test_x',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      form_id: 'form_01H',
      fields: { name: 'Jane Doe', email: 'jane@example.com', address: '1 Main St' },
      website: '',
      token: 'tok_abc',
    });
  });

  it('forwards extra, captchaToken, and the honeypot website value verbatim', async () => {
    const fetchMock = mockFetchOnce(
      { submission_id: 'lsub_01H', status: 'received' },
      { status: 201 },
    );
    vi.stubGlobal('fetch', fetchMock);
    await client().submitLead({
      formId: 'form_01H',
      fields: { name: 'Jane' },
      extra: { gate_code: '1234' },
      website: 'https://spam.example',
      captchaToken: 'ct_1',
      token: 'tok_abc',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      form_id: 'form_01H',
      fields: { name: 'Jane' },
      extra: { gate_code: '1234' },
      website: 'https://spam.example',
      captcha_token: 'ct_1',
      token: 'tok_abc',
    });
  });

  it('maps a 422 to validation_error carrying the server detail and field errors', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(
        { title: 'Unprocessable Entity', status: 422, detail: 'email: invalid email address' },
        { ok: false, status: 422 },
      ),
    );
    await expect(
      client().submitLead({ formId: 'form_01H', fields: {}, token: 'tok_abc' }),
    ).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
      message: 'email: invalid email address',
      fieldErrors: { email: 'invalid email address' },
    });
  });

  it('collects field errors from a huma errors[] list', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(
        {
          status: 422,
          detail: 'validation failed',
          errors: [
            { location: 'body.fields.phone', message: 'must be a string' },
            {
              location: 'body.form_id',
              message: 'expected required property form_id to be present',
            },
          ],
        },
        { ok: false, status: 422 },
      ),
    );
    await expect(
      client().submitLead({ formId: 'form_01H', fields: {}, token: 'tok_abc' }),
    ).rejects.toMatchObject({
      code: 'validation_error',
      fieldErrors: {
        phone: 'must be a string',
        form_id: 'expected required property form_id to be present',
      },
    });
  });

  it('maps a 429 to rate_limited carrying Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(
        { status: 429, detail: 'rate limit exceeded — retry later' },
        { ok: false, status: 429, headers: { 'Retry-After': '37' } },
      ),
    );
    await expect(
      client().submitLead({ formId: 'form_01H', fields: {}, token: 'tok_abc' }),
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429, retryAfter: 37 });
  });

  it('maps a 403 (missing quotes:create scope) to forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(
        { status: 403, detail: 'publishable key lacks the quotes:create scope' },
        { ok: false, status: 403 },
      ),
    );
    await expect(
      client().submitLead({ formId: 'form_01H', fields: {}, token: 'tok_abc' }),
    ).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
      message: 'publishable key lacks the quotes:create scope',
    });
  });

  it('maps a 404 (unknown form) to not_found', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce({ status: 404, detail: 'form not found' }, { ok: false, status: 404 }),
    );
    await expect(
      client().submitLead({ formId: 'form_x', fields: {}, token: 'tok_abc' }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});
