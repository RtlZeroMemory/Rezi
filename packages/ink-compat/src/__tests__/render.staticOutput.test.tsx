import { assert, describe, test } from "@rezi-ui/testkit";
import { EventEmitter } from "node:events";
import React from "react";
import { Box, Static, Text, render } from "../index.js";
import {
  StubBackend,
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "./testBackend.js";

const CLEAR_TERMINAL = "\u001B[2J\u001B[3J\u001B[H";

type CapturedStdout = NodeJS.WriteStream &
  EventEmitter &
  Readonly<{
    columns: number;
    rows: number;
    writes: string[];
  }>;

function makeCapturedStdout(cols = 80, rows = 24): CapturedStdout {
  const writes: string[] = [];
  const stream = new EventEmitter() as NodeJS.WriteStream & EventEmitter & {
    columns: number;
    rows: number;
    writes: string[];
  };
  stream.isTTY = true;
  stream.columns = cols;
  stream.rows = rows;
  stream.writes = writes;
  stream.write = (chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  return stream;
}

async function pushResize(backend: StubBackend, cols: number, rows: number): Promise<void> {
  backend.pushBatch(
    makeBackendBatch(
      encodeZrevBatchV1({ events: [{ kind: "resize", timeMs: 1, cols, rows }] }),
    ),
  );
  await flushMicrotasks(10);
}

describe("render(): static output persistence", () => {
  test("writes only newly appended <Static> chunks to stdout", async () => {
    const backend = new StubBackend();
    const stdout = makeCapturedStdout();

    function App(props: Readonly<{ logs: string[]; tick: number }>) {
      return (
        <Box flexDirection="column">
          <Static items={props.logs}>{(item, i) => <Text key={String(i)}>{item}</Text>}</Static>
          <Text>tick:{props.tick}</Text>
        </Box>
      );
    }

    const inst = render(<App logs={[]} tick={0} />, {
      internal_backend: backend,
      stdout,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    await pushResize(backend, 80, 24);

    inst.rerender(<App logs={["log1"]} tick={0} />);
    await flushMicrotasks(20);
    const afterLog1 = stdout.writes.join("");
    assert.equal(afterLog1.includes("log1\n"), true);

    inst.rerender(<App logs={["log1"]} tick={1} />);
    await flushMicrotasks(20);
    assert.equal(stdout.writes.join(""), afterLog1, "dynamic-only updates must not replay static lines");

    inst.rerender(<App logs={["log1", "log2"]} tick={1} />);
    await flushMicrotasks(20);

    const delta = stdout.writes.join("").slice(afterLog1.length);
    assert.equal(delta.includes("log2\n"), true);
    assert.equal(delta.includes("log1\n"), false);

    inst.unmount();
    await inst.waitUntilExit();
  });

  test("clears terminal before writing new static chunks after fullscreen frame", async () => {
    const backend = new StubBackend();
    const stdout = makeCapturedStdout(80, 1);

    function App(props: Readonly<{ logs: string[] }>) {
      return (
        <Box flexDirection="column">
          <Static items={props.logs}>{(item, i) => <Text key={String(i)}>{item}</Text>}</Static>
          <Text>x</Text>
        </Box>
      );
    }

    const inst = render(<App logs={[]} />, {
      internal_backend: backend,
      stdout,
      exitOnCtrlC: false,
      patchConsole: false,
    } as any);

    await pushResize(backend, 80, 1);
    stdout.writes.length = 0;

    inst.rerender(<App logs={["static-1"]} />);
    await flushMicrotasks(20);

    assert.equal(stdout.writes[0], CLEAR_TERMINAL);
    assert.equal(stdout.writes[1], "static-1\n");

    inst.unmount();
    await inst.waitUntilExit();
  });
});
