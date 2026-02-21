import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  ACTIVITY_FEED_LIMIT,
  appendActivityFeed,
  buildSavePresentation,
  closeModalState,
  createModalState,
  isEditorInputId,
  summarizeHsrEvent,
} from "../hsr/widget-demo-feedback.mjs";

describe("widget demo feedback helper", () => {
  test("isEditorInputId matches known editor and form inputs", () => {
    assert.equal(isEditorInputId("self-edit-code"), true);
    assert.equal(isEditorInputId("name"), true);
    assert.equal(isEditorInputId("notes"), true);
    assert.equal(isEditorInputId("save-view-file"), false);
    assert.equal(isEditorInputId(""), false);
  });

  test("appendActivityFeed trims, deduplicates, and enforces limit", () => {
    const feed = appendActivityFeed([], "  first line  ");
    assert.deepEqual(feed, ["first line"]);

    const deduped = appendActivityFeed(feed, "first line");
    assert.deepEqual(deduped, ["first line"]);

    let rolling = deduped;
    for (let i = 0; i < ACTIVITY_FEED_LIMIT + 3; i++) {
      rolling = appendActivityFeed(rolling, `line ${String(i)}`);
    }
    assert.equal(rolling.length, ACTIVITY_FEED_LIMIT);
    assert.equal(rolling[0], "line 3");
    assert.equal(rolling[ACTIVITY_FEED_LIMIT - 1], `line ${String(ACTIVITY_FEED_LIMIT + 2)}`);
  });

  test("createModalState and closeModalState produce frozen modal objects", () => {
    const open = createModalState({
      tone: "error",
      title: "Boom",
      message: "Save failed",
      detail: "stack trace",
      autoCloseAtMs: 42,
    });
    assert.equal(open.open, true);
    assert.equal(open.tone, "error");
    assert.equal(open.autoCloseAtMs, 42);
    assert.equal(Object.isFrozen(open), true);

    const closed = closeModalState();
    assert.equal(closed.open, false);
    assert.equal(closed.tone, "info");
    assert.equal(closed.autoCloseAtMs, null);
    assert.equal(Object.isFrozen(closed), true);
  });

  test("buildSavePresentation: changed + reloaded yields success modal", () => {
    const now = 1_000;
    const result = buildSavePresentation({
      changed: true,
      reloaded: true,
      banner: "REZO",
      saveCount: 2,
      nowMs: now,
    });

    assert.equal(result.status.level, "success");
    assert.match(result.status.message, /Saved \+ reloaded: REZO/);
    assert.equal(result.modal?.open, true);
    assert.equal(result.modal?.tone, "success");
    assert.equal(result.modal?.autoCloseAtMs, now + 1800);
    assert.equal(result.activity, "Reload applied from self-edit save.");
  });

  test("buildSavePresentation: changed + not reloaded yields error modal", () => {
    const result = buildSavePresentation({
      changed: true,
      reloaded: false,
      banner: "REZO",
      saveCount: 0,
      nowMs: 5_000,
    });

    assert.equal(result.status.level, "error");
    assert.match(result.status.message, /Saved file but reload failed/);
    assert.equal(result.modal?.tone, "error");
    assert.equal(result.modal?.autoCloseAtMs, null);
    assert.equal(result.activity, "File saved, but live reload failed.");
  });

  test("buildSavePresentation: unchanged + reloaded yields info modal", () => {
    const now = 7_000;
    const result = buildSavePresentation({
      changed: false,
      reloaded: true,
      banner: "REZO",
      saveCount: 3,
      nowMs: now,
    });

    assert.equal(result.status.level, "success");
    assert.match(result.status.message, /No file change; forced reload applied/);
    assert.equal(result.modal?.tone, "info");
    assert.equal(result.modal?.autoCloseAtMs, now + 1400);
    assert.equal(result.activity, "Manual reload applied (no file delta).");
  });

  test("buildSavePresentation: unchanged + not reloaded has no modal", () => {
    const result = buildSavePresentation({
      changed: false,
      reloaded: false,
      banner: "",
      saveCount: 0,
      nowMs: 9_000,
    });

    assert.equal(result.status.level, "success");
    assert.match(result.status.message, /placeholder/);
    assert.equal(result.modal, null);
    assert.equal(result.activity, "No file change detected.");
  });

  test("summarizeHsrEvent formats level and path tail", () => {
    const info = summarizeHsrEvent({
      level: "info",
      message: "file change view reload applied",
      changedPath: "/tmp/demo/widget-view.mjs",
    });
    assert.equal(info, "HSR: file change view reload applied (widget-view.mjs)");

    const warn = summarizeHsrEvent({
      level: "warn",
      message: "watch debounce active",
      changedPath: "C:\\demo\\router-routes.mjs",
    });
    assert.equal(warn, "HSR warning: watch debounce active (router-routes.mjs)");

    const error = summarizeHsrEvent({ level: "error", message: "" });
    assert.equal(error, "HSR error: HSR event");
  });
});
