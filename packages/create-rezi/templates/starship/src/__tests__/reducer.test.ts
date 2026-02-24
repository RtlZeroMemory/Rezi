import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialState,
  reduceStarshipState,
  sortedCargo,
  visibleCrew,
} from "../helpers/state.js";

test("tick advances telemetry deterministically", () => {
  const initial = createInitialState(1_000);
  const nextA = reduceStarshipState(initial, { type: "tick", nowMs: 1_800 });
  const nextB = reduceStarshipState(initial, { type: "tick", nowMs: 1_800 });

  assert.deepEqual(nextA.telemetry, nextB.telemetry);
  assert.equal(nextA.tick, 1);
  assert.equal(nextA.telemetryHistory.length, 60);
});

test("toggle-pause toggles state", () => {
  const initial = createInitialState(0);
  const paused = reduceStarshipState(initial, { type: "toggle-pause" });
  const resumed = reduceStarshipState(paused, { type: "toggle-pause" });
  assert.equal(paused.paused, true);
  assert.equal(resumed.paused, false);
});

test("toggle-red-alert cycles alert level", () => {
  const initial = createInitialState(0);
  const red = reduceStarshipState(initial, { type: "toggle-red-alert" });
  const yellow = reduceStarshipState(red, { type: "toggle-red-alert" });
  assert.equal(red.alertLevel, "red");
  assert.equal(yellow.alertLevel, "yellow");
});

test("crew selection and search filtering", () => {
  const initial = createInitialState(0);
  const member = initial.crew[5];
  assert.ok(member);

  const selected = reduceStarshipState(initial, { type: "select-crew", crewId: member.id });
  assert.equal(selected.selectedCrewId, member.id);

  const searched = reduceStarshipState(selected, {
    type: "set-crew-search",
    query: member.name.split(" ")[0] ?? "",
  });
  const visible = visibleCrew(searched);
  assert.ok(visible.some((entry) => entry.id === member.id));
});

test("subsystem tree expansion toggles", () => {
  const initial = createInitialState(0);
  const target = "warp-core";
  const opened = reduceStarshipState(initial, { type: "toggle-subsystem", subsystemId: target });
  assert.equal(opened.expandedSubsystemIds.includes(target), true);

  const closed = reduceStarshipState(opened, { type: "toggle-subsystem", subsystemId: target });
  assert.equal(closed.expandedSubsystemIds.includes(target), false);
});

test("comms channel switching and message acknowledgment", () => {
  const initial = createInitialState(0);
  const switched = reduceStarshipState(initial, { type: "switch-channel", channel: "emergency" });
  assert.equal(switched.activeChannel, "emergency");

  const first = switched.messages[0];
  assert.ok(first);
  const acknowledged = reduceStarshipState(switched, {
    type: "acknowledge-message",
    messageId: first.id,
  });
  assert.equal(acknowledged.messages.find((item) => item.id === first.id)?.acknowledged, true);
});

test("cargo sorting updates ordering", () => {
  const initial = createInitialState(0);
  const sortedByName = reduceStarshipState(initial, { type: "set-cargo-sort", sortBy: "name" });
  const sorted = sortedCargo(sortedByName);
  assert.ok(sorted.length > 5);
  const first = sorted[0];
  const second = sorted[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.name.localeCompare(second.name) <= 0, true);
});

test("settings name can be validated by reducer result", () => {
  const initial = createInitialState(0);
  const invalid = reduceStarshipState(initial, { type: "set-ship-name", name: "" });
  assert.equal(invalid.shipName.trim().length, 0);

  const valid = reduceStarshipState(invalid, { type: "set-ship-name", name: "USS Atlas" });
  assert.equal(valid.shipName, "USS Atlas");
});

test("toast add and dismiss", () => {
  const initial = createInitialState(0);
  const withToast = reduceStarshipState(initial, {
    type: "add-toast",
    toast: {
      id: "toast-1",
      message: "Hello",
      level: "info",
      timestamp: 0,
      durationMs: 1000,
    },
  });
  assert.equal(withToast.toasts.length, 1);

  const dismissed = reduceStarshipState(withToast, { type: "dismiss-toast", toastId: "toast-1" });
  assert.equal(dismissed.toasts.length, 0);
});
