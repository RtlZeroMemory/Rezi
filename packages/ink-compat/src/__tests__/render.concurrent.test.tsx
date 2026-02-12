import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render } from "../index.js";
import hostReconciler from "../reconciler.js";
import { StubBackend, flushMicrotasks } from "./testBackend.js";

describe("render(): concurrent commit mode", () => {
  test("legacy mode uses sync container updates", async () => {
    const runtime = hostReconciler as unknown as {
      updateContainer: (...args: unknown[]) => unknown;
      updateContainerSync?: (...args: unknown[]) => unknown;
    };

    const originalUpdate = runtime.updateContainer;
    const originalUpdateSync = runtime.updateContainerSync;

    let asyncCalls = 0;
    let syncCalls = 0;

    runtime.updateContainer = (...args: unknown[]) => {
      asyncCalls++;
      return originalUpdate(...args);
    };

    if (typeof originalUpdateSync === "function") {
      runtime.updateContainerSync = (...args: unknown[]) => {
        syncCalls++;
        return originalUpdateSync(...args);
      };
    }

    try {
      const backend = new StubBackend();
      const inst = render(<Text>legacy</Text>, {
        internal_backend: backend,
        concurrent: false,
        exitOnCtrlC: false,
        patchConsole: false,
      } as any);

      await flushMicrotasks(10);
      inst.rerender(<Text>legacy-2</Text>);
      await flushMicrotasks(10);
      inst.unmount();
      await inst.waitUntilExit();

      assert.ok(syncCalls > 0);
      assert.equal(asyncCalls, 0);
    } finally {
      runtime.updateContainer = originalUpdate;
      if (typeof originalUpdateSync === "function") {
        runtime.updateContainerSync = originalUpdateSync;
      } else {
        delete (runtime as { updateContainerSync?: unknown }).updateContainerSync;
      }
    }
  });

  test("concurrent mode uses async container updates", async () => {
    const runtime = hostReconciler as unknown as {
      updateContainer: (...args: unknown[]) => unknown;
      updateContainerSync?: (...args: unknown[]) => unknown;
    };

    const originalUpdate = runtime.updateContainer;
    const originalUpdateSync = runtime.updateContainerSync;

    let asyncCalls = 0;
    let syncCalls = 0;

    runtime.updateContainer = (...args: unknown[]) => {
      asyncCalls++;
      return originalUpdate(...args);
    };

    if (typeof originalUpdateSync === "function") {
      runtime.updateContainerSync = (...args: unknown[]) => {
        syncCalls++;
        return originalUpdateSync(...args);
      };
    }

    try {
      const backend = new StubBackend();
      const inst = render(<Text>concurrent</Text>, {
        internal_backend: backend,
        concurrent: true,
        exitOnCtrlC: false,
        patchConsole: false,
      } as any);

      await flushMicrotasks(10);
      inst.rerender(<Text>concurrent-2</Text>);
      await flushMicrotasks(10);
      inst.unmount();
      await inst.waitUntilExit();

      assert.ok(asyncCalls > 0);
      assert.equal(syncCalls, 0);
    } finally {
      runtime.updateContainer = originalUpdate;
      if (typeof originalUpdateSync === "function") {
        runtime.updateContainerSync = originalUpdateSync;
      } else {
        delete (runtime as { updateContainerSync?: unknown }).updateContainerSync;
      }
    }
  });
});
