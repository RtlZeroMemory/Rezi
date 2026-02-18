import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { applyInputEditEvent } from "../inputEditor.js";

const ZR_KEY_BACKSPACE = 4;
const ZR_KEY_DELETE = 11;
const ZR_KEY_HOME = 12;
const ZR_KEY_END = 13;
const ZR_KEY_A = 65;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;

const ZR_MOD_SHIFT = 1 << 0;
const ZR_MOD_CTRL = 1 << 1;

function keyEvent(key: number, mods = 0): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods, action: "down" };
}

function textEvent(codepoint: number): ZrevEvent {
  return { kind: "text", timeMs: 0, codepoint };
}

function pasteEvent(text: string): ZrevEvent {
  return { kind: "paste", timeMs: 0, bytes: new TextEncoder().encode(text) };
}

function edit(
  event: ZrevEvent,
  ctx: Readonly<{
    value: string;
    cursor: number;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  }>,
): ReturnType<typeof applyInputEditEvent> {
  const args: {
    id: string;
    value: string;
    cursor: number;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  } = { id: "input", value: ctx.value, cursor: ctx.cursor };
  if (ctx.selectionStart !== undefined) args.selectionStart = ctx.selectionStart;
  if (ctx.selectionEnd !== undefined) args.selectionEnd = ctx.selectionEnd;
  return applyInputEditEvent(event, args);
}

function state(
  value: string,
  cursor: number,
  selectionStart: number | null,
  selectionEnd: number | null,
) {
  return {
    nextValue: value,
    nextCursor: cursor,
    nextSelectionStart: selectionStart,
    nextSelectionEnd: selectionEnd,
  };
}

describe("input editor selection", () => {
  test("shift+right starts selection from cursor", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT), { value: "a👍🏽b", cursor: 0 }),
      state("a👍🏽b", 1, 0, 1),
    );
  });

  test("shift+right extends by grapheme clusters", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT), {
        value: "a👍🏽b",
        cursor: 1,
        selectionStart: 0,
        selectionEnd: 1,
      }),
      state("a👍🏽b", 5, 0, 5),
    );
  });

  test("shift+left shrinks an existing forward selection", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_SHIFT), {
        value: "a👍🏽b",
        cursor: 5,
        selectionStart: 0,
        selectionEnd: 5,
      }),
      state("a👍🏽b", 1, 0, 1),
    );
  });

  test("shift+left can create backward selection", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_SHIFT), { value: "a👍🏽b", cursor: 5 }),
      state("a👍🏽b", 1, 5, 1),
    );
  });

  test("shift+left continues extending when selection is already backward", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_SHIFT), {
        value: "a👍🏽b",
        cursor: 1,
        selectionStart: 5,
        selectionEnd: 1,
      }),
      state("a👍🏽b", 0, 5, 0),
    );
  });

  test("shift+home extends selection to start", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_HOME, ZR_MOD_SHIFT), { value: "a👍🏽b", cursor: 5 }),
      state("a👍🏽b", 0, 5, 0),
    );
  });

  test("shift+end extends selection to end", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_END, ZR_MOD_SHIFT), { value: "a👍🏽b", cursor: 1 }),
      state("a👍🏽b", 6, 1, 6),
    );
  });

  test("shift+ctrl+right extends to end of next word", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT | ZR_MOD_CTRL), { value: "hello world", cursor: 0 }),
      state("hello world", 5, 0, 5),
    );
  });

  test("shift+ctrl+right can extend again to following word end", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT | ZR_MOD_CTRL), {
        value: "hello world",
        cursor: 5,
        selectionStart: 0,
        selectionEnd: 5,
      }),
      state("hello world", 11, 0, 11),
    );
  });

  test("shift+ctrl+left extends backward to previous word start", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_SHIFT | ZR_MOD_CTRL), { value: "hello world", cursor: 11 }),
      state("hello world", 6, 11, 6),
    );
  });

  test("ctrl+a selects entire text", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_A, ZR_MOD_CTRL), { value: "hello world", cursor: 3 }),
      state("hello world", 11, 0, 11),
    );
  });

  test("ctrl+a on empty text keeps collapsed cursor", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_A, ZR_MOD_CTRL), { value: "", cursor: 0 }),
      state("", 0, null, null),
    );
  });

  test("left with active selection collapses to selection start", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT), {
        value: "hello world",
        cursor: 11,
        selectionStart: 0,
        selectionEnd: 11,
      }),
      state("hello world", 0, null, null),
    );
  });

  test("right with backward selection collapses to selection end", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT), {
        value: "hello world",
        cursor: 0,
        selectionStart: 11,
        selectionEnd: 0,
      }),
      state("hello world", 11, null, null),
    );
  });

  test("home with active selection collapses to min edge", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_HOME), {
        value: "hello world",
        cursor: 9,
        selectionStart: 2,
        selectionEnd: 9,
      }),
      state("hello world", 2, null, null),
    );
  });

  test("end with active selection collapses to max edge", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_END), {
        value: "hello world",
        cursor: 2,
        selectionStart: 9,
        selectionEnd: 2,
      }),
      state("hello world", 9, null, null),
    );
  });

  test("typing with selection replaces selected text", () => {
    assert.deepEqual(
      edit(textEvent(88), {
        value: "hello world",
        cursor: 11,
        selectionStart: 6,
        selectionEnd: 11,
      }),
      {
        nextValue: "hello X",
        nextCursor: 7,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "hello X", cursor: 7 },
      },
    );
  });

  test("typing with backward selection also replaces selected text", () => {
    assert.deepEqual(
      edit(textEvent(88), { value: "hello world", cursor: 6, selectionStart: 11, selectionEnd: 6 }),
      {
        nextValue: "hello X",
        nextCursor: 7,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "hello X", cursor: 7 },
      },
    );
  });

  test("backspace with active selection deletes selected range", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_BACKSPACE), {
        value: "hello world",
        cursor: 11,
        selectionStart: 6,
        selectionEnd: 11,
      }),
      {
        nextValue: "hello ",
        nextCursor: 6,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "hello ", cursor: 6 },
      },
    );
  });

  test("delete with backward selection deletes selected range", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_DELETE), {
        value: "hello world",
        cursor: 6,
        selectionStart: 11,
        selectionEnd: 6,
      }),
      {
        nextValue: "hello ",
        nextCursor: 6,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "hello ", cursor: 6 },
      },
    );
  });

  test("paste with selection replaces selected text", () => {
    assert.deepEqual(
      edit(pasteEvent("there"), {
        value: "hello world",
        cursor: 11,
        selectionStart: 6,
        selectionEnd: 11,
      }),
      {
        nextValue: "hello there",
        nextCursor: 11,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "hello there", cursor: 11 },
      },
    );
  });

  test("ctrl+a then typing replaces the entire text", () => {
    assert.deepEqual(
      edit(textEvent(90), { value: "abc", cursor: 3, selectionStart: 0, selectionEnd: 3 }),
      {
        nextValue: "Z",
        nextCursor: 1,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "Z", cursor: 1 },
      },
    );
  });

  test("ctrl+a then backspace clears the text", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_BACKSPACE), {
        value: "abc",
        cursor: 3,
        selectionStart: 0,
        selectionEnd: 3,
      }),
      {
        nextValue: "",
        nextCursor: 0,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "", cursor: 0 },
      },
    );
  });

  test("selection across emoji grapheme boundaries selects whole cluster", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT), { value: "a👍🏽b", cursor: 1 }),
      state("a👍🏽b", 5, 1, 5),
    );
  });

  test("deleting grapheme-range selection removes whole cluster", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_DELETE), {
        value: "a👍🏽b",
        cursor: 5,
        selectionStart: 1,
        selectionEnd: 5,
      }),
      {
        nextValue: "ab",
        nextCursor: 1,
        nextSelectionStart: null,
        nextSelectionEnd: null,
        action: { id: "input", action: "input", value: "ab", cursor: 1 },
      },
    );
  });

  test("selection with CJK still moves by grapheme, not display width", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT), { value: "你好", cursor: 0 }),
      state("你好", 1, 0, 1),
    );
  });

  test("backward CJK selection order is preserved", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT, ZR_MOD_SHIFT), { value: "你好", cursor: 2 }),
      state("你好", 1, 2, 1),
    );
  });

  test("extending back to anchor collapses selection", () => {
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT), {
        value: "abc",
        cursor: 1,
        selectionStart: 2,
        selectionEnd: 1,
      }),
      state("abc", 2, null, null),
    );
  });
});
