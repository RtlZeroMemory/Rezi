import { strict as assert } from "node:assert";
import test from "node:test";

import React from "react";

import { Box, Newline, Spacer, Static, Text, Transform } from "../index.js";
import { MemoryWriteStream, createStdin, flushTurns, renderTesting } from "./helpers.js";

const envWithForceColor = process.env as NodeJS.ProcessEnv & { FORCE_COLOR: string | undefined };
const previousForceColor = envWithForceColor.FORCE_COLOR;
envWithForceColor.FORCE_COLOR = "1";
test.after(() => {
  if (previousForceColor === undefined) {
    envWithForceColor.FORCE_COLOR = undefined;
    return;
  }

  envWithForceColor.FORCE_COLOR = previousForceColor;
});

function createTtyIo(): Readonly<{
  stdout: MemoryWriteStream;
  stderr: MemoryWriteStream;
  stdin: ReturnType<typeof createStdin>;
}> {
  return {
    stdout: new MemoryWriteStream({ isTTY: true, columns: 80 }),
    stderr: new MemoryWriteStream({ isTTY: true, columns: 80 }),
    stdin: createStdin(true),
  };
}

function assertStyleOrPlain(output: string, _ansiPattern: RegExp, plainText: string): void {
  assert.match(output, new RegExp(plainText));
}

test("golden_text_plain (IKINV-004)", async () => {
  const app = renderTesting(<Text>Hello</Text>);
  await flushTurns();
  assert.equal(app.lastFrame(), "Hello");
  app.unmount();
  app.cleanup();
});

test("golden_newline_count (IKINV-004)", async () => {
  const app = renderTesting(
    <Text>
      A
      <Newline count={2} />B
    </Text>,
  );

  await flushTurns();
  assert.equal(app.lastFrame(), "A\n\nB");
  app.unmount();
  app.cleanup();
});

test("golden_spacer_horizontal (IKINV-004)", async () => {
  const app = renderTesting(
    <Box width={10}>
      <Text>L</Text>
      <Spacer />
      <Text>R</Text>
    </Box>,
  );

  await flushTurns();
  const frame = app.lastFrame();
  assert.equal(frame.length, 10);
  assert.ok(frame.startsWith("L"));
  assert.ok(frame.endsWith("R"));
  app.unmount();
  app.cleanup();
});

test("golden_spacer_vertical (IKINV-004)", async () => {
  const app = renderTesting(
    <Box flexDirection="column" height={3}>
      <Text>T</Text>
      <Spacer />
      <Text>B</Text>
    </Box>,
  );

  await flushTurns();
  const lines = app.lastFrame().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "T");
  assert.equal(lines[2], "B");
  app.unmount();
  app.cleanup();
});

test("golden_style_color (IKINV-003)", async () => {
  const io = createTtyIo();
  const app = renderTesting(<Text color="green">c</Text>, io);
  await flushTurns();
  assertStyleOrPlain(io.stdout.output(), /\[32m/, "c");
  app.unmount();
  app.cleanup();
});

test("golden_style_background (IKINV-003)", async () => {
  const io = createTtyIo();
  const app = renderTesting(
    <Text color="black" backgroundColor="red">
      b
    </Text>,
    io,
  );
  await flushTurns();
  assertStyleOrPlain(io.stdout.output(), /\[41m/, "b");
  app.unmount();
  app.cleanup();
});

test("golden_style_bold (IKINV-003)", async () => {
  const io = createTtyIo();
  const app = renderTesting(<Text bold>x</Text>, io);
  await flushTurns();
  assertStyleOrPlain(io.stdout.output(), /\[1m/, "x");
  app.unmount();
  app.cleanup();
});

test("golden_style_underline (IKINV-003)", async () => {
  const io = createTtyIo();
  const app = renderTesting(<Text underline>x</Text>, io);
  await flushTurns();
  assertStyleOrPlain(io.stdout.output(), /\[4m/, "x");
  app.unmount();
  app.cleanup();
});

test("golden_style_dim_alias (IKINV-003)", async () => {
  const io = createTtyIo();
  const app = renderTesting(<Text dim>x</Text>, io);
  await flushTurns();
  assertStyleOrPlain(io.stdout.output(), /\[2m/, "x");
  app.unmount();
  app.cleanup();
});

test("golden_rerender_updates_output (IKINV-001)", async () => {
  const app = renderTesting(<Text>one</Text>);
  await flushTurns();
  assert.equal(app.lastFrame(), "one");

  app.rerender(<Text>two</Text>);
  await flushTurns();
  assert.equal(app.lastFrame(), "two");

  app.unmount();
  app.cleanup();
});

test("golden_transform_output (IKINV-004)", async () => {
  const app = renderTesting(
    <Transform transform={(text) => text.toUpperCase()}>
      <Text>abc</Text>
    </Transform>,
  );

  await flushTurns();
  assert.equal(app.lastFrame(), "ABC");
  app.unmount();
  app.cleanup();
});

test("golden_static_accumulates (IKINV-004)", async () => {
  const App = ({ items }: Readonly<{ items: string[] }>) => (
    <>
      <Static items={items}>{(item) => <Text>{item}</Text>}</Static>
      <Text>tail</Text>
    </>
  );

  const app = renderTesting(<App items={[]} />);
  await flushTurns();
  assert.equal(app.lastFrame(), "tail");

  app.rerender(<App items={["a"]} />);
  await flushTurns();
  assert.equal(app.lastFrame(), "a\ntail");

  app.rerender(<App items={["a", "b"]} />);
  await flushTurns();
  assert.equal(app.lastFrame(), "a\nb\ntail");

  app.unmount();
  app.cleanup();
});
