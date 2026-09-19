# @snowtrackerpro/sdk-tracking-react

A drop-in React live map for [SnowTracker.pro](https://snowtracker.pro): put your
tractors on your own website, with a route filter, in one component. React ≥ 18.

## Install

```sh
npm install @snowtrackerpro/sdk-tracking-react
```

You also need a **Google Maps JavaScript API key** of your own — see
[Google Maps key and Map ID](#google-maps-key-and-map-id).

## Usage

```tsx
import { LiveTracker } from '@snowtrackerpro/sdk-tracking-react';

export function WhereAreTheTractors() {
  return <LiveTracker publishableKey="pk_live_…" googleMapsApiKey="AIza…" mapId="your-map-id" />;
}
```

That is the whole integration. The component fetches the live map every 10 seconds,
draws one marker per tractor (vehicle icon, vehicle name, a ring in the route's colour,
an arrow for its heading), and glides markers between updates. The dropdown lists
**All tractors** and then every saved route; picking a route shows only the tractors on
it and frames the map on them.

### Next.js (App Router)

The package is already marked `'use client'`, so you can render it straight from a
Server Component — no wrapper file, no `'use client'` of your own:

```tsx
// app/live/page.tsx — a Server Component
import { LiveTracker } from '@snowtrackerpro/sdk-tracking-react';

export default function LivePage() {
  return (
    <main>
      <h1>Where are we right now?</h1>
      <LiveTracker
        publishableKey={process.env.NEXT_PUBLIC_SNOWTRACKER_KEY!}
        googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!}
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
        className="live-map"
      />
    </main>
  );
}
```

It renders safely on the server (an empty map frame and the dropdown); Google Maps and
the polling start in the browser.

## Props

| Prop               | Type                         | Default                       | Notes                                                                                                |
| ------------------ | ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `publishableKey`   | `string`                     | — (required)                  | `pk_live_…` / `pk_test_…` from **Settings → Publishable Keys**, with the live tracking scope.        |
| `googleMapsApiKey` | `string`                     | — (required)                  | Your own Google Maps key. Missing → an inline error box, never a crash.                              |
| `baseUrl`          | `string`                     | `https://api.snowtracker.pro` | API base URL.                                                                                        |
| `mapId`            | `string`                     | `'DEMO_MAP_ID'`               | Your Google Maps Map ID. Read once, at mount. **Set your own for production.**                       |
| `defaultRouteId`   | `string`                     | All tractors                  | Route selected at first render. An id that is not a saved route falls back to All tractors.          |
| `defaultCenter`    | `{ lat, lng }`               | —                             | Where the map rests when nobody is out and the business has no location set. Read once, at mount.    |
| `defaultZoom`      | `number`                     | `12`                          | Zoom while the map is resting on a centre. Read once, at mount.                                      |
| `className`        | `string`                     | —                             | Class for the outer container.                                                                       |
| `style`            | `CSSProperties`              | —                             | Inline style for the outer container.                                                                |
| `selectClassName`  | `string`                     | —                             | Class for the native route `<select>`.                                                               |
| `labels`           | `Partial<LiveTrackerLabels>` | English                       | Override any string the component shows.                                                             |
| `onUnavailable`    | `() => void`                 | —                             | Called once when the API reports that live tracking is not switched on — hide your own heading, say. |

### Sizing and styling

The container defaults to `width: 100%; height: 480px`. There is no CSS file to import:
the component injects one small `<style id="stp-lt-styles">` with `stp-lt-`-prefixed
class names. Its layout defaults have zero specificity, so any class you pass wins:

```css
.live-map {
  height: 70vh;
}
```

On a server-rendered page, give the container a height through `className` or `style`
if you want to avoid a layout shift before the component's own styles arrive.

### What visitors see

| Situation                                 | Shown                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Tractors out                              | Markers, framed on the map                                                   |
| The selected route has nobody on it       | The map, with “No tractors on this route right now.”                         |
| Nobody out at all                         | The map resting on your location, with “No tractors are out right now.”      |
| Live tracking is not switched on          | A calm panel: “Live tracking isn’t available right now.” (+ `onUnavailable`) |
| A tractor has not reported for 2 minutes  | Its marker dims and its label gains “· 3m ago”                               |
| A tractor has not reported for 15 minutes | Its marker is removed                                                        |

Ages are measured against the server's clock, so a visitor whose computer clock is wrong
still sees the right thing.

Every string is overridable:

```tsx
<LiveTracker
  {...keys}
  labels={{
    allTractors: 'Tous les tracteurs',
    noTractors: 'Aucun tracteur en route pour le moment.',
    lastSeen: (minutes) => `il y a ${minutes} min`,
  }}
/>
```

### Messages for you, not your visitors

Two problems are configuration mistakes, so they are spelled out on the page and in the
console rather than hidden:

- **403** — the publishable key does not have the live tracking scope, or this website's
  origin is not on the key's allowed list. Fix both under **Settings → Publishable Keys**.
- **401** — the publishable key was not accepted (wrong key, or a `baseUrl` pointing at
  a different environment).

## Google Maps key and Map ID

**You bring the Google Maps key.** SnowTracker never ships, shares or proxies one — map
loads are billed to your own Google Cloud project, under your own quotas.

1. In Google Cloud, enable the **Maps JavaScript API** and create an API key. Restrict it
   to your website's HTTP referrers.
2. Create a **Map ID** (Google Maps Platform → Map Management, type _JavaScript_,
   _Vector_ or _Raster_) and pass it as `mapId`. The markers are Google's Advanced
   Markers, which require a Map ID. The default, `DEMO_MAP_ID`, is Google's testing
   value: fine for trying the component out, **not for production**.

The map is loaded only once SnowTracker has confirmed there is a live map to show, so a
business with tracking switched off costs you no map loads. The component loads Google
Maps through [`@googlemaps/js-api-loader`](https://github.com/googlemaps/js-api-loader).
If your page has already loaded Google Maps, that copy is reused — and the key it was
loaded with stays in charge, because Maps can only be loaded once per page.

## Privacy

The live map is deliberately narrow:

- It shows **vehicle names only** (“Tractor 4”). There are no driver names, phone
  numbers or any other personal details in the data this package receives.
- A tractor appears **only while it is out on a route**. No route, no marker; once it
  stops reporting it fades, then disappears.
- Nothing is shown at all unless the business has **switched on its public live map** in
  SnowTracker. Until then the API answers “not available” and the component says so.

## Authentication

Requests authenticate with a **publishable key** (`pk_live_…` / `pk_test_…`) from
**Settings → Publishable Keys**, restricted to the origins you allowlist. The key must
carry the live tracking scope. Publishable keys are safe to ship in browser code.

## License

[MIT](./LICENSE)
