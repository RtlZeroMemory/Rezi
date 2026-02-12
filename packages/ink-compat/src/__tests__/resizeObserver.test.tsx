import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, type DOMElement, ResizeObserver, Text, render } from "../index.js";
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

describe("ResizeObserver", () => {
  test("observe/unobserve/disconnect on committed layout changes", async () => {
    const backend = new StubBackend();
    const ref = React.createRef<DOMElement>();
    const seen: Array<Readonly<{ width: number; height: number }>> = [];

    const inst = render(
      <Box width={20} height={5}>
        <Box ref={ref} width={4} height={2}>
          <Text>x</Text>
        </Box>
      </Box>,
      { internal_backend: backend, exitOnCtrlC: false } as any,
    );

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const node = ref.current;
    assert.ok(node);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        seen.push(entry.contentRect);
      }
    });

    observer.observe(node);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.width, 4);
    assert.equal(seen[0]?.height, 2);

    inst.rerender(
      <Box width={20} height={5}>
        <Box ref={ref} width={8} height={3}>
          <Text>x</Text>
        </Box>
      </Box>,
    );
    await flushMicrotasks(10);

    assert.equal(seen.length, 2);
    assert.equal(seen[1]?.width, 8);
    assert.equal(seen[1]?.height, 3);

    observer.unobserve(node);
    inst.rerender(
      <Box width={20} height={5}>
        <Box ref={ref} width={10} height={4}>
          <Text>x</Text>
        </Box>
      </Box>,
    );
    await flushMicrotasks(10);

    assert.equal(seen.length, 2);

    observer.observe(node);
    assert.equal(seen.length, 3);
    assert.equal(seen[2]?.width, 10);
    assert.equal(seen[2]?.height, 4);

    observer.disconnect();
    inst.rerender(
      <Box width={20} height={5}>
        <Box ref={ref} width={12} height={4}>
          <Text>x</Text>
        </Box>
      </Box>,
    );
    await flushMicrotasks(10);

    assert.equal(seen.length, 3);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
