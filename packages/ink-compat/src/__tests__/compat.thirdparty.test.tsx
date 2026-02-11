import { assert, describe, test } from "@rezi-ui/testkit";
import React, { useEffect, useState } from "react";
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

describe("third-party compatibility smoke", () => {
  test("ink-spinner pattern (stateful interval + <Text>) triggers render updates", async () => {
    function SpinnerLike() {
      const frames = ["-", "\\", "|", "/"] as const;
      const [frame, setFrame] = useState(0);

      useEffect(() => {
        const timer = setInterval(() => {
          setFrame((prev) => (prev + 1) % frames.length);
        }, 10);
        return () => clearInterval(timer);
      }, []);

      return <Text>{frames[frame]}</Text>;
    }

    const backend = new StubBackend();
    const inst = render(<SpinnerLike />, { internal_backend: backend, exitOnCtrlC: false });

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const initialFrames = backend.requestedFrames.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    await flushMicrotasks(10);

    assert.ok(backend.requestedFrames.length > initialFrames);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("ink-gradient pattern (Transform transform callback) receives flattened text", async () => {
    let lastInput = "";

    function GradientLike(props: Readonly<{ children: React.ReactNode }>) {
      const transform = (children: string) => {
        lastInput = children;
        return `\u001B[31m${children}\u001B[39m`;
      };

      return <Transform transform={transform}>{props.children}</Transform>;
    }

    const backend = new StubBackend();
    const inst = render(
      <GradientLike>
        <Text>rainbow</Text>
      </GradientLike>,
      { internal_backend: backend, exitOnCtrlC: false },
    );

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    assert.equal(lastInput, "rainbow");
    assert.ok(backend.requestedFrames.length >= 1);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
