import assert from "node:assert/strict";
import test from "node:test";
import { createTelemetryStream } from "../helpers/telemetry.js";

async function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs = 1000,
): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`next() timed out after ${String(timeoutMs)}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

test("telemetry stream yields ticks with timestamps", async () => {
  const stream = createTelemetryStream(10);
  const iterator = stream[Symbol.asyncIterator]();

  const first = await nextWithTimeout(iterator);
  assert.equal(first.done, false);
  assert.ok(first.value.nowMs > 0);

  const second = await nextWithTimeout(iterator);
  assert.equal(second.done, false);
  assert.ok(second.value.nowMs >= first.value.nowMs);

  await iterator.return?.();
});

test("telemetry stream stops after return()", async () => {
  const stream = createTelemetryStream(10);
  const iterator = stream[Symbol.asyncIterator]();

  await iterator.return?.();
  const next = await nextWithTimeout(iterator);
  assert.equal(next.done, true);
});
