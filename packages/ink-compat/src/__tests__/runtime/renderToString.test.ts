import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { Box } from "../../components/Box.js";
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
