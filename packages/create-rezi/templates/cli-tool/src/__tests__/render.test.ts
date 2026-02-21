import assert from "node:assert/strict";
import test from "node:test";
import { createTestRenderer } from "@rezi-ui/core/testing";
import { createInitialState } from "../helpers/state.js";
import { buildHomeContent } from "../screens/home.js";

test("cli home content renders template markers", () => {
  const state = createInitialState(0);
  const renderer = createTestRenderer({ viewport: { cols: 100, rows: 24 } });
  const output = renderer.render(buildHomeContent(state)).toText();
  assert.match(output, /Route-aware Home screen/);
  assert.match(output, /Operator:/);
});
