import assert from "node:assert/strict";
import test from "node:test";
import { resolveAnimationLabCommand } from "../helpers/keybindings.js";

test("animation lab keybinding map resolves expected commands", () => {
  assert.equal(resolveAnimationLabCommand("q"), "quit");
  assert.equal(resolveAnimationLabCommand("space"), "toggle-autoplay");
  assert.equal(resolveAnimationLabCommand("enter"), "step");
  assert.equal(resolveAnimationLabCommand("right"), "nudge-right");
  assert.equal(resolveAnimationLabCommand("b"), "burst");
  assert.equal(resolveAnimationLabCommand("m"), "cycle-phase");
  assert.equal(resolveAnimationLabCommand("x"), undefined);
});
