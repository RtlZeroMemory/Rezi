import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render } from "../index.js";
import { StubBackend, flushMicrotasks } from "./testBackend.js";

class CountingBackend extends StubBackend {
  startCalls = 0;
  stopCalls = 0;

  override async start(): Promise<void> {
    this.startCalls++;
  }

  override async stop(): Promise<void> {
    this.stopCalls++;
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

describe("render(): per-stdout instance caching", () => {
  test("reuses the same underlying instance for the same stdout", async () => {
    const backend = new CountingBackend();
    const stdout = makeStdout();

    const inst1 = render(<Text>one</Text>, {
      internal_backend: backend,
      stdout,
      patchConsole: false,
      exitOnCtrlC: false,
    } as any);

    const inst2 = render(<Text>two</Text>, {
      internal_backend: backend,
      stdout,
      patchConsole: false,
      exitOnCtrlC: false,
    } as any);

    await flushMicrotasks(10);

    assert.equal(backend.startCalls, 1);

    inst1.unmount();
    inst2.unmount();
    await inst1.waitUntilExit();
    await inst2.waitUntilExit();
  });

  test("warns and keeps the original concurrent mode when reused", async () => {
    const backend = new CountingBackend();
    const stdout = makeStdout();

    const warnings: string[] = [];
    const originalWarn = console.warn;
    // eslint-disable-next-line no-console
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    try {
      const inst1 = render(<Text>a</Text>, {
        internal_backend: backend,
        stdout,
        concurrent: false,
        patchConsole: false,
        exitOnCtrlC: false,
      } as any);

      const inst2 = render(<Text>b</Text>, {
        internal_backend: backend,
        stdout,
        concurrent: true,
        patchConsole: false,
        exitOnCtrlC: false,
      } as any);

      await flushMicrotasks(10);

      assert.equal(warnings.length >= 1, true);
      assert.equal(
        warnings.some((w) => w.includes("The concurrent option only takes effect on the first render")),
        true,
      );

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

