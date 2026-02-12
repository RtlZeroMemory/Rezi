import { assert } from "@rezi-ui/testkit";
import type React from "react";
import render from "../../render.js";
import {
  StubBackend,
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../testBackend.js";

export async function renderToLastFrameBytes(
  tree: React.ReactNode,
  opts?: Readonly<{ cols?: number; rows?: number }>,
): Promise<Uint8Array> {
  const backend = new StubBackend();
  const inst = render(tree, {
    exitOnCtrlC: false,
    patchConsole: false,
    internal_backend: backend,
  } as unknown as Parameters<typeof render>[1]);

  // Let app.start() settle (poll loop, view registration).
  await flushMicrotasks(10);

  backend.pushBatch(
    makeBackendBatch(
      encodeZrevBatchV1({
        events: [
          {
            kind: "resize",
            timeMs: 1,
            cols: opts?.cols ?? 80,
            rows: opts?.rows ?? 25,
          },
        ],
      }),
    ),
  );

  // Let the resize propagate and at least one frame render.
  for (let i = 0; i < 50; i++) {
    if (backend.requestedFrames.length > 0) break;
    await flushMicrotasks(2);
  }

  assert.ok(backend.requestedFrames.length > 0, "expected at least one requested frame");

  const bytes = backend.requestedFrames[backend.requestedFrames.length - 1] ?? new Uint8Array();

  inst.unmount();
  await inst.waitUntilExit();

  return bytes;
}
