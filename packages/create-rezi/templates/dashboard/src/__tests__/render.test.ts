import assert from "node:assert/strict";
import test from "node:test";
import { createTestRenderer } from "@rezi-ui/core/testing";
import { createInitialState } from "../helpers/state.js";
import { renderOverviewScreen } from "../screens/overview.js";

test("dashboard overview render includes core markers", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 120, rows: 34 } });
  const tree = renderOverviewScreen(state, {
    onTogglePause: () => {},
    onCycleFilter: () => {},
    onCycleTheme: () => {},
    onToggleHelp: () => {},
    onSelectService: () => {},
  });

  const output = renderer.render(tree).toText();
  assert.match(output, /__APP_NAME__/);
  assert.match(output, /Service Fleet/);
});
