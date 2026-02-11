import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render, useIsScreenReaderEnabled, useStdin } from "../index.js";
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

describe("render parity", () => {
  test("onRender metrics + alternateBuffer + screen-reader context", async () => {
    const backend = new StubBackend();
    const metrics: number[] = [];
    const writes: string[] = [];
    let isScreenReader: boolean | null = null;

    const stdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write(data: string) {
        writes.push(data);
        return true;
      },
      on() {},
      off() {},
    } as unknown as NodeJS.WriteStream;

    function Probe() {
      isScreenReader = useIsScreenReaderEnabled();
      return <Text>probe</Text>;
    }

    const inst = render(<Probe />, {
      internal_backend: backend,
      exitOnCtrlC: false,
      patchConsole: false,
      stdout,
      onRender: (m) => metrics.push(m.renderTime),
      isScreenReaderEnabled: true,
      alternateBuffer: true,
      incrementalRendering: true,
    });

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    assert.equal(isScreenReader, true);
    assert.ok(metrics.length >= 1);
    assert.ok(metrics[0] !== undefined && metrics[0] >= 0);
    assert.ok(writes.includes("\u001B[?1049h"));

    inst.unmount();
    await inst.waitUntilExit();

    assert.ok(writes.includes("\u001B[?1049l"));
  });

  test("useStdin exposes meaningful raw-mode support and ref-counted toggles", async () => {
    const backend = new StubBackend();
    const calls: string[] = [];
    let stdinHook: {
      setRawMode: (enabled: boolean) => void;
      isRawModeSupported: boolean;
    } | undefined;

    const stdin = {
      isTTY: true,
      setRawMode(value: boolean) {
        calls.push(`setRawMode:${String(value)}`);
      },
      setEncoding(value: string) {
        calls.push(`setEncoding:${value}`);
      },
      ref() {
        calls.push("ref");
      },
      unref() {
        calls.push("unref");
      },
    } as unknown as NodeJS.ReadStream;

    function Probe() {
      stdinHook = useStdin();
      return <Text>stdin</Text>;
    }

    const inst = render(<Probe />, {
      internal_backend: backend,
      exitOnCtrlC: false,
      stdin,
      patchConsole: false,
    });

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const hook = stdinHook as {
      setRawMode: (enabled: boolean) => void;
      isRawModeSupported: boolean;
    };
    assert.equal(hook.isRawModeSupported, true);

    hook.setRawMode(true);
    hook.setRawMode(true);
    hook.setRawMode(false);
    hook.setRawMode(false);

    assert.deepEqual(calls, ["setEncoding:utf8", "ref", "setRawMode:true", "setRawMode:false", "unref"]);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("useStdin throws on unsupported raw mode", async () => {
    const backend = new StubBackend();
    let stdinHook: {
      setRawMode: (enabled: boolean) => void;
      isRawModeSupported: boolean;
    } | undefined;

    const stdin = {
      isTTY: false,
    } as unknown as NodeJS.ReadStream;

    function Probe() {
      stdinHook = useStdin();
      return <Text>stdin</Text>;
    }

    const inst = render(<Probe />, {
      internal_backend: backend,
      exitOnCtrlC: false,
      stdin,
      patchConsole: false,
    });

    await flushMicrotasks(10);
    await pushInitialResize(backend);

    const hook = stdinHook as {
      setRawMode: (enabled: boolean) => void;
      isRawModeSupported: boolean;
    };
    assert.equal(hook.isRawModeSupported, false);
    assert.throws(() => {
      hook.setRawMode(true);
    }, /Raw mode is not supported/);

    inst.unmount();
    await inst.waitUntilExit();
  });
});
