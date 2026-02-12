import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Text, useFocus } from "../../index.js";
import { findText } from "../../testing/findText.js";
import { simulateKeyEvent } from "../../testing/simulateKeyEvent.js";
import { createHarness } from "./harness.js";

describe("integration: focus cycle", () => {
  test("Tab / Shift+Tab cycle focus and ESC clears focus", () => {
    const h = createHarness();

    function Focusable({ id, label }: Readonly<{ id: string; label: string }>) {
      const { isFocused } = useFocus({ id });
      return <Text>{label + (isFocused ? "*" : "")}</Text>;
    }

    function App() {
      return (
        <Box flexDirection="column">
          <Focusable id="a" label="a" />
          <Focusable id="b" label="b" />
        </Box>
      );
    }

    h.update(<App />);

    // Initially no focus.
    assert.equal(findText(h.getLast(), "a*"), false);
    assert.equal(findText(h.getLast(), "b*"), false);

    simulateKeyEvent(h.emitter, { input: "\t" });
    assert.equal(findText(h.getLast(), "a*"), true);
    assert.equal(findText(h.getLast(), "b*"), false);

    simulateKeyEvent(h.emitter, { input: "\t" });
    assert.equal(findText(h.getLast(), "a*"), false);
    assert.equal(findText(h.getLast(), "b*"), true);

    simulateKeyEvent(h.emitter, { input: "\u001B[Z" });
    assert.equal(findText(h.getLast(), "a*"), true);
    assert.equal(findText(h.getLast(), "b*"), false);

    simulateKeyEvent(h.emitter, { input: "\u001B" });
    assert.equal(findText(h.getLast(), "a*"), false);
    assert.equal(findText(h.getLast(), "b*"), false);

    h.unmount();
  });
});
