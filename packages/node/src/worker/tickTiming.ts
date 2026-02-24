const MIN_EVENT_POLL_INTERVAL_MS = 1;
const MAX_EVENT_POLL_INTERVAL_MS = 4;
const MIN_IDLE_BACKOFF_MS = 16;
const MAX_IDLE_BACKOFF_MS = 50;

type TickTiming = Readonly<{
  tickIntervalMs: number;
  maxIdleDelayMs: number;
}>;

function sanitizeFpsCap(fpsCap: number): number {
  if (!Number.isFinite(fpsCap) || fpsCap <= 0) return 60;
  return Math.max(1, Math.floor(fpsCap));
}

export function computeTickTiming(fpsCap: number): TickTiming {
  const safeFpsCap = sanitizeFpsCap(fpsCap);
  const intervalFromFps = Math.max(MIN_EVENT_POLL_INTERVAL_MS, Math.floor(1000 / safeFpsCap));
  const tickIntervalMs = Math.min(MAX_EVENT_POLL_INTERVAL_MS, intervalFromFps);
  const maxIdleDelayMs = Math.max(
    MIN_IDLE_BACKOFF_MS,
    Math.min(MAX_IDLE_BACKOFF_MS, tickIntervalMs * 8),
  );
  return Object.freeze({ tickIntervalMs, maxIdleDelayMs });
}

export function computeNextIdleDelay(
  currentIdleDelayMs: number,
  tickIntervalMs: number,
  maxIdleDelayMs: number,
): number {
  const base = Math.max(MIN_EVENT_POLL_INTERVAL_MS, Math.floor(tickIntervalMs));
  const boundedMax = Math.max(base, Math.floor(maxIdleDelayMs));
  const current = Number.isFinite(currentIdleDelayMs) ? Math.floor(currentIdleDelayMs) : 0;
  const next = current > 0 ? current * 2 : base;
  return Math.min(boundedMax, Math.max(base, next));
}
