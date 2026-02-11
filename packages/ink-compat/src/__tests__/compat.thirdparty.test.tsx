import { assert, describe, test } from "@rezi-ui/testkit";
import { Transform } from "ink";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import React from "react";
import { Box, type DOMElement, Text, getInnerHeight, getScrollHeight, render } from "../index.js";
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
  const inst = render(tree, { internal_backend: backend, exitOnCtrlC: false });

  await flushMicrotasks(10);
  await pushInitialResize(backend);

  const bytes = backend.requestedFrames[backend.requestedFrames.length - 1] ?? new Uint8Array();

  inst.unmount();
  await inst.waitUntilExit();

  return bytes;
}

describe("third-party compatibility (real packages)", () => {
  test("ink-spinner renders and advances frames over time", async () => {
    const backend = new StubBackend();
    const inst = render(<Spinner type="dots" />, { internal_backend: backend, exitOnCtrlC: false });

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const initialFrames = backend.requestedFrames.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 140));
    await flushMicrotasks(10);

    assert.ok(backend.requestedFrames.length > initialFrames);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("ink-gradient uses Ink Transform behavior with real package runtime", async () => {
    const gradientElement = (
      Gradient as unknown as (props: {
        name: string;
        children: React.ReactNode;
      }) => React.ReactElement<{
        transform: (input: string) => string;
        children: React.ReactNode;
      }>
    )({
      name: "rainbow",
      children: <Text>rainbow</Text>,
    });

    assert.equal(gradientElement.type, Transform);
    assert.equal(typeof gradientElement.props.transform, "function");

    const frame = await renderToLastFrameBytes(
      <Gradient name="rainbow">
        <Text>rainbow</Text>
      </Gradient>,
    );

    assert.ok(frame.length > 0);
  });

  test("third-party components remain compatible with scroll measurement semantics", async () => {
    const backend = new StubBackend();
    const containerRef = React.createRef<DOMElement>();

    const inst = render(
      <Box
        ref={containerRef}
        width={20}
        height={1}
        flexDirection="column"
        overflowY="scroll"
        overflowX="hidden"
        scrollTop={1}
      >
        <Spinner type="line" />
        <Gradient name="pastel">
          <Text>line-2</Text>
        </Gradient>
        <Text>line-3</Text>
      </Box>,
      { internal_backend: backend, exitOnCtrlC: false },
    );

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const container = containerRef.current;
    assert.ok(container);
    assert.equal(getInnerHeight(container), 1);
    assert.ok(getScrollHeight(container) >= 3);
    assert.ok(backend.requestedFrames.length >= 1);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
