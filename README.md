# SnowTracker.pro SDKs

Official SDKs for embedding SnowTracker.pro on your website — request-a-quote / contact
forms and live vehicle tracking.

## Packages

| Package                                                           | Description                                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`@snowtrackerpro/sdk-core`](./packages/core)                     | Shared client + publishable-key auth: tenant info, form schemas, lead validation + submission.                         |
| [`@snowtrackerpro/sdk-forms-react`](./packages/react-forms)       | Headless `useSnowtrackerForm()` React hook for quote/contact forms — bring your own markup.                            |
| [`@snowtrackerpro/sdk-tracking-react`](./packages/react-tracking) | Drop-in `<LiveTracker>` React map of the tractors out right now, filterable by route — bring your own Google Maps key. |

More packages (a framework-free `<snowtracker-form>` widget, a `<script>`-tag embed) are coming.

## Authentication

The SDKs authenticate with a **publishable key** (`pk_live_…` / `pk_test_…`) created in
your SnowTracker dashboard under **Settings → Publishable Keys**. Publishable keys are
safe to ship in client-side code; restrict each key to the domains it runs on.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

MIT licensed.
