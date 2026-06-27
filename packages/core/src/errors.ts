/** Error thrown for every SnowTracker SDK failure. `status` is 0 for network errors. */
export class SnowTrackerError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'SnowTrackerError';
    this.code = code;
    this.status = status;
  }
}
