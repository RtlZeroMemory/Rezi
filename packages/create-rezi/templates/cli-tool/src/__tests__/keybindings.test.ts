import assert from "node:assert/strict";
import test from "node:test";
import { resolveCliCommand } from "../helpers/keybindings.js";

test("cli keybinding map resolves route shortcuts", () => {
  assert.equal(resolveCliCommand("f1"), "go-home");
  assert.equal(resolveCliCommand("f2"), "go-logs");
  assert.equal(resolveCliCommand("f3"), "go-settings");
  assert.equal(resolveCliCommand("p"), "toggle-refresh");
  assert.equal(resolveCliCommand("q"), "quit");
  assert.equal(resolveCliCommand("z"), undefined);
});
