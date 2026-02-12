import { assert, describe, test } from "@rezi-ui/testkit";
import { EventEmitter } from "node:events";
import React from "react";
import { Text, render } from "../index.js";
import { StubBackend, flushMicrotasks } from "./testBackend.js";

function makeStdoutEmitter(): NodeJS.WriteStream & EventEmitter & { columns: number; rows: number } {
  const emitter = new EventEmitter() as NodeJS.WriteStream & EventEmitter & {
    columns: number;
    rows: number;
  };

  emitter.isTTY = true;
  emitter.columns = 80;
  emitter.rows = 24;
  emitter.write = () => true;

  return emitter;
}

describe("render(): stdout resize parity", () => {
  test("stdout 'resize' triggers a backend resize event and rerender", async () => {
    const backend = new StubBackend();
    const stdout = makeStdoutEmitter();

    const inst = render(<Text>hi</Text>, {
      internal_backend: backend,
      stdout,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    // Let app.start() settle. No backend resize has been pushed yet.
    await flushMicrotasks(10);
    assert.equal(backend.requestedFrames.length, 0);

    stdout.emit("resize");
    await flushMicrotasks(10);
    assert.ok(backend.requestedFrames.length >= 1);

    const framesAfterFirst = backend.requestedFrames.length;
    stdout.columns = 40;
    stdout.emit("resize");
    await flushMicrotasks(10);
    assert.ok(backend.requestedFrames.length >= framesAfterFirst + 1);

    inst.unmount();
    await inst.waitUntilExit();
  });
});

