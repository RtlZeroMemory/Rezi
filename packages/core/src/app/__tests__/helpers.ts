export { encodeZrevBatchV1, makeBackendBatch } from "../../testing/events.js";

export async function flushMicrotasks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }
}

export async function withMockPerformanceNow<T>(
  values: readonly number[],
  fn: () => Promise<T>,
): Promise<T> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "performance");
  let index = 0;
  const lastValue = values[values.length - 1] ?? 0;
  const performanceMock = Object.freeze({
    now(): number {
      const next = values[index] ?? lastValue;
      index++;
      return next;
    },
  });

  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: performanceMock,
  });

  try {
    return await fn();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "performance", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "performance");
    }
  }
}
