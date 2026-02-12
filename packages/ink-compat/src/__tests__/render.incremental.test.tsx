import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Text, render } from "../index.js";
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

function readCommandBytes(drawlist: Uint8Array): number {
  const dv = new DataView(drawlist.buffer, drawlist.byteOffset, drawlist.byteLength);
  return dv.getUint32(20, true);
}

async function renderAndMeasureSecondFrameCmdBytes(
  incrementalRendering: boolean,
): Promise<number> {
  const backend = new StubBackend();

  const inst = render(
    <Box flexDirection="column" padding={1} borderStyle="single">
      <Text>first</Text>
      <Text>value: 0</Text>
      <Text>last</Text>
    </Box>,
    {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
      incrementalRendering,
    } as any,
  );

  await flushMicrotasks(10);
  await pushInitialResize(backend);

  const framesAfterFirst = backend.requestedFrames.length;
  assert.ok(framesAfterFirst >= 1);

  inst.rerender(
    <Box flexDirection="column" padding={1} borderStyle="single">
      <Text>first</Text>
      <Text>value: 1</Text>
      <Text>last</Text>
    </Box>,
  );

  for (let i = 0; i < 20; i++) {
    if (backend.requestedFrames.length > framesAfterFirst) break;
    await flushMicrotasks(2);
  }

  assert.ok(backend.requestedFrames.length > framesAfterFirst);
  const second = backend.requestedFrames[backend.requestedFrames.length - 1];
  assert.ok(second !== undefined);

  inst.unmount();
  await inst.waitUntilExit();

  return readCommandBytes(second as Uint8Array);
}

describe("render(): incrementalRendering option", () => {
  test("incrementalRendering flag keeps rerender path functional in both modes", async () => {
    const fullFrameCmdBytes = await renderAndMeasureSecondFrameCmdBytes(false);
    const incrementalCmdBytes = await renderAndMeasureSecondFrameCmdBytes(true);

    assert.ok(fullFrameCmdBytes > 0);
    assert.ok(incrementalCmdBytes > 0);
  });
});
