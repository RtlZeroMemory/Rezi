import { strict as assert } from "node:assert";
import test from "node:test";

import React from "react";

import { Text, Transform, render } from "../index.js";
import { cleanup as cleanupTesting, render as renderTesting } from "../testing.js";
import { MemoryWriteStream, createStdin, flushTurns, stripAnsi } from "./helpers.js";

test.afterEach(() => {
  cleanupTesting();
});

test("transform_multiline_index_mapping_is_stable (IKINV-004)", async () => {
  const app = renderTesting(
    <Transform transform={(line, index) => `${index}:${line}`}>
      <Text>{"alpha\nbeta\ngamma"}</Text>
    </Transform>,
  );

  await flushTurns(6);

  assert.equal(app.lastFrame(), "0:alpha\n1:beta\n2:gamma");

  app.unmount();
  app.cleanup();
});

async function runModeScenario(isTTY: boolean): Promise<string> {
  const stdout = new MemoryWriteStream({ isTTY, columns: 80 });
  const stderr = new MemoryWriteStream({ isTTY, columns: 80 });
  const stdin = createStdin(isTTY);

  const app = render(<Text>start</Text>, { stdout, stderr, stdin, debug: true });

  for (let index = 1; index <= 40; index++) {
    app.rerender(<Text>{`step=${index}`}</Text>);
  }

  await flushTurns(8);
  const finalFrame = stripAnsi(stdout.lastChunk());

  app.unmount();
  app.cleanup();

  return finalFrame;
}

test("tty_and_non_tty_rerender_sequences_are_deterministic (IKINV-008)", async () => {
  const ttyFrame = await runModeScenario(true);
  const nonTtyFrame = await runModeScenario(false);

  assert.equal(ttyFrame, "step=40");
  assert.equal(nonTtyFrame, "step=40");
  assert.equal(ttyFrame, nonTtyFrame);
});

test("high_frequency_rerender_final_output_is_deterministic (IKINV-001)", async () => {
  const iterations = 300;
  const app = renderTesting(<Text>frame-0</Text>);

  for (let index = 1; index <= iterations; index++) {
    app.rerender(<Text>{`frame-${index}`}</Text>);
  }

  await flushTurns(10);

  assert.equal(app.lastFrame(), `frame-${iterations}`);
  assert.equal(app.frames.at(-1), `frame-${iterations}`);
  assert.ok(app.frames.length >= 1);

  app.unmount();
  app.cleanup();
});
