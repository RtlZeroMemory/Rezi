import assert from "node:assert/strict";
import test from "node:test";
import { resolveStarshipCommand } from "../helpers/keybindings.js";

test("global keys resolve correctly", () => {
  assert.equal(resolveStarshipCommand("q"), "quit");
  assert.equal(resolveStarshipCommand("ctrl+c"), "quit");
  assert.equal(resolveStarshipCommand("1"), "go-bridge");
  assert.equal(resolveStarshipCommand("2"), "go-engineering");
  assert.equal(resolveStarshipCommand("3"), "go-crew");
  assert.equal(resolveStarshipCommand("4"), "go-comms");
  assert.equal(resolveStarshipCommand("5"), "go-cargo");
  assert.equal(resolveStarshipCommand("6"), "go-settings");
  assert.equal(resolveStarshipCommand("t"), "cycle-theme");
  assert.equal(resolveStarshipCommand("?"), "toggle-help");
  assert.equal(resolveStarshipCommand("ctrl+p"), "toggle-command-palette");
});

test("route-specific keys resolve on matching routes", () => {
  assert.equal(resolveStarshipCommand("a", "bridge"), "toggle-autopilot");
  assert.equal(resolveStarshipCommand("b", "engineering"), "engineering-boost");
  assert.equal(resolveStarshipCommand("n", "crew"), "crew-new-assignment");
  assert.equal(resolveStarshipCommand("h", "comms"), "comms-hail");
  assert.equal(resolveStarshipCommand("enter", "comms"), "comms-acknowledge");
  assert.equal(resolveStarshipCommand("h", "settings"), undefined);
  assert.equal(resolveStarshipCommand("n", "bridge"), undefined);
});

test("key normalization trims and lowercases input", () => {
  assert.equal(resolveStarshipCommand(" Q "), "quit");
  assert.equal(resolveStarshipCommand("CTRL+P"), "toggle-command-palette");
  assert.equal(resolveStarshipCommand(""), undefined);
  assert.equal(resolveStarshipCommand("   "), undefined);
});

test("unknown keys return undefined", () => {
  assert.equal(resolveStarshipCommand("z"), undefined);
  assert.equal(resolveStarshipCommand("ctrl+alt+9"), undefined);
});
