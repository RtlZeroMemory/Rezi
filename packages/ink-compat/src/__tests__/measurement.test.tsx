import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import {
  Box,
  Text,
  getBoundingBox,
  getScrollHeight,
  measureElement,
  render,
  type DOMElement,
} from "../index.js";
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

describe("measurement", () => {
  test("measureElement/getBoundingBox use committed layout and update on rerender", async () => {
    const backend = new StubBackend();
    const ref = React.createRef<DOMElement>();

    const inst = render(
      <Box width={30} height={10}>
        <Box ref={ref} width={4} height={2}>
          <Text>x</Text>
        </Box>
      </Box>,
      { internal_backend: backend, exitOnCtrlC: false },
    );

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const node = ref.current;
    assert.ok(node);

    const measured = measureElement(node);
    assert.equal(measured.width, 4);
    assert.equal(measured.height, 2);

    const box = getBoundingBox(node);
    assert.equal(box.width, 4);
    assert.equal(box.height, 2);
    assert.ok(box.x >= 0);
    assert.ok(box.y >= 0);

    inst.rerender(
      <Box width={30} height={10}>
        <Box ref={ref} width={7} height={3}>
          <Text>x</Text>
        </Box>
      </Box>,
    );

    await flushMicrotasks(10);

    const measured2 = measureElement(node);
    assert.equal(measured2.width, 7);
    assert.equal(measured2.height, 3);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("getScrollHeight reflects committed layout and updates across rerenders", async () => {
    const backend = new StubBackend();
    const parentRef = React.createRef<DOMElement>();

    const inst = render(
      <Box width={10} height={2} ref={parentRef}>
        <Box width={10} height={6}>
          <Text>content</Text>
        </Box>
      </Box>,
      { internal_backend: backend, exitOnCtrlC: false },
    );

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const parent = parentRef.current;
    assert.ok(parent);

    const measured = measureElement(parent);
    assert.equal(measured.height, 2);
    assert.equal(getScrollHeight(parent), 2);

    inst.rerender(
      <Box width={10} height={4} ref={parentRef}>
        <Box width={10} height={6}>
          <Text>content</Text>
        </Box>
      </Box>,
    );
    await flushMicrotasks(10);

    assert.equal(getScrollHeight(parent), 4);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
