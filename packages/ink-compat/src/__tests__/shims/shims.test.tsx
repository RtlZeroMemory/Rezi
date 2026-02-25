/**
 * Tests for ink-spinner and ink-gradient shims.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

import { render } from "../../testing/index.js";
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
