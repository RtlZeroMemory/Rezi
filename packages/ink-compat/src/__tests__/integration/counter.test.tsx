import { ZR_KEY_ENTER } from "@rezi-ui/core/keybindings";
import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Text, useApp, useInput } from "../../index.js";
import { findText } from "../../testing/findText.js";
import { simulateKeyEvent, simulateTextEvent } from "../../testing/simulateKeyEvent.js";
import { createHarness } from "./harness.js";

describe("integration: counter", () => {
  test("useState + useInput updates the rendered VNode tree", () => {
    let exited = false;
    const h = createHarness({
      app: {
        exit: () => {
          exited = true;
        },
        rerender: () => {},
      },
    });

    function App() {
      const [count, setCount] = React.useState(0);
      const { exit } = useApp();

      useInput((input, key) => {
        if (input === "q") exit();
        if (key.return) setCount((c) => c + 1);
      });

      return (
        <Box flexDirection="column" padding={1}>
          <Text>Count: {count}</Text>
          <Text>Press Enter to increment, q to quit.</Text>
        </Box>
      );
    }

    h.update(<App />);

    assert.equal(findText(h.getLast(), "Count: 0"), true);
    assert.equal(exited, false);

    simulateKeyEvent(h.emitter, { key: ZR_KEY_ENTER });
    assert.equal(findText(h.getLast(), "Count: 1"), true);

    simulateTextEvent(h.emitter, { codepoint: "q".codePointAt(0) ?? 113 });
    assert.equal(exited, true);

    h.unmount();
  });
});
