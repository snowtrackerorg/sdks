import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClient } from './client.js';

const SAMPLE = {
  tenant_id: 'org_1',
  tenant_name: 'Acme',
  mode: 'test',
  logo_url: 'https://img/x.png',
  primary_hex: '#00bfff',
};

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createClient', () => {
  it('throws config_error on an empty key', () => {
    expect(() => createClient({ publishableKey: '' })).toThrow(
      expect.objectContaining({ code: 'config_error' }),
    );
  });

  it('sends the publishable-key header against the default base URL', async () => {
    const fetchMock = mockFetchOnce(SAMPLE);
    vi.stubGlobal('fetch', fetchMock);
    await createClient({ publishableKey: 'pk_test_x' }).getTenant();
    expect(fetchMock).toHaveBeenCalledWith('https://api.snowtracker.pro/v1/sdk/tenant', {
      headers: { 'X-Snowtracker-Publishable-Key': 'pk_test_x' },
    });
  });

  it('strips a trailing slash from a baseUrl override', async () => {
    const fetchMock = mockFetchOnce(SAMPLE);
    vi.stubGlobal('fetch', fetchMock);
    await createClient({
      publishableKey: 'pk_test_x',
      baseUrl: 'http://localhost:8080/',
    }).getTenant();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/sdk/tenant',
      expect.anything(),
    );
  });

  it('maps the tenant response into TenantInfo', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(SAMPLE));
    const t = await createClient({ publishableKey: 'pk_test_x' }).getTenant();
    expect(t).toEqual({
      tenantId: 'org_1',
      tenantName: 'Acme',
      mode: 'test',
      logoUrl: 'https://img/x.png',
      primaryHex: '#00bfff',
    });
  });

  it('maps a 401 to an unauthorized SnowTrackerError', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ detail: 'nope' }, { ok: false, status: 401 }));
    await expect(createClient({ publishableKey: 'pk_test_x' }).getTenant()).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });
  });

  it('maps a 403 to a forbidden SnowTrackerError', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ detail: 'no' }, { ok: false, status: 403 }));
    await expect(createClient({ publishableKey: 'pk_test_x' }).getTenant()).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });

  it('maps a 404 to a not_found SnowTrackerError', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ detail: 'gone' }, { ok: false, status: 404 }));
    await expect(createClient({ publishableKey: 'pk_test_x' }).getTenant()).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  it('maps a network failure to network_error with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expect(createClient({ publishableKey: 'pk_test_x' }).getTenant()).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
    });
  });
});
