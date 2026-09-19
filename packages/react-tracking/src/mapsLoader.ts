// Loads the Google Maps JavaScript API through @googlemaps/js-api-loader v2
// (functional API: setOptions() once, then importLibrary()).
//
// If the host page already has Google Maps — its own loader, a <script> tag,
// another widget — that copy is reused and the key it was loaded with stays in
// charge: Maps can only be bootstrapped once per page.
//
// Nothing here runs at module scope; call it from an effect.
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export interface MapsApi {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  LatLngBounds: typeof google.maps.LatLngBounds;
}

let pending: Promise<MapsApi> | null = null;
let optionsSet = false;

export function loadMaps(apiKey: string): Promise<MapsApi> {
  if (pending) return pending;

  const existing = window.google?.maps?.importLibrary;
  let load: <T>(name: string) => Promise<T>;
  if (typeof existing === 'function' && !optionsSet) {
    // Already on the page: use it directly rather than through the loader,
    // which would log a "setOptions ignored" notice on the host's console.
    load = <T>(name: string) => window.google.maps.importLibrary(name) as Promise<T>;
  } else {
    if (!optionsSet) {
      setOptions({ key: apiKey, v: 'weekly' });
      optionsSet = true;
    }
    load = <T>(name: string) => importLibrary(name as 'maps') as Promise<T>;
  }

  const attempt = Promise.all([
    load<google.maps.MapsLibrary>('maps'),
    load<google.maps.MarkerLibrary>('marker'),
    load<google.maps.CoreLibrary>('core'),
  ]).then(([maps, marker, core]) => ({
    Map: maps.Map,
    AdvancedMarkerElement: marker.AdvancedMarkerElement,
    LatLngBounds: core.LatLngBounds,
  }));
  pending = attempt;
  // A failed load (offline, blocked script) may be retried by a later mount.
  attempt.catch(() => {
    if (pending === attempt) pending = null;
  });
  return attempt;
}
