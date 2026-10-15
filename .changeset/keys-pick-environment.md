---
'@snowtrackerpro/sdk-core': minor
'@snowtrackerpro/sdk-forms-react': patch
'@snowtrackerpro/sdk-tracking-react': patch
---

The publishable key now decides the environment. A staging key (`pk_live_stg_…` / `pk_test_stg_…`) talks to `https://api.staging.snowtracker.pro`; any other key talks to `https://api.snowtracker.pro`. `baseUrl` becomes an override rather than a requirement. New exports from `@snowtrackerpro/sdk-core`: `resolveBaseUrl(publishableKey, baseUrl?)` and `API_BASE_URLS`.
