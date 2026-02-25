import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { Box } from "../../components/Box.js";
import { Static } from "../../components/Static.js";
import { Text } from "../../components/Text.js";
import { renderToString } from "../../runtime/renderToString.js";

test("renderToString renders text", () => {
  const output = renderToString(React.createElement(Text, null, "Hello"), { columns: 20 });
  assert.match(output, /Hello/);
});

test("renderToString renders row layout", () => {
  const output = renderToString(
    React.createElement(
      Box,
      { flexDirection: "row" },
      React.createElement(Text, null, "A"),
      React.createElement(Text, null, "B"),
    ),
    { columns: 20 },
  );

  assert.match(output.replace(/\n/g, ""), /A\s*B/);
});

test("renderToString prepends Static output declared after dynamic content", () => {
  const output = renderToString(
    React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Dynamic"),
      React.createElement(Static<string>, {
        items: ["S"],
        children: (item: string) => React.createElement(Text, { key: item }, item),
      }),
    ),
    { columns: 20 },
  );

  const lines = output.split("\n");
  const staticIndex = lines.findIndex((line) => line.includes("S"));
  const dynamicIndex = lines.findIndex((line) => line.includes("Dynamic"));
  assert.ok(staticIndex >= 0);
  assert.ok(dynamicIndex >= 0);
  assert.ok(staticIndex < dynamicIndex);
});

test("renderToString preserves first Static render when items mutate", () => {
  function App(): React.ReactElement {
    const [items, setItems] = React.useState([{ id: "a", label: "first" }]);

    React.useLayoutEffect(() => {
      setItems([{ id: "a", label: "updated" }]);
    }, []);

    return React.createElement(Static<{ id: string; label: string }>, {
      items,
      children: (item) => React.createElement(Text, { key: item.id }, item.label),
    });
  }

  const output = renderToString(React.createElement(App), { columns: 20 });

  assert.ok(output.includes("first"));
  assert.equal(output.includes("updated"), false);
});
