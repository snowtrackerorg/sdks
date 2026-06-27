import { SnowTrackerError } from './errors.js';
import type { ClientOptions, SnowTrackerClient, TenantInfo } from './types.js';

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

/** Create a SnowTracker SDK client bound to a publishable key. */
export function createClient(opts: ClientOptions): SnowTrackerClient {
  if (!opts || !opts.publishableKey) {
    throw new SnowTrackerError('publishableKey is required', 'config_error', 0);
  }
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const key = opts.publishableKey;

  async function request<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, { headers: { [KEY_HEADER]: key } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network request failed';
      throw new SnowTrackerError(message, 'network_error', 0);
    }
    if (!res.ok) {
      let message = `request failed with status ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: unknown; message?: unknown };
        if (typeof body.detail === 'string') message = body.detail;
        else if (typeof body.message === 'string') message = body.message;
      } catch {
        // non-JSON body; keep the default message
      }
      throw new SnowTrackerError(message, statusToCode(res.status), res.status);
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
  };
}
