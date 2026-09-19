import { createClient, type TrackingSnapshot } from '@snowtrackerpro/sdk-core';
import {
  useEffect,
  useId,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import { loadMaps } from './mapsLoader.js';
import { MarkerLayer, type LayerTractor } from './markerLayer.js';
import { TrackingPoller } from './poller.js';
import { ensureStyles } from './styles.js';
import { ageMs, isDropped, isStale, serverNowMs } from './trackingAge.js';

/** Every piece of text the component can show. Pass any subset to override. */
export interface LiveTrackerLabels {
  /** First option of the route filter. */
  allTractors: string;
  /** Accessible name of the route filter. */
  routeFilter: string;
  /** Nobody is out at all. */
  noTractors: string;
  /** The selected route has nobody on it. */
  noTractorsOnRoute: string;
  /** The business has not switched on its public live map (404). */
  unavailable: string;
  /** Developer-facing: the key lacks the tracking scope, or this origin is not allowed (403). */
  forbidden: string;
  /** Developer-facing: the publishable key was not accepted (401). */
  unauthorized: string;
  /** The first load failed for another reason; the component keeps retrying. */
  loadError: string;
  /** Developer-facing: `googleMapsApiKey` is missing. */
  missingGoogleMapsApiKey: string;
  /** Developer-facing: `publishableKey` is missing. */
  missingPublishableKey: string;
  /** Google Maps itself failed to load. */
  mapsLoadError: string;
  /** Caption suffix for a tractor that has gone quiet, e.g. "3m ago". */
  lastSeen: (minutes: number) => string;
}

export interface LiveTrackerProps {
  /** A SnowTracker publishable key (`pk_live_…` / `pk_test_…`) carrying the tracking scope. */
  publishableKey: string;
  /** YOUR Google Maps JavaScript API key. Required — SnowTracker never ships or proxies one. */
  googleMapsApiKey: string;
  /** API base URL. Defaults to https://api.snowtracker.pro. */
  baseUrl?: string;
  /** Your Google Maps Map ID. Defaults to `DEMO_MAP_ID`, which is for testing only. Read once, at mount. */
  mapId?: string;
  /** Route selected at first render. Defaults to "All tractors". */
  defaultRouteId?: string;
  /** Where the map rests when nobody is out and the business has no location set. */
  defaultCenter?: { lat: number; lng: number };
  /** Zoom used while the map is resting on a centre. Defaults to 12. */
  defaultZoom?: number;
  /** Class for the outer container (default size: width 100%, height 480px). */
  className?: string;
  style?: CSSProperties;
  /** Class for the native route `<select>`. */
  selectClassName?: string;
  labels?: Partial<LiveTrackerLabels>;
  /** Called when the API reports that live tracking is not switched on (404). */
  onUnavailable?: () => void;
}

const DEFAULT_LABELS: LiveTrackerLabels = {
  allTractors: 'All tractors',
  routeFilter: 'Route',
  noTractors: 'No tractors are out right now.',
  noTractorsOnRoute: 'No tractors on this route right now.',
  unavailable: 'Live tracking isn’t available right now.',
  forbidden:
    'LiveTracker: the API refused this request (403). Either the publishable key does not have ' +
    'the live tracking scope, or this website’s origin is not on the key’s allowed list — ' +
    'check Settings → Publishable Keys.',
  unauthorized:
    'LiveTracker: the publishable key was not accepted (401). Check that publishableKey is a ' +
    'current pk_live_… / pk_test_… key and that baseUrl points at the matching environment.',
  loadError: 'Live tracking couldn’t load. Trying again…',
  missingGoogleMapsApiKey: 'LiveTracker needs a Google Maps API key — pass googleMapsApiKey',
  missingPublishableKey: 'LiveTracker needs a SnowTracker publishable key — pass publishableKey',
  mapsLoadError: 'The map couldn’t load.',
  lastSeen: (minutes) =>
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes}m ago`
        : `${Math.floor(minutes / 60)}h ago`,
};

const DEFAULT_MAP_ID = 'DEMO_MAP_ID';
const DEFAULT_ZOOM = 12;
/** Where a map with nothing to show and nowhere to rest sits: a wide view of North America. */
const NEUTRAL_VIEW = { center: { lat: 48, lng: -96 }, zoom: 4 };

type Problem = 'unavailable' | 'forbidden' | 'unauthorized' | 'error';

interface Feed {
  snapshot: TrackingSnapshot | null;
  /** Local epoch ms at which `snapshot` arrived — carries the server clock forward between polls. */
  receivedAt: number;
  /** Set while the latest poll failed. A good snapshot clears it. */
  problem: Problem | null;
  /** Bumped on every poll result so ages are re-measured even when a poll fails. */
  beat: number;
}

const EMPTY_FEED: Feed = { snapshot: null, receivedAt: 0, problem: null, beat: 0 };

function problemOf(error: unknown): Problem {
  const e = (error ?? {}) as { code?: unknown; status?: unknown };
  if (e.code === 'tracking_unavailable' || e.status === 404) return 'unavailable';
  if (e.status === 403) return 'forbidden';
  if (e.status === 401) return 'unauthorized';
  return 'error';
}

const reported = new Set<string>();
/** console.error a developer-facing problem once per page, never during render. */
function reportOnce(message: string): void {
  if (reported.has(message)) return;
  reported.add(message);
  console.error(message);
}

/**
 * A live map of the business's tractors, filterable by route. Shows vehicle
 * names only, only while a tractor is out on a route, and only when the
 * business has switched on its public live map.
 */
export function LiveTracker(props: LiveTrackerProps): ReactElement {
  const {
    publishableKey,
    googleMapsApiKey,
    baseUrl,
    mapId,
    defaultRouteId,
    defaultCenter,
    defaultZoom,
    className,
    style,
    selectClassName,
    onUnavailable,
  } = props;

  const labels = useMemo<LiveTrackerLabels>(
    () => ({ ...DEFAULT_LABELS, ...props.labels }),
    [props.labels],
  );
  const selectId = useId();

  const hasMapsKey = typeof googleMapsApiKey === 'string' && googleMapsApiKey.trim() !== '';
  const hasPublishableKey = typeof publishableKey === 'string' && publishableKey.trim() !== '';
  const configError = !hasMapsKey
    ? labels.missingGoogleMapsApiKey
    : !hasPublishableKey
      ? labels.missingPublishableKey
      : null;

  const [feed, setFeed] = useState<Feed>(EMPTY_FEED);
  const [routeId, setRouteId] = useState<string>(defaultRouteId ?? '');
  const [mapsFailed, setMapsFailed] = useState(false);
  const [layer, setLayer] = useState<MarkerLayer | null>(null);
  // Google Maps is loaded — and billed to the integrator's key — only once the
  // API has confirmed there is a live map to show.
  const [mapWanted, setMapWanted] = useState(false);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  /** What the camera was last framed for, so a poll never fights a visitor's panning. */
  const framedForRef = useRef<string | null>(null);
  // Read-once / latest-value props, kept out of effect dependency lists.
  const initialRef = useRef({ mapId, defaultCenter, defaultZoom });
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useInsertionEffect(() => {
    ensureStyles(document);
  }, []);

  useEffect(() => {
    if (configError !== null) reportOnce(configError);
  }, [configError]);

  // ── the feed ───────────────────────────────────────────────────────────────
  const client = useMemo(() => {
    if (!hasMapsKey || !hasPublishableKey) return null;
    try {
      return createClient({ publishableKey, baseUrl });
    } catch {
      return null;
    }
  }, [hasMapsKey, hasPublishableKey, publishableKey, baseUrl]);

  useEffect(() => {
    if (!client) return;
    setFeed(EMPTY_FEED);
    const poller = new TrackingPoller(client, {
      onSnapshot: (snapshot) => {
        setMapWanted(true);
        setFeed((f) => ({ snapshot, receivedAt: Date.now(), problem: null, beat: f.beat + 1 }));
      },
      onError: (error) => {
        const problem = problemOf(error);
        // Switched off, or refused: whatever was on the map must come down.
        // A passing fault (network, 429) keeps the last snapshot and lets it age.
        setFeed((f) => ({
          snapshot: problem === 'error' ? f.snapshot : null,
          receivedAt: f.receivedAt,
          problem,
          beat: f.beat + 1,
        }));
      },
    });
    poller.start();
    return () => poller.stop();
  }, [client]);

  // Announce "not switched on" once per change of state, not on every poll.
  const unavailable = feed.problem === 'unavailable';
  useEffect(() => {
    if (unavailable) onUnavailableRef.current?.();
  }, [unavailable]);

  const forbidden = feed.problem === 'forbidden';
  const unauthorized = feed.problem === 'unauthorized';
  useEffect(() => {
    if (forbidden) reportOnce(labels.forbidden);
    if (unauthorized) reportOnce(labels.unauthorized);
  }, [forbidden, unauthorized, labels.forbidden, labels.unauthorized]);

  // ── what to draw ───────────────────────────────────────────────────────────
  const snapshot = feed.snapshot;
  const routes = useMemo(() => snapshot?.routes ?? [], [snapshot]);
  // A route that has since been deleted falls back to "All tractors".
  const activeRouteId = routes.some((r) => r.id === routeId) ? routeId : '';

  const { visible, anyOut } = useMemo(() => {
    if (!snapshot) return { visible: [] as LayerTractor[], anyOut: false };
    const now = serverNowMs(snapshot.asOf, feed.receivedAt, Date.now());
    const colorOf = new Map(snapshot.routes.map((r) => [r.id, r.color]));
    const out = snapshot.tractors.filter((t) => !isDropped(t.recordedAt, now));
    const shown = out
      .filter((t) => activeRouteId === '' || t.routeId === activeRouteId)
      .map((t): LayerTractor => {
        const stale = isStale(t.recordedAt, now);
        const minutes = Math.floor(ageMs(t.recordedAt, now) / 60_000);
        return {
          id: t.id,
          lat: t.lat,
          lng: t.lng,
          icon: t.icon,
          headingDeg: t.headingDeg,
          ringColor: colorOf.get(t.routeId) ?? null,
          stale,
          caption: stale ? `${t.vehicleName} · ${labels.lastSeen(minutes)}` : t.vehicleName,
        };
      });
    return { visible: shown, anyOut: out.length > 0 };
    // feed.beat is here on purpose: it re-measures ages on every poll result,
    // including failed ones, so a viewer who goes offline still sees markers age out.
  }, [snapshot, feed.receivedAt, feed.beat, activeRouteId, labels]);

  // ── the map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (configError !== null || !mapWanted) return;
    let cancelled = false;
    let created: MarkerLayer | null = null;
    loadMaps(googleMapsApiKey)
      .then((api) => {
        const el = mapElRef.current;
        if (cancelled || !el) return;
        const initial = initialRef.current;
        const map = new api.Map(el, {
          mapId: initial.mapId ?? DEFAULT_MAP_ID,
          center: initial.defaultCenter ?? NEUTRAL_VIEW.center,
          zoom: initial.defaultCenter ? (initial.defaultZoom ?? DEFAULT_ZOOM) : NEUTRAL_VIEW.zoom,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        created = new MarkerLayer(api, map, document);
        setMapsFailed(false);
        setLayer(created);
      })
      .catch(() => {
        if (!cancelled) setMapsFailed(true);
      });
    return () => {
      cancelled = true;
      created?.destroy();
      mapRef.current = null;
      framedForRef.current = null;
      setLayer(null);
    };
  }, [configError, mapWanted, googleMapsApiKey]);

  useEffect(() => {
    if (!layer) return;
    layer.sync(visible);

    const map = mapRef.current;
    if (!map || !snapshot) return;
    if (visible.length > 0) {
      // Frame the tractors when the selection changes (or they first appear) —
      // not on every poll, which would snatch the map back from a visitor.
      const key = `route:${activeRouteId}`;
      if (framedForRef.current !== key) {
        framedForRef.current = key;
        // Quiet markers shouldn't drag the view out to where a tractor was.
        const reporting = visible.filter((t) => !t.stale);
        layer.fit(reporting.length > 0 ? reporting : visible);
      }
      return;
    }
    if (anyOut) {
      // An empty route: leave the camera be, but forget the framing so the
      // route is framed afresh when someone heads out on it.
      framedForRef.current = null;
      return;
    }
    // Nobody out at all: rest on the business's location.
    if (framedForRef.current !== 'rest') {
      framedForRef.current = 'rest';
      const rest = snapshot.center ?? initialRef.current.defaultCenter;
      if (rest) {
        map.setCenter(rest);
        map.setZoom(initialRef.current.defaultZoom ?? DEFAULT_ZOOM);
      }
    }
  }, [layer, visible, anyOut, activeRouteId, snapshot]);

  // ── render ─────────────────────────────────────────────────────────────────
  const rootClass = className ? `stp-lt ${className}` : 'stp-lt';

  if (configError !== null) {
    return (
      <div className={rootClass} style={style}>
        <div className="stp-lt-error" role="alert">
          {configError}
        </div>
      </div>
    );
  }

  let panel: ReactElement | null = null;
  if (unavailable) {
    panel = (
      <div className="stp-lt-panel" role="status">
        {labels.unavailable}
      </div>
    );
  } else if (forbidden || unauthorized) {
    panel = (
      <div className="stp-lt-panel">
        <div className="stp-lt-error" role="alert">
          {forbidden ? labels.forbidden : labels.unauthorized}
        </div>
      </div>
    );
  } else if (mapsFailed) {
    panel = (
      <div className="stp-lt-panel" role="alert">
        {labels.mapsLoadError}
      </div>
    );
  }

  let overlay: string | null = null;
  if (panel === null) {
    if (!snapshot) overlay = feed.problem === 'error' ? labels.loadError : null;
    else if (!anyOut) overlay = labels.noTractors;
    else if (visible.length === 0) overlay = labels.noTractorsOnRoute;
  }

  return (
    <div className={rootClass} style={style}>
      <div className="stp-lt-bar">
        <label className="stp-lt-sr" htmlFor={selectId}>
          {labels.routeFilter}
        </label>
        <select
          id={selectId}
          className={selectClassName ? `stp-lt-select ${selectClassName}` : 'stp-lt-select'}
          value={activeRouteId}
          disabled={panel !== null}
          onChange={(e) => setRouteId(e.target.value)}
        >
          <option value="">{labels.allTractors}</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="stp-lt-stage">
        <div className="stp-lt-map" ref={mapElRef} />
        {overlay !== null && (
          <div className="stp-lt-overlay" role="status">
            <div className="stp-lt-overlay__msg">{overlay}</div>
          </div>
        )}
        {panel}
      </div>
    </div>
  );
}
