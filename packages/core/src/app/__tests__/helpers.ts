export { encodeZrevBatchV1, makeBackendBatch } from "../../testing/events.js";

export async function flushMicrotasks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }
}
