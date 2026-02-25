/**
 * Tier 1 Test App: Focus Demo
 *
 * Exercises: useFocus, useFocusManager, Tab/Shift+Tab traversal,
 * border highlight on focus, multiple focusable elements,
 * autoFocus, programmatic focus, conditional styling.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

import { Box, Text, useFocus, useFocusManager, useInput } from "../../index.js";
import { render } from "../../testing/index.js";

interface ButtonProps {
  label: string;
  focusId: string;
  autoFocus?: boolean;
}

const FocusButton: React.FC<ButtonProps> = ({ label, focusId, autoFocus }) => {
  const focusOpts: { id: string; autoFocus?: boolean } = { id: focusId };
  if (autoFocus !== undefined) focusOpts.autoFocus = autoFocus;
  const { isFocused } = useFocus(focusOpts);
  return React.createElement(
    Box,
    {
      borderStyle: isFocused ? "bold" : "single",
      borderColor: isFocused ? "cyan" : "gray",
      paddingX: 1,
    },
    React.createElement(
      Text,
      { bold: isFocused, color: isFocused ? "cyan" : "white" },
      isFocused ? `> ${label}` : `  ${label}`,
    ),
  );
};

const FocusApp: React.FC = () => {
  return React.createElement(
    Box,
    { flexDirection: "column", gap: 1 },
    React.createElement(Text, { bold: true }, "Focus Demo — Tab to navigate"),
    React.createElement(FocusButton, { label: "Save", focusId: "btn-save", autoFocus: true }),
    React.createElement(FocusButton, { label: "Cancel", focusId: "btn-cancel" }),
    React.createElement(FocusButton, { label: "Delete", focusId: "btn-delete" }),
  );
};

test("focus: first button has autoFocus", () => {
  const { lastFrame } = render(React.createElement(FocusApp));
  const frame = lastFrame();
  assert.ok(frame.includes("> Save"), "Save should be focused (prefixed with >)");
  assert.ok(frame.includes("  Cancel"), "Cancel should not be focused");
  assert.ok(frame.includes("  Delete"), "Delete should not be focused");
});

test("focus: Tab moves to next button", () => {
  const { lastFrame, stdin } = render(React.createElement(FocusApp));
  stdin.write("\t"); // Tab
  const frame = lastFrame();
  assert.ok(frame.includes("  Save"), "Save should lose focus");
  assert.ok(frame.includes("> Cancel"), "Cancel should gain focus");
});

test("focus: Tab cycles through all buttons", () => {
  const { lastFrame, stdin } = render(React.createElement(FocusApp));

  // Tab to Cancel
  stdin.write("\t");
  assert.ok(lastFrame().includes("> Cancel"), "Should focus Cancel");

  // Tab to Delete
  stdin.write("\t");
  assert.ok(lastFrame().includes("> Delete"), "Should focus Delete");

  // Tab wraps to Save
  stdin.write("\t");
  assert.ok(lastFrame().includes("> Save"), "Should wrap back to Save");
});

test("focus: Shift+Tab moves backwards", () => {
  const { lastFrame, stdin } = render(React.createElement(FocusApp));

  // Shift+Tab from Save → wraps to Delete
  stdin.write("\u001b[Z"); // Shift+Tab
  assert.ok(lastFrame().includes("> Delete"), "Should wrap to Delete");

  // Shift+Tab → Cancel
  stdin.write("\u001b[Z");
  assert.ok(lastFrame().includes("> Cancel"), "Should move to Cancel");

  // Shift+Tab → Save
  stdin.write("\u001b[Z");
  assert.ok(lastFrame().includes("> Save"), "Should move back to Save");
});

test("focus: renders title", () => {
  const { lastFrame } = render(React.createElement(FocusApp));
  assert.ok(lastFrame().includes("Focus Demo"), "should render title");
});

test("focus: all three buttons rendered", () => {
  const { lastFrame } = render(React.createElement(FocusApp));
  const frame = lastFrame();
  assert.ok(frame.includes("Save"), "should show Save");
  assert.ok(frame.includes("Cancel"), "should show Cancel");
  assert.ok(frame.includes("Delete"), "should show Delete");
});

// --- Programmatic focus test ---

const ProgrammaticFocusApp: React.FC = () => {
  const { focus } = useFocusManager();

  useInput((input) => {
    if (input === "1") focus("btn-a");
    else if (input === "2") focus("btn-b");
    else if (input === "3") focus("btn-c");
  });

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(FocusButton, { label: "Alpha", focusId: "btn-a", autoFocus: true }),
    React.createElement(FocusButton, { label: "Beta", focusId: "btn-b" }),
    React.createElement(FocusButton, { label: "Gamma", focusId: "btn-c" }),
  );
};

test("focus: programmatic focus via number keys", () => {
  const { lastFrame, stdin } = render(React.createElement(ProgrammaticFocusApp));
  assert.ok(lastFrame().includes("> Alpha"), "Alpha should start focused");

  stdin.write("2");
  assert.ok(lastFrame().includes("> Beta"), "Beta should be focused after pressing 2");

  stdin.write("3");
  assert.ok(lastFrame().includes("> Gamma"), "Gamma should be focused after pressing 3");

  stdin.write("1");
  assert.ok(lastFrame().includes("> Alpha"), "Alpha should be focused after pressing 1");
});
