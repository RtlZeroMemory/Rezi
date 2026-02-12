import { EventEmitter } from "node:events";
import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Text, render } from "../index.js";
import { StubBackend, flushMicrotasks } from "./testBackend.js";

class FakeStdout extends EventEmitter {
  isTTY = true;
  columns = 80;
  rows = 24;
  readonly writes: string[] = [];

  write(chunk: string): boolean {
    this.writes.push(String(chunk));
    return true;
  }

  end(): this {
    return this;
  }
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  private buffered: Uint8Array[] = [];

  read(): string | null {
    const chunk = this.buffered.shift();
    if (!chunk) return null;
    return Buffer.from(chunk).toString("utf8");
  }

  unshift(chunk: Uint8Array): void {
    this.buffered.unshift(chunk);
  }

  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }

  pause(): this {
    return this;
  }

  resume(): this {
    return this;
  }
}

describe("render(): kitty keyboard lifecycle", () => {
  test("enabled mode writes enable sequence and disables protocol on unmount", async () => {
    const backend = new StubBackend();
    const stdout = new FakeStdout();
    const stdin = new FakeStdin();

    const inst = render(<Text>kitty</Text>, {
      internal_backend: backend,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      exitOnCtrlC: false,
      patchConsole: false,
      kittyKeyboard: { mode: "enabled", flags: ["reportEventTypes"] },
    } as any);

    await flushMicrotasks(10);
    assert.equal(stdout.writes.includes("\u001B[>2u"), true);

    inst.unmount();
    await inst.waitUntilExit();

    assert.equal(stdout.writes.includes("\u001B[<u"), true);
  });

  test("auto mode performs query handshake before enabling protocol", async () => {
    const backend = new StubBackend();
    const stdout = new FakeStdout();
    const stdin = new FakeStdin();

    const prevCI = process.env["CI"];
    const prevContinuousIntegration = process.env["CONTINUOUS_INTEGRATION"];
    const prevBuildNumber = process.env["BUILD_NUMBER"];
    const prevRunId = process.env["RUN_ID"];
    const prevTermProgram = process.env["TERM_PROGRAM"];

    delete process.env["CI"];
    delete process.env["CONTINUOUS_INTEGRATION"];
    delete process.env["BUILD_NUMBER"];
    delete process.env["RUN_ID"];
    process.env["TERM_PROGRAM"] = "WezTerm";

    try {
      const inst = render(<Text>kitty-auto</Text>, {
        internal_backend: backend,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        exitOnCtrlC: false,
        patchConsole: false,
        kittyKeyboard: { mode: "auto" },
      } as any);

      await flushMicrotasks(10);
      assert.equal(stdout.writes.includes("\u001B[?u"), true);

      stdin.emit("data", "\u001B[?1u");
      await flushMicrotasks(10);

      assert.equal(stdout.writes.includes("\u001B[>1u"), true);

      inst.unmount();
      await inst.waitUntilExit();
      assert.equal(stdout.writes.includes("\u001B[<u"), true);
    } finally {
      if (prevCI === undefined) delete process.env["CI"];
      else process.env["CI"] = prevCI;

      if (prevContinuousIntegration === undefined) delete process.env["CONTINUOUS_INTEGRATION"];
      else process.env["CONTINUOUS_INTEGRATION"] = prevContinuousIntegration;

      if (prevBuildNumber === undefined) delete process.env["BUILD_NUMBER"];
      else process.env["BUILD_NUMBER"] = prevBuildNumber;

      if (prevRunId === undefined) delete process.env["RUN_ID"];
      else process.env["RUN_ID"] = prevRunId;

      if (prevTermProgram === undefined) delete process.env["TERM_PROGRAM"];
      else process.env["TERM_PROGRAM"] = prevTermProgram;
    }
  });
});
