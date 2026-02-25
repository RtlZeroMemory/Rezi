/**
 * Tier 1 Test App: Spinner / Timer
 *
 * Exercises: useEffect with timer, conditional rendering,
 * rerender with state changes, Text color transitions,
 * Box flexDirection row with multiple children.
 *
 * Note: We simulate ink-spinner's behavior without importing it,
 * since it's a third-party dep. This tests the same Box+Text
 * patterns that ink-spinner uses internally.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React, { useEffect, useState } from "react";

import { Box, Text, useApp } from "../../index.js";
import { render } from "../../testing/index.js";

// Simulated spinner (same pattern as ink-spinner)
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
  label: string;
}

const Spinner: React.FC<SpinnerProps> = ({ label }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return React.createElement(Box, { flexDirection: "row", gap: 1 },
    React.createElement(Text, { color: "green" }, SPINNER_FRAMES[frame]),
    React.createElement(Text, null, label),
  );
};

// App with loading → done transition
interface TaskStatus {
  name: string;
  done: boolean;
}

const TaskRunner: React.FC = () => {
  const { exit } = useApp();
  const [tasks, setTasks] = useState<TaskStatus[]>([
    { name: "Installing dependencies", done: false },
    { name: "Building project", done: false },
    { name: "Running tests", done: false },
  ]);

  const allDone = tasks.every((t) => t.done);

  useEffect(() => {
    if (allDone) {
      // Would exit in real app; here just verify state
    }
  }, [allDone, exit]);

  return React.createElement(Box, { flexDirection: "column", gap: 0 },
    React.createElement(Text, { bold: true }, "Task Runner"),
    React.createElement(Box, { height: 1 }), // blank line
    ...tasks.map((task) =>
      React.createElement(
        Box,
        { key: task.name, flexDirection: "row", gap: 1 },
        task.done
          ? React.createElement(Text, { color: "green" }, "✓")
          : React.createElement(Text, { color: "yellow" }, "⠋"),
        React.createElement(
          Text,
          { dimColor: task.done },
          task.name,
        ),
      ),
    ),
    allDone
      ? React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(Text, { color: "green", bold: true }, "All tasks complete!"),
        )
      : null,
  );
};

test("spinner: renders initial loading state", () => {
  const { lastFrame } = render(React.createElement(TaskRunner));
  const frame = lastFrame();
  assert.ok(frame.includes("Task Runner"), "title present");
  assert.ok(frame.includes("Installing dependencies"), "first task shown");
  assert.ok(frame.includes("Building project"), "second task shown");
  assert.ok(frame.includes("Running tests"), "third task shown");
});

test("spinner: shows spinner icon for pending tasks", () => {
  const { lastFrame } = render(React.createElement(TaskRunner));
  const frame = lastFrame();
  assert.ok(frame.includes("⠋"), "spinner frame shown for pending tasks");
});

test("spinner: rerender with completed task shows checkmark", () => {
  // Create a controllable version
  const Controllable: React.FC<{ done: boolean[] }> = ({ done }) => {
    return React.createElement(Box, { flexDirection: "column" },
      React.createElement(
        Box,
        { flexDirection: "row", gap: 1 },
        done[0]
          ? React.createElement(Text, { color: "green" }, "✓")
          : React.createElement(Text, { color: "yellow" }, "⠋"),
        React.createElement(Text, null, "Task A"),
      ),
      React.createElement(
        Box,
        { flexDirection: "row", gap: 1 },
        done[1]
          ? React.createElement(Text, { color: "green" }, "✓")
          : React.createElement(Text, { color: "yellow" }, "⠋"),
        React.createElement(Text, null, "Task B"),
      ),
    );
  };

  const { lastFrame, rerender } = render(
    React.createElement(Controllable, { done: [false, false] }),
  );

  let frame = lastFrame();
  assert.ok(frame.includes("⠋"), "initial: spinners shown");
  assert.ok(!frame.includes("✓"), "initial: no checkmarks");

  // Complete first task
  rerender(React.createElement(Controllable, { done: [true, false] }));
  frame = lastFrame();
  assert.ok(frame.includes("✓"), "after first done: checkmark appears");
  assert.ok(frame.includes("⠋"), "after first done: spinner still for second");

  // Complete both
  rerender(React.createElement(Controllable, { done: [true, true] }));
  frame = lastFrame();
  assert.ok(!frame.includes("⠋"), "all done: no spinners");
  // Should have two checkmarks
  const checkCount = (frame.match(/✓/g) || []).length;
  assert.ok(checkCount >= 2, `should have 2+ checkmarks (found ${checkCount})`);
});

// --- Standalone spinner component test ---

test("spinner: Spinner component renders label", () => {
  const { lastFrame, unmount } = render(
    React.createElement(Spinner, { label: "Loading..." }),
  );
  const frame = lastFrame();
  assert.ok(frame.includes("Loading..."), "label present");
  // Should have a spinner frame char
  assert.ok(
    SPINNER_FRAMES.some((f) => frame.includes(f)),
    "spinner frame character present",
  );
  unmount(); // Clean up setInterval
});

// --- Color transitions ---

test("spinner: color changes with state", () => {
  const ColorApp: React.FC<{ status: "loading" | "success" | "error" }> = ({ status }) => {
    const colorMap = { loading: "yellow", success: "green", error: "red" };
    const iconMap = { loading: "⠋", success: "✓", error: "✗" };
    return React.createElement(Box, { flexDirection: "row", gap: 1 },
      React.createElement(Text, { color: colorMap[status] }, iconMap[status]),
      React.createElement(Text, null, `Status: ${status}`),
    );
  };

  const { lastFrame, rerender } = render(
    React.createElement(ColorApp, { status: "loading" }),
  );
  assert.ok(lastFrame().includes("Status: loading"), "loading state");
  assert.ok(lastFrame().includes("⠋"), "loading icon");

  rerender(React.createElement(ColorApp, { status: "success" }));
  assert.ok(lastFrame().includes("Status: success"), "success state");
  assert.ok(lastFrame().includes("✓"), "success icon");

  rerender(React.createElement(ColorApp, { status: "error" }));
  assert.ok(lastFrame().includes("Status: error"), "error state");
  assert.ok(lastFrame().includes("✗"), "error icon");
});

// --- Unmount cleanup ---

test("spinner: unmount cleans up", () => {
  const { lastFrame, unmount } = render(
    React.createElement(Spinner, { label: "Working..." }),
  );
  assert.ok(lastFrame().includes("Working..."), "rendered before unmount");
  unmount();
  // After unmount, lastFrame should return last captured frame
  assert.ok(typeof lastFrame() === "string", "lastFrame returns string after unmount");
});
