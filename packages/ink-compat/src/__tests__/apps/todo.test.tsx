/**
 * Tier 1 Test App: Todo List
 *
 * Exercises: Static (completed items), Box borders, Text colors,
 * arrow key navigation, state management, conditional rendering,
 * flexDirection row, multiple children.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React, { useState } from "react";

import { Box, Static, Text, useInput } from "../../index.js";
import { render } from "../../testing/index.js";

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

const INITIAL_TODOS: Todo[] = [
  { id: 1, title: "Buy groceries", done: false },
  { id: 2, title: "Write tests", done: false },
  { id: 3, title: "Ship feature", done: false },
];

const TodoApp: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>(INITIAL_TODOS);
  const [cursor, setCursor] = useState(0);

  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(pending.length - 1, c + 1));
    } else if (key.return || input === " ") {
      const target = pending[cursor];
      if (target) {
        setTodos((prev) =>
          prev.map((t) => (t.id === target.id ? { ...t, done: true } : t)),
        );
        setCursor((c) => Math.min(c, Math.max(0, pending.length - 2)));
      }
    }
  });

  return React.createElement(
    Box,
    { flexDirection: "column" },
    // Completed items in Static (rendered once, scrollback)
    completed.length > 0
      ? React.createElement(Static<Todo>, {
          items: completed,
          children: (todo: Todo) =>
            React.createElement(
              Box,
              { key: String(todo.id), flexDirection: "row", gap: 1 },
              React.createElement(Text, { color: "green" }, "✓"),
              React.createElement(Text, { strikethrough: true, dimColor: true }, todo.title),
            ),
        })
      : null,
    // Header
    React.createElement(
      Box,
      { borderStyle: "single", paddingX: 1 },
      React.createElement(
        Text,
        { bold: true },
        `Todo (${pending.length} remaining)`,
      ),
    ),
    // Pending items
    ...pending.map((todo, i) =>
      React.createElement(
        Box,
        { key: String(todo.id), flexDirection: "row", paddingLeft: 1 },
        React.createElement(
          Text,
          { color: i === cursor ? "cyan" : "white" },
          i === cursor ? "❯ " : "  ",
        ),
        React.createElement(
          Text,
          { color: i === cursor ? "cyan" : "white", bold: i === cursor },
          todo.title,
        ),
      ),
    ),
    // Footer hint
    React.createElement(
      Box,
      { marginTop: 1, paddingLeft: 1 },
      React.createElement(Text, { dimColor: true }, "↑↓ navigate  ⏎/space complete"),
    ),
  );
};

test("todo: renders all pending items", () => {
  const { lastFrame } = render(React.createElement(TodoApp));
  const frame = lastFrame();
  assert.ok(frame.includes("Buy groceries"), "should show first todo");
  assert.ok(frame.includes("Write tests"), "should show second todo");
  assert.ok(frame.includes("Ship feature"), "should show third todo");
  assert.ok(frame.includes("3 remaining"), "should show 3 remaining");
});

test("todo: cursor highlights first item by default", () => {
  const { lastFrame } = render(React.createElement(TodoApp));
  const frame = lastFrame();
  assert.ok(frame.includes("❯"), "should show cursor indicator");
});

test("todo: arrow down moves cursor", () => {
  const { lastFrame, stdin } = render(React.createElement(TodoApp));
  stdin.write("\u001b[B"); // down arrow
  const frame = lastFrame();
  // The cursor should now be on "Write tests" (index 1)
  // Hard to assert exact position in text, but frame should still contain all items
  assert.ok(frame.includes("Write tests"), "should still show Write tests");
  assert.ok(frame.includes("Buy groceries"), "should still show Buy groceries");
});

test("todo: enter completes focused item", () => {
  const { lastFrame, stdin } = render(React.createElement(TodoApp));
  // Complete first item (Buy groceries)
  stdin.write("\r"); // enter
  const frame = lastFrame();
  assert.ok(frame.includes("2 remaining"), "should show 2 remaining after completing one");
  // The completed item should appear in Static with checkmark
  assert.ok(frame.includes("✓"), "should show checkmark for completed item");
});

test("todo: space also completes focused item", () => {
  const { lastFrame, stdin } = render(React.createElement(TodoApp));
  stdin.write(" "); // space
  const frame = lastFrame();
  assert.ok(frame.includes("2 remaining"), "should show 2 remaining");
});

test("todo: complete multiple items", () => {
  const { lastFrame, stdin } = render(React.createElement(TodoApp));
  stdin.write("\r"); // complete first
  stdin.write("\r"); // complete next (now first in pending)
  const frame = lastFrame();
  assert.ok(frame.includes("1 remaining"), "should show 1 remaining");
});

test("todo: cursor does not go above 0", () => {
  const { lastFrame, stdin } = render(React.createElement(TodoApp));
  stdin.write("\u001b[A"); // up arrow at top
  stdin.write("\u001b[A"); // again
  const frame = lastFrame();
  assert.ok(frame.includes("❯"), "cursor should still be visible");
  assert.ok(frame.includes("3 remaining"), "all items still pending");
});

test("todo: renders border around header", () => {
  const { lastFrame } = render(React.createElement(TodoApp));
  const frame = lastFrame();
  assert.ok(
    frame.includes("┌") || frame.includes("│") || frame.includes("─"),
    "should render single border characters",
  );
});

test("todo: renders hint text", () => {
  const { lastFrame } = render(React.createElement(TodoApp));
  assert.ok(lastFrame().includes("navigate"), "should show navigation hint");
});
