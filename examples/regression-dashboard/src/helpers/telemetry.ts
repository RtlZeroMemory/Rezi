export type TelemetryTick = Readonly<{
  nowMs: number;
}>;

function normalizeIntervalMs(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return 1000;
  return Math.floor(intervalMs);
}

/**
 * Create an endless async telemetry stream that yields at a fixed cadence.
 */
export async function* createTelemetryStream(
  intervalMs: number,
): AsyncGenerator<TelemetryTick, void, void> {
  const cadenceMs = normalizeIntervalMs(intervalMs);

  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, cadenceMs));
    yield { nowMs: Date.now() };
  }
}
