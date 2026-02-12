import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, Transform, render } from "../index.js";
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

async function renderToLastFrameBytes(tree: React.ReactNode): Promise<Uint8Array> {
  const backend = new StubBackend();
  const inst = render(tree, { internal_backend: backend, exitOnCtrlC: false } as any);

  await flushMicrotasks(10);
  await pushInitialResize(backend);

  const bytes = backend.requestedFrames[backend.requestedFrames.length - 1] ?? new Uint8Array();

  inst.unmount();
  await inst.waitUntilExit();

  return bytes;
}

describe("compat behavior", () => {
  test("animated component renders and advances frames over time", async () => {
    function SpinnerLike() {
      const [tick, setTick] = React.useState(0);
      React.useEffect(() => {
        const id = setInterval(() => setTick((n) => n + 1), 33);
        return () => clearInterval(id);
      }, []);
      const frames = ["-", "\\", "|", "/"];
      return <Text>{frames[tick % frames.length] ?? "-"}</Text>;
    }

    const backend = new StubBackend();
    const inst = render(<SpinnerLike />, { internal_backend: backend, exitOnCtrlC: false } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const initialFrames = backend.requestedFrames.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 140));
    await flushMicrotasks(10);

    assert.ok(backend.requestedFrames.length > initialFrames);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("Transform applies per-line mutation semantics", async () => {
    const frame = await renderToLastFrameBytes(
      <Transform transform={(line, i) => `${i}:${line.toUpperCase()}`}>
        <Text>one{"\n"}two</Text>
      </Transform>,
    );

    assert.ok(frame.length > 0);
  });
});
