import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render, useApp, useStderr, useStdin, useStdout } from "../index.js";
import {
  StubBackend,
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "./testBackend.js";

class CountingBackend extends StubBackend {
  startCalls = 0;

  override async start(): Promise<void> {
    this.startCalls++;
  }
}

function makeStdout(): NodeJS.WriteStream {
  return {
    isTTY: true,
    columns: 80,
    rows: 24,
    write() {
      return true;
    },
    on() {},
    off() {},
  } as unknown as NodeJS.WriteStream;
}

async function pushInitialResize(backend: StubBackend): Promise<void> {
  backend.pushBatch(
    makeBackendBatch(
      encodeZrevBatchV1({ events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }] }),
    ),
  );
  await flushMicrotasks(10);
}

describe("render(): lifecycle parity", () => {
  test("defaults to process stdio streams", async () => {
    const backend = new StubBackend();

    let seen: Readonly<{
      stdin: NodeJS.ReadStream;
      stdout: NodeJS.WriteStream;
      stderr: NodeJS.WriteStream;
    }> | null = null;

    function Probe() {
      const stdin = useStdin().stdin;
      const stdout = useStdout().stdout;
      const stderr = useStderr().stderr;
      seen = { stdin, stdout, stderr };
      return <Text>probe</Text>;
    }

    const inst = render(<Probe />, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const s = seen as unknown as {
      stdin: NodeJS.ReadStream;
      stdout: NodeJS.WriteStream;
      stderr: NodeJS.WriteStream;
    };
    assert.equal(s.stdin, process.stdin);
    assert.equal(s.stdout, process.stdout);
    assert.equal(s.stderr, process.stderr);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("waitUntilExit() auto-unmounts on process.beforeExit", async () => {
    const backend = new StubBackend();
    const inst = render(<Text>hi</Text>, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const p = inst.waitUntilExit();
    process.emit("beforeExit", 0);
    await p;
  });

  test("useApp().exit(error) rejects waitUntilExit()", async () => {
    const backend = new StubBackend();
    let exit: ((error?: Error) => void) | undefined;

    function Probe() {
      exit = useApp().exit;
      return <Text>probe</Text>;
    }

    const inst = render(<Probe />, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const p = inst.waitUntilExit();
    exit?.(new Error("boom"));
    await assert.rejects(async () => p, /boom/);
  });

  test("cleanup() removes stdout instance mapping without unmounting", async () => {
    const stdout = makeStdout();
    const backend1 = new CountingBackend();
    const backend2 = new CountingBackend();

    const warnings: string[] = [];
    const originalWarn = console.warn;
    // eslint-disable-next-line no-console
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    try {
      const inst1 = render(<Text>a</Text>, {
        internal_backend: backend1,
        stdout,
        concurrent: false,
        patchConsole: false,
        exitOnCtrlC: false,
      } as any);

      await flushMicrotasks(10);

      inst1.cleanup();

      const inst2 = render(<Text>b</Text>, {
        internal_backend: backend2,
        stdout,
        concurrent: true,
        patchConsole: false,
        exitOnCtrlC: false,
      } as any);

      await flushMicrotasks(10);

      assert.equal(backend1.startCalls, 1);
      assert.equal(backend2.startCalls, 1);
      assert.equal(warnings.length, 0);

      inst1.unmount();
      inst2.unmount();
      await inst1.waitUntilExit();
      await inst2.waitUntilExit();
    } finally {
      // eslint-disable-next-line no-console
      console.warn = originalWarn;
    }
  });
});
