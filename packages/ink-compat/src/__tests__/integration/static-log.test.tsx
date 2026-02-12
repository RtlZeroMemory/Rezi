import { assert, describe, test } from "@rezi-ui/testkit";
import React from "react";
import { Box, Static, Text, useInput } from "../../index.js";
import { collectText, findText } from "../../testing/findText.js";
import { simulateKeyEvent, simulateTextEvent } from "../../testing/simulateKeyEvent.js";
import type { Key } from "../../types.js";
import { createHarness } from "./harness.js";

describe("integration: static log", () => {
  test("<Static> accumulates above dynamic output without duplicating on rerender", () => {
    const h = createHarness();

    function App() {
      const [log, setLog] = React.useState<string[]>([]);
      const [tick, setTick] = React.useState(0);

      const onInput = React.useCallback((input: string, key: Key) => {
        if (input === "a") setLog((prev) => [...prev, `log${prev.length + 1}`]);
        if (key.return) setTick((t) => t + 1);
      }, []);

      useInput(onInput);

      return (
        <Box flexDirection="column">
          <Static items={log}>{(item, i) => <Text key={String(i)}>{item}</Text>}</Static>
          <Text>tick:{tick}</Text>
        </Box>
      );
    }

    h.update(<App />);
    const initial = h.getLast();
    assert.equal(findText(initial, "tick:0"), true);
    assert.equal(findText(initial, "log1"), false);

    simulateTextEvent(h.emitter, { input: "a" });
    const afterLog1 = h.getLast();
    assert.equal(findText(afterLog1, "log1"), true);
    assert.equal(findText(afterLog1, "tick:0"), true);
    const afterLog1Children = "children" in afterLog1 ? afterLog1.children.length : 0;

    simulateKeyEvent(h.emitter, { input: "\r" });
    const afterTick1 = h.getLast();
    assert.equal(findText(afterTick1, "log1"), true);
    assert.equal(findText(afterTick1, "tick:1"), true);
    const afterTick1Children = "children" in afterTick1 ? afterTick1.children.length : 0;
    assert.equal(
      afterTick1Children,
      afterLog1Children,
      "dynamic updates should not append static output",
    );

    simulateTextEvent(h.emitter, { input: "a" });
    const afterLog2 = h.getLast();
    assert.equal(findText(afterLog2, "log1"), true);
    assert.equal(findText(afterLog2, "log2"), true);
    const allText = collectText(afterLog2);
    assert.equal(allText.filter((t) => t === "log1").length, 1, "should not duplicate log lines");

    h.unmount();
  });
});
