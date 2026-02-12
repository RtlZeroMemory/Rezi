import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render, useStderr, useStdout } from "../index.js";
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

describe("render(): patchConsole + output-preserving writes", () => {
  test("patchConsole routes console output via Ink write helpers and restores on unmount", async () => {
    const backend = new StubBackend();

    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];

    const stdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write(data: string) {
        stdoutWrites.push(String(data));
        return true;
      },
      on() {},
      off() {},
    } as unknown as NodeJS.WriteStream;

    const stderr = {
      isTTY: true,
      write(data: string) {
        stderrWrites.push(String(data));
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    // Preserve originals so we can assert restoration.
    const originalLog = console.log;
    const originalError = console.error;

    const inst = render(<Text>ui</Text>, {
      internal_backend: backend,
      stdout,
      stderr,
      patchConsole: true,
      exitOnCtrlC: false,
    } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    // eslint-disable-next-line no-console
    console.log("hello");
    // eslint-disable-next-line no-console
    console.error("oops");
    // eslint-disable-next-line no-console
    console.error("The above error occurred in the <X> component:");

    assert.equal(stdoutWrites.includes("hello\n"), true);
    assert.equal(stderrWrites.includes("oops\n"), true);
    assert.equal(
      stderrWrites.some((s) => s.startsWith("The above error occurred")),
      false,
    );

    inst.unmount();
    await inst.waitUntilExit();

    assert.equal(console.log, originalLog);
    assert.equal(console.error, originalError);
  });

  test("useStdout().write and useStderr().write trigger UI restoration renders", async () => {
    const backend = new StubBackend();

    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];

    const stdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write(data: string) {
        stdoutWrites.push(String(data));
        return true;
      },
      on() {},
      off() {},
    } as unknown as NodeJS.WriteStream;

    const stderr = {
      isTTY: true,
      write(data: string) {
        stderrWrites.push(String(data));
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    let stdoutWrite: (data: string) => void = () => {
      throw new Error("Expected stdout writer to be set");
    };
    let stderrWrite: (data: string) => void = () => {
      throw new Error("Expected stderr writer to be set");
    };

    function Probe() {
      stdoutWrite = useStdout().write;
      stderrWrite = useStderr().write;
      return <Text>ui</Text>;
    }

    const inst = render(<Probe />, {
      internal_backend: backend,
      stdout,
      stderr,
      patchConsole: false,
      exitOnCtrlC: false,
    } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const framesBefore = backend.requestedFrames.length;
    stdoutWrite("HELLO\n");
    stderrWrite("ERR\n");
    await flushMicrotasks(10);

    assert.equal(stdoutWrites.includes("HELLO\n"), true);
    assert.equal(stderrWrites.includes("ERR\n"), true);
    assert.ok(backend.requestedFrames.length >= framesBefore + 1);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
