import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render } from "../index.js";
import {
  StubBackend,
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "./testBackend.js";

async function pushInitialResize(backend: StubBackend): Promise<void> {
  backend.pushBatch(
    makeBackendBatch(
      encodeZrevBatchV1({ events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }] }),
    ),
  );
  await flushMicrotasks(10);
}

describe("render(): CI mode", () => {
  test("buffers frames and flushes only the latest one on unmount", async () => {
    const prevCI = process.env["CI"];
    process.env["CI"] = "1";

    const backend = new StubBackend();

    try {
      const inst = render(<Text>v0</Text>, {
        internal_backend: backend,
        exitOnCtrlC: false,
        patchConsole: false,
      } as any);

      await flushMicrotasks(10);
      await pushInitialResize(backend);

      inst.rerender(<Text>v1</Text>);
      inst.rerender(<Text>v2</Text>);
      await flushMicrotasks(10);

      // No frames should be emitted during CI operation.
      assert.equal(backend.requestedFrames.length, 0);

      inst.unmount();
      await inst.waitUntilExit();

      // Exactly one frame is flushed on unmount.
      assert.equal(backend.requestedFrames.length, 1);
    } finally {
      if (prevCI === undefined) delete process.env["CI"];
      else process.env["CI"] = prevCI;
    }
  });
});

