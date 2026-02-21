import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardCommand } from "../helpers/keybindings.js";

test("dashboard keybinding map resolves canonical keys", () => {
  assert.equal(resolveDashboardCommand("q"), "quit");
  assert.equal(resolveDashboardCommand("j"), "move-down");
  assert.equal(resolveDashboardCommand("k"), "move-up");
  assert.equal(resolveDashboardCommand("f"), "cycle-filter");
  assert.equal(resolveDashboardCommand("t"), "cycle-theme");
  assert.equal(resolveDashboardCommand("x"), undefined);
});
