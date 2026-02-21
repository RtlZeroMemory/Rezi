import assert from "node:assert/strict";
import test from "node:test";
import { createTestRenderer } from "@rezi-ui/core/testing";
import { createInitialState } from "../helpers/state.js";
import { renderMainScreen } from "../screens/main-screen.js";

test("minimal screen renders key widgets", () => {
  const state = createInitialState();
  const renderer = createTestRenderer({ viewport: { cols: 90, rows: 22 } });
  const output = renderer
    .render(
      renderMainScreen(state, {
        onIncrement: () => {},
        onDecrement: () => {},
        onCycleTheme: () => {},
        onToggleHelp: () => {},
        onClearError: () => {},
      }),
    )
    .toText();

  assert.match(output, /__APP_NAME__/);
  assert.match(output, /Counter/);
});
