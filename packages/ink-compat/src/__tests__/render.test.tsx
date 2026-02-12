import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render } from "../index.js";
import {
  StubBackend,
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "./testBackend.js";

describe("render()", () => {
  test("unmount() resolves waitUntilExit()", async () => {
    const backend = new StubBackend();

    const inst = render(<Text>hi</Text>, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    // Let app.start() settle.
    await flushMicrotasks(10);

    backend.pushBatch(
      makeBackendBatch(
        encodeZrevBatchV1({ events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }] }),
      ),
    );
    await flushMicrotasks(10);

    assert.ok(backend.requestedFrames.length >= 1);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("rerender()/clear() trigger additional frames after initial resize", async () => {
    const backend = new StubBackend();

    const inst = render(<Text>one</Text>, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);
    await flushMicrotasks(10);

    backend.pushBatch(
      makeBackendBatch(
        encodeZrevBatchV1({ events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }] }),
      ),
    );
    await flushMicrotasks(10);

    const afterResize = backend.requestedFrames.length;
    assert.ok(afterResize >= 1);

    inst.rerender(<Text>two</Text>);
    await flushMicrotasks(10);

    const afterRerender = backend.requestedFrames.length;
    assert.ok(afterRerender >= afterResize + 1);

    inst.clear();
    await flushMicrotasks(10);

    const afterClear = backend.requestedFrames.length;
    assert.ok(afterClear >= afterRerender + 1);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("unmount() is idempotent", async () => {
    const backend = new StubBackend();
    const inst = render(<Text>bye</Text>, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    await flushMicrotasks(10);

    inst.unmount();
    inst.unmount();

    await inst.waitUntilExit();
    await inst.waitUntilExit();
  });
});
