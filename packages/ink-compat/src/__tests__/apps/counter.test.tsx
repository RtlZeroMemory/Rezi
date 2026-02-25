/**
 * Tier 1 Test App: Counter
 *
 * Exercises: Box, Text, useInput, useApp().exit(), rerender cycle,
 * border, color, bold, Spacer, key handling.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React, { useState } from "react";

import { Box, Spacer, Text, useApp, useInput } from "../../index.js";
import { render } from "../../testing/index.js";

const Counter: React.FC = () => {
  const { exit } = useApp();
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setCount((c) => c + 1);
    } else if (key.downArrow || input === "j") {
      setCount((c) => Math.max(0, c - 1));
    } else if (input === "r") {
      setCount(0);
    } else if (input === "q") {
      exit();
    }
  });

  return React.createElement(
    Box,
    { flexDirection: "column", borderStyle: "round", padding: 1 },
    React.createElement(Text, { bold: true, color: "cyan" }, "Counter App"),
    React.createElement(
      Box,
      { flexDirection: "row", marginTop: 1 },
      React.createElement(Text, null, "Count: "),
      React.createElement(
        Text,
        { color: count > 0 ? "green" : "white", bold: true },
        String(count),
      ),
      React.createElement(Spacer, null),
      React.createElement(Text, { dimColor: true }, "↑/k +1  ↓/j -1  r reset  q quit"),
    ),
  );
};

function readCount(frame: string): number {
  const match = frame.match(/Count:\s*(\d+)/);
  assert.ok(match, "count line should exist");
  return Number.parseInt(match[1]!, 10);
}

test("counter: renders initial state", () => {
  const { lastFrame } = render(React.createElement(Counter));
  const frame = lastFrame();
  assert.ok(frame.includes("Counter App"), "should show title");
  assert.ok(frame.includes("Count:"), "should show count label");
  assert.equal(readCount(frame), 0, "should show initial count 0");
});

test("counter: up arrow increments", () => {
  const { lastFrame, stdin } = render(React.createElement(Counter));
  stdin.write("\u001b[A"); // up arrow
  assert.equal(readCount(lastFrame()), 1, "count should be 1 after up arrow");
});

test("counter: k key increments", () => {
  const { lastFrame, stdin } = render(React.createElement(Counter));
  stdin.write("k");
  assert.equal(readCount(lastFrame()), 1, "count should be 1 after k");
  stdin.write("k");
  assert.equal(readCount(lastFrame()), 2, "count should be 2 after second k");
});

test("counter: down arrow decrements", () => {
  const { lastFrame, stdin } = render(React.createElement(Counter));
  stdin.write("k"); // go to 1
  stdin.write("k"); // go to 2
  stdin.write("\u001b[B"); // down arrow → 1
  assert.equal(readCount(lastFrame()), 1, "count should be 1 after decrement");
});

test("counter: does not go below zero", () => {
  const { lastFrame, stdin } = render(React.createElement(Counter));
  stdin.write("\u001b[B"); // down arrow at 0
  assert.equal(readCount(lastFrame()), 0, "count should stay at 0");
});

test("counter: r resets to zero", () => {
  const { lastFrame, stdin } = render(React.createElement(Counter));
  stdin.write("k");
  stdin.write("k");
  stdin.write("k");
  assert.equal(readCount(lastFrame()), 3, "count should be 3");
  stdin.write("r");
  assert.equal(readCount(lastFrame()), 0, "count should reset to 0");
});

test("counter: renders border", () => {
  const { lastFrame } = render(React.createElement(Counter));
  const frame = lastFrame();
  // Rounded border uses ╭ ╮ ╰ ╯
  assert.ok(
    frame.includes("╭") || frame.includes("┌") || frame.includes("─"),
    "should render some border character",
  );
});

test("counter: multiple frames captured", () => {
  const { frames, stdin } = render(React.createElement(Counter));
  const initialFrameCount = frames.length;
  stdin.write("k");
  assert.ok(frames.length > initialFrameCount, "should have more frames after input");
});
