import assert from "node:assert/strict";
import test from "node:test";
import { resolveStressExampleCommand } from "../helpers/test-examples.js";

test("stress example keybinding map resolves expected controls", () => {
  assert.equal(resolveStressExampleCommand("q"), "quit");
  assert.equal(resolveStressExampleCommand("+"), "advance-phase");
  assert.equal(resolveStressExampleCommand("-"), "rewind-phase");
  assert.equal(resolveStressExampleCommand("z"), "toggle-turbo");
  assert.equal(resolveStressExampleCommand("x"), undefined);
});
