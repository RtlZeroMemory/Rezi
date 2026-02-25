import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { Box } from "../../components/Box.js";
import { Static } from "../../components/Static.js";
import { Text } from "../../components/Text.js";
import { useInput } from "../../hooks/useInput.js";
import { render } from "../../testing/index.js";

test("testing render captures lastFrame and rerender", () => {
  const result = render(React.createElement(Text, null, "A"));
  assert.match(result.lastFrame(), /A/);

  result.rerender(React.createElement(Text, null, "B"));
  assert.match(result.lastFrame(), /B/);
  assert.ok(result.frames.length >= 2);
});

test("testing render stdin.write triggers useInput handlers", () => {
  let captured = "";

  function App(): React.ReactElement {
    useInput((input) => {
      captured += input;
    });
    return React.createElement(Text, null, "Input");
  }

  const result = render(React.createElement(App));
  result.stdin.write("x");

  assert.equal(captured, "x");
});

test("testing render prepends Static output regardless declaration order", () => {
  const result = render(
    React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Dynamic"),
      React.createElement(Static<string>, {
        items: ["Static line"],
        children: (item: string) => React.createElement(Text, { key: item }, item),
      }),
    ),
  );

  const lines = result.lastFrame().split("\n");
  const staticIndex = lines.findIndex((line) => line.includes("Static line"));
  const dynamicIndex = lines.findIndex((line) => line.includes("Dynamic"));
  assert.ok(staticIndex >= 0);
  assert.ok(dynamicIndex >= 0);
  assert.ok(staticIndex < dynamicIndex);
});

test("testing render keeps Static entries render-once across rerenders", () => {
  interface Item {
    id: string;
    label: string;
  }

  const App = ({ items }: { items: Item[] }): React.ReactElement =>
    React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Dynamic"),
      React.createElement(Static<Item>, {
        items,
        children: (item: Item) => React.createElement(Text, { key: item.id }, item.label),
      }),
    );

  const result = render(React.createElement(App, { items: [{ id: "1", label: "first" }] }));
  assert.ok(result.lastFrame().includes("first"));

  result.rerender(React.createElement(App, { items: [{ id: "1", label: "updated-first" }] }));
  assert.ok(result.lastFrame().includes("first"));
  assert.equal(result.lastFrame().includes("updated-first"), false);

  result.rerender(
    React.createElement(App, {
      items: [
        { id: "1", label: "updated-first" },
        { id: "2", label: "second" },
      ],
    }),
  );

  const finalFrame = result.lastFrame();
  assert.ok(finalFrame.includes("first"));
  assert.ok(finalFrame.includes("second"));
  assert.equal(finalFrame.includes("updated-first"), false);
});
