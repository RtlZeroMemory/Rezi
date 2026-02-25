/**
 * Tests for ink-spinner and ink-gradient shims.
 */
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import React from "react";

import { render } from "../../testing/index.js";
import { render as runtimeRender } from "../../runtime/render.js";
import Spinner from "../../shims/ink-spinner.js";
import Gradient from "../../shims/ink-gradient.js";
import { Box, Text } from "../../index.js";

test("ink-spinner: renders dots spinner frame", () => {
  const { lastFrame, unmount } = render(
    React.createElement(Spinner, { type: "dots" }),
  );
  const frame = lastFrame();
  const dotsFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  assert.ok(
    dotsFrames.some((f) => frame.includes(f)),
    `should contain a dots frame character, got: ${frame}`,
  );
  unmount();
});

test("ink-spinner: default type is dots", () => {
  const { lastFrame, unmount } = render(
    React.createElement(Spinner),
  );
  const frame = lastFrame();
  const dotsFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  assert.ok(
    dotsFrames.some((f) => frame.includes(f)),
    `default should render dots, got: ${frame}`,
  );
  unmount();
});

test("ink-spinner: Gemini CLI pattern — Spinner + label in Box", () => {
  const { lastFrame, unmount } = render(
    React.createElement(Box, null,
      React.createElement(Spinner, { type: "dots" }),
      React.createElement(Text, null, " Loading..."),
    ),
  );
  const frame = lastFrame();
  assert.ok(frame.includes("Loading..."), "label present");
  unmount();
});

test("ink-gradient: renders children with color", () => {
  const { lastFrame } = render(
    React.createElement(Gradient, { colors: ["#ff0000", "#00ff00"] },
      React.createElement(Text, null, "Hello World"),
    ),
  );
  const frame = lastFrame();
  assert.ok(frame.includes("Hello World"), "text content rendered");
});

test("ink-gradient: Gemini CLI pattern — gradient wrapping Text", () => {
  const { lastFrame } = render(
    React.createElement(Gradient, { colors: ["#ff6b6b", "#48dbfb", "#0abde3"] },
      React.createElement(Text, { bold: true }, "Gemini"),
    ),
  );
  const frame = lastFrame();
  assert.ok(frame.includes("Gemini"), "gradient-wrapped text renders");
});

test("ink-gradient: emits per-character ANSI truecolor output", () => {
  const previousNoColor = process.env["NO_COLOR"];
  const previousForceColor = process.env["FORCE_COLOR"];
  delete process.env["NO_COLOR"];
  delete process.env["FORCE_COLOR"];

  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new PassThrough() as PassThrough & {
    isTTY?: boolean;
    columns?: number;
    rows?: number;
    getColorDepth?: () => number;
  };
  stdout.isTTY = true;
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.getColorDepth = () => 4;
  const stderr = new PassThrough();

  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(
    React.createElement(Gradient, { colors: ["#ff0000", "#0000ff"] }, "AB"),
    { stdin, stdout, stderr },
  );

  try {
    assert.ok(writes.includes("38;2;255;0;0"), "expected first char to include first stop");
    assert.ok(writes.includes("38;2;0;0;255"), "expected second char to include second stop");
    assert.equal(writes.includes("38;5;"), false, "should not downgrade to ANSI-256");
  } finally {
    instance.unmount();
    instance.cleanup();
    if (previousNoColor == null) {
      delete process.env["NO_COLOR"];
    } else {
      process.env["NO_COLOR"] = previousNoColor;
    }
    if (previousForceColor == null) {
      delete process.env["FORCE_COLOR"];
    } else {
      process.env["FORCE_COLOR"] = previousForceColor;
    }
  }
});

test("ink-gradient: resets gradient per line (ink-gradient multiline behavior)", () => {
  const previousNoColor = process.env["NO_COLOR"];
  const previousForceColor = process.env["FORCE_COLOR"];
  delete process.env["NO_COLOR"];
  delete process.env["FORCE_COLOR"];

  const stdin = new PassThrough() as PassThrough & { setRawMode: (enabled: boolean) => void };
  stdin.setRawMode = () => {};
  const stdout = new PassThrough() as PassThrough & {
    isTTY?: boolean;
    columns?: number;
    rows?: number;
    getColorDepth?: () => number;
  };
  stdout.isTTY = true;
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.getColorDepth = () => 4;
  const stderr = new PassThrough();

  let writes = "";
  stdout.on("data", (chunk) => {
    writes += chunk.toString("utf-8");
  });

  const instance = runtimeRender(
    React.createElement(Gradient, { colors: ["#ff0000", "#0000ff"] }, "A\nB"),
    { stdin, stdout, stderr },
  );

  try {
    const bColorMatch = writes.match(/38;2;(\d+);(\d+);(\d+)mB/);
    assert.ok(bColorMatch, "expected ANSI truecolor prefix for B");
    assert.equal(bColorMatch[1], "255");
    assert.equal(bColorMatch[2], "0");
    assert.equal(bColorMatch[3], "0");
  } finally {
    instance.unmount();
    instance.cleanup();
    if (previousNoColor == null) {
      delete process.env["NO_COLOR"];
    } else {
      process.env["NO_COLOR"] = previousNoColor;
    }
    if (previousForceColor == null) {
      delete process.env["FORCE_COLOR"];
    } else {
      process.env["FORCE_COLOR"] = previousForceColor;
    }
  }
});
