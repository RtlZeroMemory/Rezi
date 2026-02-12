import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Text, useInput } from "../../index.js";
import { findText } from "../../testing/findText.js";
import { simulateKeyEvent } from "../../testing/simulateKeyEvent.js";
import { createHarness } from "./harness.js";

describe("integration: list navigation", () => {
  test("arrow keys update selection", () => {
    const h = createHarness();

    function App() {
      const items = ["one", "two", "three"];
      const [selected, setSelected] = React.useState(0);

      useInput((_input, key) => {
        if (key.downArrow) setSelected((s) => (s + 1) % items.length);
        if (key.upArrow) setSelected((s) => (s - 1 + items.length) % items.length);
      });

      return (
        <Box flexDirection="column">
          {items.map((item, i) => (
            <Text key={item}>
              {i === selected ? "> " : "  "}
              {item}
            </Text>
          ))}
        </Box>
      );
    }

    h.update(<App />);
    assert.equal(findText(h.getLast(), "> one"), true);

    simulateKeyEvent(h.emitter, { input: "\u001B[B" });
    h.flush();
    assert.equal(findText(h.getLast(), "> two"), true);

    simulateKeyEvent(h.emitter, { input: "\u001B[B" });
    h.flush();
    assert.equal(findText(h.getLast(), "> three"), true);

    simulateKeyEvent(h.emitter, { input: "\u001B[B" });
    h.flush();
    assert.equal(findText(h.getLast(), "> one"), true);

    simulateKeyEvent(h.emitter, { input: "\u001B[A" });
    h.flush();
    assert.equal(findText(h.getLast(), "> three"), true);

    h.unmount();
  });
});
