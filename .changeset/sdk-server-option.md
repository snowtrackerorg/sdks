---
'@snowtrackerpro/sdk-core': minor
'@snowtrackerpro/sdk-tracking-react': minor
---

Add a `server` option (`'production'` | `'staging'`) to `createClient` and a matching `server` prop on `<LiveTracker>`. Production stays the default; pass a staging key with `server: 'staging'` so switching environments is one config value. `baseUrl` still overrides both.
