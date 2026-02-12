import { assert, describe, test } from "@rezi-ui/testkit";
import { EventEmitter } from "node:events";
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

function makeStdoutRecorder() {
  const writes: string[] = [];
  const stdout = new EventEmitter() as NodeJS.WriteStream & EventEmitter & {
    columns: number;
    rows: number;
  };
  stdout.isTTY = true;
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.write = (data: string) => {
    writes.push(String(data));
    return true;
  };
  return { stdout, writes };
}

describe("render(): debug mode append-only output", () => {
  test("writes every frame to stdout without forwarding drawlists to backend", async () => {
    const backend = new StubBackend();
    const { stdout, writes } = makeStdoutRecorder();
    const stderr = { isTTY: true, write: () => true } as unknown as NodeJS.WriteStream;

    const inst = render(<Text>alpha</Text>, {
      internal_backend: backend,
      stdout,
      stderr,
      debug: true,
      patchConsole: true,
      exitOnCtrlC: false,
    } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    inst.rerender(<Text>beta</Text>);
    await flushMicrotasks(10);

    const out = writes.join("");
    const alphaIndex = out.indexOf("alpha\n");
    const betaIndex = out.indexOf("beta\n");
    assert.ok(alphaIndex >= 0);
    assert.ok(betaIndex > alphaIndex);
    assert.equal(backend.requestedFrames.length, 0);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
