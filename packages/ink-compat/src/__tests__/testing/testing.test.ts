import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

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
