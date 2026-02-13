import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { applyInputEditEvent } from "../inputEditor.js";

/* ABI-pinned key/modifier codes (docs/protocol/abi.md). */
const ZR_KEY_TAB = 3;
const ZR_KEY_BACKSPACE = 4;
const ZR_KEY_DELETE = 11;
const ZR_KEY_HOME = 12;
const ZR_KEY_END = 13;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;

const ZR_MOD_SHIFT = 1 << 0;
const ZR_MOD_CTRL = 1 << 1;
const ZR_MOD_ALT = 1 << 2;
const ZR_MOD_META = 1 << 3;

function keyEvent(
  key: number,
  opts: Readonly<{ mods?: number; action?: "down" | "up" | "repeat" }> = {},
): ZrevEvent {
  return {
    kind: "key",
    timeMs: 0,
    key,
    mods: opts.mods ?? 0,
    action: opts.action ?? "down",
  };
}

function textEvent(codepoint: number): ZrevEvent {
  return { kind: "text", timeMs: 0, codepoint };
}

function pasteEvent(bytes: Uint8Array): ZrevEvent {
  return { kind: "paste", timeMs: 0, bytes };
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function edit(
  event: ZrevEvent,
  ctx: Readonly<{ id: string; value: string; cursor: number }>,
): ReturnType<typeof applyInputEditEvent> {
  return applyInputEditEvent(event, ctx);
}

function routeInputWithFocus(
  event: ZrevEvent,
  ctx: Readonly<{
    inputId: string;
    focusedId: string | null;
    enabledById: ReadonlyMap<string, boolean>;
    value: string;
    cursor: number;
  }>,
): Readonly<{
  consumed: boolean;
  bubbled: boolean;
  value: string;
  cursor: number;
  action?: Readonly<{ id: string; action: "input"; value: string; cursor: number }>;
}> {
  const targetId =
    ctx.focusedId === ctx.inputId && ctx.enabledById.get(ctx.focusedId) === true
      ? ctx.focusedId
      : null;

  if (targetId === null) {
    return Object.freeze({
      consumed: false,
      bubbled: true,
      value: ctx.value,
      cursor: ctx.cursor,
    });
  }

  const next = edit(event, {
    id: targetId,
    value: ctx.value,
    cursor: ctx.cursor,
  });

  if (!next) {
    return Object.freeze({
      consumed: false,
      bubbled: true,
      value: ctx.value,
      cursor: ctx.cursor,
    });
  }

  return Object.freeze({
    consumed: true,
    bubbled: false,
    value: next.nextValue,
    cursor: next.nextCursor,
    ...(next.action ? { action: next.action } : {}),
  });
}

describe("input editor contract", () => {
  test("cursor movement: left/right/home/end are deterministic", () => {
    const value = "a\u0301b🙂"; // boundaries: 0, 2, 3, 5
    const events: readonly ZrevEvent[] = [
      keyEvent(ZR_KEY_LEFT),
      keyEvent(ZR_KEY_LEFT),
      keyEvent(ZR_KEY_LEFT),
      keyEvent(ZR_KEY_LEFT),
      keyEvent(ZR_KEY_RIGHT),
      keyEvent(ZR_KEY_RIGHT),
      keyEvent(ZR_KEY_RIGHT),
      keyEvent(ZR_KEY_RIGHT),
      keyEvent(ZR_KEY_HOME),
      keyEvent(ZR_KEY_END),
    ];
    const expectedCursors = [3, 2, 0, 0, 2, 3, 5, 5, 0, 5];

    let cursor = value.length;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev) {
        assert.fail(`missing event at index ${String(i)}`);
      }
      const next = edit(ev, { id: "input", value, cursor });
      assert.ok(next, `step ${String(i)} should be handled`);
      if (!next) return;
      assert.equal(next.nextValue, value, `step ${String(i)}: value`);
      assert.equal(next.nextCursor, expectedCursors[i], `step ${String(i)}: cursor`);
      assert.equal(next.action, undefined, `step ${String(i)}: action`);
      cursor = next.nextCursor;
    }
  });

  test("backspace/delete boundaries and edits are deterministic", () => {
    const value = "a\u0301b";

    const backspaceAtStart = edit(keyEvent(ZR_KEY_BACKSPACE), {
      id: "input",
      value,
      cursor: 0,
    });
    assert.deepEqual(backspaceAtStart, { nextValue: value, nextCursor: 0 });

    const deleteAtEnd = edit(keyEvent(ZR_KEY_DELETE), {
      id: "input",
      value,
      cursor: value.length,
    });
    assert.deepEqual(deleteAtEnd, { nextValue: value, nextCursor: value.length });

    const backspaceCluster = edit(keyEvent(ZR_KEY_BACKSPACE), {
      id: "input",
      value,
      cursor: 2,
    });
    assert.deepEqual(backspaceCluster, {
      nextValue: "b",
      nextCursor: 0,
      action: { id: "input", action: "input", value: "b", cursor: 0 },
    });

    const deleteFirstCluster = edit(keyEvent(ZR_KEY_DELETE), {
      id: "input",
      value,
      cursor: 0,
    });
    assert.deepEqual(deleteFirstCluster, {
      nextValue: "b",
      nextCursor: 0,
      action: { id: "input", action: "input", value: "b", cursor: 0 },
    });

    const deleteAfterCluster = edit(keyEvent(ZR_KEY_DELETE), {
      id: "input",
      value,
      cursor: 2,
    });
    assert.deepEqual(deleteAfterCluster, {
      nextValue: "a\u0301",
      nextCursor: 2,
      action: { id: "input", action: "input", value: "a\u0301", cursor: 2 },
    });
  });

  test("paste inserts multi-char text and updates cursor to insertion end", () => {
    const asciiPaste = edit(pasteEvent(utf8Bytes("WXYZ")), {
      id: "input",
      value: "12",
      cursor: 1,
    });
    assert.deepEqual(asciiPaste, {
      nextValue: "1WXYZ2",
      nextCursor: 5,
      action: { id: "input", action: "input", value: "1WXYZ2", cursor: 5 },
    });

    const crlfStripped = edit(pasteEvent(utf8Bytes("A\r\nB")), {
      id: "input",
      value: "xy",
      cursor: 1,
    });
    assert.deepEqual(crlfStripped, {
      nextValue: "xABy",
      nextCursor: 3,
      action: { id: "input", action: "input", value: "xABy", cursor: 3 },
    });

    const unicodePaste = edit(pasteEvent(utf8Bytes("👍z")), {
      id: "input",
      value: "ab",
      cursor: 1,
    });
    assert.deepEqual(unicodePaste, {
      nextValue: "a👍zb",
      nextCursor: 4,
      action: { id: "input", action: "input", value: "a👍zb", cursor: 4 },
    });
  });

  test("focus capture: focused+enabled input consumes; otherwise events bubble", () => {
    const enabledById = new Map<string, boolean>([["input", true]]);

    const consumed = routeInputWithFocus(textEvent(120), {
      inputId: "input",
      focusedId: "input",
      enabledById,
      value: "",
      cursor: 0,
    });
    assert.deepEqual(consumed, {
      consumed: true,
      bubbled: false,
      value: "x",
      cursor: 1,
      action: { id: "input", action: "input", value: "x", cursor: 1 },
    });

    const navigationConsumed = routeInputWithFocus(keyEvent(ZR_KEY_LEFT), {
      inputId: "input",
      focusedId: "input",
      enabledById,
      value: "abc",
      cursor: 2,
    });
    assert.deepEqual(navigationConsumed, {
      consumed: true,
      bubbled: false,
      value: "abc",
      cursor: 1,
    });

    const notFocused = routeInputWithFocus(textEvent(120), {
      inputId: "input",
      focusedId: "other",
      enabledById,
      value: "",
      cursor: 0,
    });
    assert.deepEqual(notFocused, {
      consumed: false,
      bubbled: true,
      value: "",
      cursor: 0,
    });

    const disabled = routeInputWithFocus(textEvent(120), {
      inputId: "input",
      focusedId: "input",
      enabledById: new Map([["input", false]]),
      value: "",
      cursor: 0,
    });
    assert.deepEqual(disabled, {
      consumed: false,
      bubbled: true,
      value: "",
      cursor: 0,
    });

    const nonEditingKeyBubbles = routeInputWithFocus(keyEvent(ZR_KEY_TAB), {
      inputId: "input",
      focusedId: "input",
      enabledById,
      value: "abc",
      cursor: 1,
    });
    assert.deepEqual(nonEditingKeyBubbles, {
      consumed: false,
      bubbled: true,
      value: "abc",
      cursor: 1,
    });
  });

  test("modifier handling: modifiers do not alter supported edit/navigation keys", () => {
    const mods = ZR_MOD_SHIFT | ZR_MOD_CTRL | ZR_MOD_ALT | ZR_MOD_META;

    const leftWithMods = edit(keyEvent(ZR_KEY_LEFT, { mods }), {
      id: "input",
      value: "abcd",
      cursor: 2,
    });
    assert.deepEqual(leftWithMods, { nextValue: "abcd", nextCursor: 1 });

    const rightWithMods = edit(keyEvent(ZR_KEY_RIGHT, { mods }), {
      id: "input",
      value: "abcd",
      cursor: 2,
    });
    assert.deepEqual(rightWithMods, { nextValue: "abcd", nextCursor: 3 });

    const homeWithMods = edit(keyEvent(ZR_KEY_HOME, { mods }), {
      id: "input",
      value: "abcd",
      cursor: 3,
    });
    assert.deepEqual(homeWithMods, { nextValue: "abcd", nextCursor: 0 });

    const endWithMods = edit(keyEvent(ZR_KEY_END, { mods }), {
      id: "input",
      value: "abcd",
      cursor: 1,
    });
    assert.deepEqual(endWithMods, { nextValue: "abcd", nextCursor: 4 });

    const backspaceWithMods = edit(keyEvent(ZR_KEY_BACKSPACE, { mods }), {
      id: "input",
      value: "abcd",
      cursor: 2,
    });
    assert.deepEqual(backspaceWithMods, {
      nextValue: "acd",
      nextCursor: 1,
      action: { id: "input", action: "input", value: "acd", cursor: 1 },
    });

    const deleteWithMods = edit(keyEvent(ZR_KEY_DELETE, { mods }), {
      id: "input",
      value: "abcd",
      cursor: 1,
    });
    assert.deepEqual(deleteWithMods, {
      nextValue: "acd",
      nextCursor: 1,
      action: { id: "input", action: "input", value: "acd", cursor: 1 },
    });

    const keyUpBubbles = edit(keyEvent(ZR_KEY_LEFT, { mods, action: "up" }), {
      id: "input",
      value: "abcd",
      cursor: 2,
    });
    assert.equal(keyUpBubbles, null);
  });
});
