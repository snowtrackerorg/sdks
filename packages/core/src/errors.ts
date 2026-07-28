/**
 * Stable error codes. The union is open (`string`) so a future server
 * status maps without a breaking change, but known codes narrow and
 * autocomplete.
 */
export type SnowTrackerErrorCode =
  | 'config_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'network_error'
  | 'http_error'
  | (string & Record<never, never>);

export interface SnowTrackerErrorOptions {
  /** Seconds to wait before retrying (from the 429 Retry-After header). */
  retryAfter?: number;
  /** Per-field validation messages parsed from a 422 problem response, keyed by field key. */
  fieldErrors?: Record<string, string>;
}

/** Error thrown for every SnowTracker SDK failure. `status` is 0 for network errors. */
export class SnowTrackerError extends Error {
  readonly code: SnowTrackerErrorCode;
  readonly status: number;
  /** Set on `rate_limited` (429) errors when the server sent Retry-After. */
  readonly retryAfter?: number;
  /** Set on `validation_error` (422) errors when the server named the offending field(s). */
  readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    code: SnowTrackerErrorCode,
    status: number,
    options: SnowTrackerErrorOptions = {},
  ) {
    super(message);
    this.name = 'SnowTrackerError';
    this.code = code;
    this.status = status;
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
    if (options.fieldErrors !== undefined) this.fieldErrors = options.fieldErrors;
  }
}
