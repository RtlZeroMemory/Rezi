import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { applyInputEditEvent } from "../inputEditor.js";

const ZR_KEY_BACKSPACE = 4;
const ZR_KEY_DELETE = 11;
const ZR_KEY_HOME = 12;
const ZR_KEY_END = 13;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;

const ZR_MOD_CTRL = 1 << 1;

function keyEvent(key: number, mods = 0): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods, action: "down" };
}

function textEvent(codepoint: number): ZrevEvent {
  return { kind: "text", timeMs: 0, codepoint };
}

function edit(
  event: ZrevEvent,
  ctx: Readonly<{ value: string; cursor: number }>,
): ReturnType<typeof applyInputEditEvent> {
  return applyInputEditEvent(event, { id: "input", value: ctx.value, cursor: ctx.cursor });
}

function noAction(value: string, cursor: number) {
  return {
    nextValue: value,
    nextCursor: cursor,
    nextSelectionStart: null,
    nextSelectionEnd: null,
  };
}

describe("input editor cursor boundaries", () => {
  test("backspace at position 0 is a no-op", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_BACKSPACE), { value: "abc", cursor: 0 }),
      noAction("abc", 0),
    );
  });

  test("delete at end is a no-op", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_DELETE), { value: "abc", cursor: 3 }),
      noAction("abc", 3),
    );
  });

  test("home at position 0 is idempotent", () => {
    assert.deepEqual(edit(keyEvent(ZR_KEY_HOME), { value: "abc", cursor: 0 }), noAction("abc", 0));
  });

  test("end at end of text is idempotent", () => {
    assert.deepEqual(edit(keyEvent(ZR_KEY_END), { value: "abc", cursor: 3 }), noAction("abc", 3));
  });

  test("home from middle moves to start", () => {
    assert.deepEqual(edit(keyEvent(ZR_KEY_HOME), { value: "abc", cursor: 2 }), noAction("abc", 0));
  });

  test("end from middle moves to end", () => {
    assert.deepEqual(edit(keyEvent(ZR_KEY_END), { value: "abc", cursor: 1 }), noAction("abc", 3));
  });

  test("left at start is a no-op", () => {
    assert.deepEqual(edit(keyEvent(ZR_KEY_LEFT), { value: "abc", cursor: 0 }), noAction("abc", 0));
  });

  test("right at end is a no-op", () => {
    assert.deepEqual(edit(keyEvent(ZR_KEY_RIGHT), { value: "abc", cursor: 3 }), noAction("abc", 3));
  });

  test("ctrl+left at start stays at 0", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_CTRL), { value: "hello world", cursor: 0 }),
      noAction("hello world", 0),
    );
  });

  test("ctrl+right at end stays at end", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_CTRL), { value: "hello world", cursor: 11 }),
      noAction("hello world", 11),
    );
  });

  test("ctrl+left skips to start of previous word", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_CTRL), { value: "hello world", cursor: 11 }),
      noAction("hello world", 6),
    );
  });

  test("ctrl+right skips to end of next word", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_CTRL), { value: "hello world", cursor: 0 }),
      noAction("hello world", 5),
    );
  });

  test("ctrl+right with punctuation stops at end of current word first", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_CTRL), { value: "hello, world", cursor: 0 }),
      noAction("hello, world", 5),
    );
  });

  test("ctrl+right from punctuation/space advances across separators then next word", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_CTRL), { value: "hello, world", cursor: 5 }),
      noAction("hello, world", 12),
    );
  });

  test("ctrl+left from word start lands at previous word start", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_CTRL), { value: "hello, world", cursor: 7 }),
      noAction("hello, world", 0),
    );
  });

  test("empty string keeps cursor at 0 for all movement keys", () => {
    const events = [
      keyEvent(ZR_KEY_LEFT),
      keyEvent(ZR_KEY_RIGHT),
      keyEvent(ZR_KEY_HOME),
      keyEvent(ZR_KEY_END),
      keyEvent(ZR_KEY_LEFT, ZR_MOD_CTRL),
      keyEvent(ZR_KEY_RIGHT, ZR_MOD_CTRL),
    ];
    for (const ev of events) {
      assert.deepEqual(edit(ev, { value: "", cursor: 0 }), noAction("", 0));
    }
  });

  test("inserting at position 0 moves cursor to 1", () => {
    assert.deepEqual(edit(textEvent(120), { value: "", cursor: 0 }), {
      nextValue: "x",
      nextCursor: 1,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "x", cursor: 1 },
    });
  });
});
