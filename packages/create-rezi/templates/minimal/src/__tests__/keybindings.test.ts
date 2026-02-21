import assert from "node:assert/strict";
import test from "node:test";
import { resolveMinimalCommand } from "../helpers/keybindings.js";

test("minimal keybinding map resolves expected commands", () => {
  assert.equal(resolveMinimalCommand("q"), "quit");
  assert.equal(resolveMinimalCommand("+"), "increment");
  assert.equal(resolveMinimalCommand("-"), "decrement");
  assert.equal(resolveMinimalCommand("t"), "cycle-theme");
  assert.equal(resolveMinimalCommand("e"), "raise-error");
  assert.equal(resolveMinimalCommand("x"), undefined);
});
