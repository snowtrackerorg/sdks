# @snowtrackerpro/sdk-core

Core client for the [SnowTracker.pro](https://snowtracker.pro) SDKs. Framework-free, zero runtime dependencies.

## Install

```sh
npm install @snowtrackerpro/sdk-core
```

## Usage

```ts
import { createClient } from '@snowtrackerpro/sdk-core';

const client = createClient({
  publishableKey: 'pk_live_…', // Settings → Publishable Keys in your SnowTracker dashboard
});

const tenant = await client.getTenant();
// { tenantId, tenantName, mode, logoUrl, primaryHex }
```

## Authentication

Requests are authenticated with a **publishable key** (`pk_live_…` / `pk_test_…`). Publishable keys are safe to ship in browser code: they identify your SnowTracker account and are restricted to the origins you allowlist in the dashboard. Test-mode keys additionally work from `localhost`.

## Errors

All failures throw `SnowTrackerError` with a stable `code` (`config_error`, `unauthorized`, `forbidden`, `not_found`, `network_error`, `http_error`) and the HTTP `status` (`0` for network failures).

## License

[MIT](./LICENSE)
