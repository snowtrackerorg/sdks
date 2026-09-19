// The poll loop behind <LiveTracker>. Framework-free and internal — not part
// of the package's public API.
//
//   * one request every INTERVAL_MS, never two at once;
//   * nothing while the tab is hidden, and a fresh request the moment it is
//     shown again — a map in a background tab costs the business nothing;
//   * errors back off exponentially to MAX_BACKOFF_MS, and a 429's Retry-After
//     is honoured even across a hide/show;
//   * stop() aborts the in-flight request and removes every timer + listener.
import type { TrackingSnapshot } from '@snowtrackerpro/sdk-core';

export const INTERVAL_MS = 10_000;
export const MAX_BACKOFF_MS = 60_000;

export interface PollerClient {
  getTracking(opts: { signal: AbortSignal }): Promise<TrackingSnapshot>;
}

export interface PollerHandlers {
  onSnapshot(snapshot: TrackingSnapshot): void;
  onError(error: unknown): void;
}

export interface PollerOptions {
  intervalMs?: number;
  maxBackoffMs?: number;
}

function retryAfterMs(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const seconds = (error as { retryAfter?: unknown }).retryAfter;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds * 1000;
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

export class TrackingPoller {
  private readonly intervalMs: number;
  private readonly maxBackoffMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private inFlight = false;
  private running = false;
  private failures = 0;
  /** Epoch ms before which no request may start (set from a 429's Retry-After). */
  private notBefore = 0;

  constructor(
    private readonly client: PollerClient,
    private readonly handlers: PollerHandlers,
    options: PollerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? INTERVAL_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (!pageHidden()) void this.tick();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.controller?.abort();
    this.controller = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.running) return;
    if (pageHidden()) {
      // Let an in-flight request finish; just stop scheduling new ones.
      this.clearTimer();
      return;
    }
    const wait = this.notBefore - Date.now();
    if (wait > 0) this.schedule(wait);
    else void this.tick();
  };

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    if (!this.running || pageHidden()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.inFlight) return;
    this.clearTimer();
    this.inFlight = true;
    const controller = new AbortController();
    this.controller = controller;
    let delay = this.intervalMs;
    try {
      const snapshot = await this.client.getTracking({ signal: controller.signal });
      if (!this.running || controller.signal.aborted) return;
      this.failures = 0;
      this.notBefore = 0;
      this.handlers.onSnapshot(snapshot);
    } catch (error) {
      if (!this.running || controller.signal.aborted) return;
      this.failures += 1;
      const backoff = Math.min(this.intervalMs * 2 ** this.failures, this.maxBackoffMs);
      const retryAfter = retryAfterMs(error);
      // Never sooner than the server asked, and never sooner than our own backoff.
      delay = retryAfter !== undefined ? Math.max(retryAfter, backoff) : backoff;
      if (retryAfter !== undefined) this.notBefore = Date.now() + retryAfter;
      this.handlers.onError(error);
    } finally {
      this.inFlight = false;
      if (this.controller === controller) this.controller = null;
    }
    this.schedule(delay);
  }
}
