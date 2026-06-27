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

export interface SnowTrackerClient {
  /** Fetch public display info for the key's tenant (GET /v1/sdk/tenant). */
  getTenant(): Promise<TenantInfo>;
}
