import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import { applyInputEditEvent, normalizeInputCursor } from "../inputEditor.js";

const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;
const ZR_KEY_BACKSPACE = 4;
const ZR_KEY_DELETE = 11;

function keyEvent(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function textEvent(codepoint: number): ZrevEvent {
  return { kind: "text", timeMs: 0, codepoint };
}

function pasteEvent(text: string): ZrevEvent {
  return { kind: "paste", timeMs: 0, bytes: new TextEncoder().encode(text) };
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

describe("input editor unicode correctness", () => {
  test("combining mark movement treats e + acute as one grapheme", () => {
    const value = "e\u0301";
    assert.deepEqual(edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 0 }), noAction(value, 2));
    assert.deepEqual(edit(keyEvent(ZR_KEY_LEFT), { value, cursor: 2 }), noAction(value, 0));
  });

  test("family emoji movement treats ZWJ sequence as one grapheme", () => {
    const value = "👨‍👩‍👧‍👦";
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 0 }),
      noAction(value, value.length),
    );
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT), { value, cursor: value.length }),
      noAction(value, 0),
    );
  });

  test("flag emoji movement treats regional-indicator pair as one grapheme", () => {
    const value = "🇺🇸";
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 0 }),
      noAction(value, value.length),
    );
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT), { value, cursor: value.length }),
      noAction(value, 0),
    );
  });

  test("emoji with skin tone modifier is one grapheme", () => {
    const value = "👍🏽";
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 0 }),
      noAction(value, value.length),
    );
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT), { value, cursor: value.length }),
      noAction(value, 0),
    );
  });

  test("Tamil base + vowel sign stays one grapheme", () => {
    const value = "நி";
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 0 }),
      noAction(value, value.length),
    );
    assert.deepEqual(
      edit(keyEvent(ZR_KEY_LEFT), { value, cursor: value.length }),
      noAction(value, 0),
    );
  });

  test("backspace deletes entire emoji + skin tone grapheme", () => {
    const value = "hello👍🏽";
    assert.deepEqual(edit(keyEvent(ZR_KEY_BACKSPACE), { value, cursor: value.length }), {
      nextValue: "hello",
      nextCursor: 5,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "hello", cursor: 5 },
    });
  });

  test("delete removes full grapheme ahead of cursor", () => {
    const value = "👍🏽!";
    assert.deepEqual(edit(keyEvent(ZR_KEY_DELETE), { value, cursor: 0 }), {
      nextValue: "!",
      nextCursor: 0,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "!", cursor: 0 },
    });
  });

  test("delete removes full family emoji ahead of cursor", () => {
    const value = "👨‍👩‍👧‍👦x";
    assert.deepEqual(edit(keyEvent(ZR_KEY_DELETE), { value, cursor: 0 }), {
      nextValue: "x",
      nextCursor: 0,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "x", cursor: 0 },
    });
  });

  test("inserting before emoji cluster does not split the cluster", () => {
    const value = "a👍🏽b";
    const res = edit(textEvent(90), { value, cursor: 1 }); // Z
    assert.deepEqual(res, {
      nextValue: "aZ👍🏽b",
      nextCursor: 2,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "aZ👍🏽b", cursor: 2 },
    });
  });

  test("inserting after emoji cluster keeps boundaries valid", () => {
    const value = "a👍🏽b";
    const res = edit(textEvent(88), { value, cursor: 5 }); // X
    assert.deepEqual(res, {
      nextValue: "a👍🏽Xb",
      nextCursor: 6,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "a👍🏽Xb", cursor: 6 },
    });
  });

  test("unicode paste with CJK, combining marks, and emoji inserts correctly", () => {
    const value = "ab";
    const res = edit(pasteEvent("你e\u0301👍🏽\r\n好"), { value, cursor: 1 });
    assert.deepEqual(res, {
      nextValue: "a你e\u0301👍🏽好b",
      nextCursor: 9,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "a你e\u0301👍🏽好b", cursor: 9 },
    });
  });

  test("CJK display width remains double-cell while cursor moves by grapheme", () => {
    const value = "你好世界";
    assert.equal(measureTextCells(value), 8);
    assert.deepEqual(edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 0 }), noAction(value, 1));
    assert.deepEqual(edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 1 }), noAction(value, 2));
    assert.deepEqual(edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 2 }), noAction(value, 3));
    assert.deepEqual(edit(keyEvent(ZR_KEY_RIGHT), { value, cursor: 3 }), noAction(value, 4));
  });

  test("mixed-script right traversal follows grapheme boundaries", () => {
    const value = "Hello世界🌍";
    let cursor = 0;
    const expected = [1, 2, 3, 4, 5, 6, 7, 9];
    for (const nextCursor of expected) {
      const res = edit(keyEvent(ZR_KEY_RIGHT), { value, cursor });
      assert.ok(res);
      if (!res) return;
      assert.equal(res.nextCursor, nextCursor);
      cursor = res.nextCursor;
    }
  });

  test("mixed-script left traversal follows grapheme boundaries", () => {
    const value = "Hello世界🌍";
    let cursor = value.length;
    const expected = [7, 6, 5, 4, 3, 2, 1, 0];
    for (const nextCursor of expected) {
      const res = edit(keyEvent(ZR_KEY_LEFT), { value, cursor });
      assert.ok(res);
      if (!res) return;
      assert.equal(res.nextCursor, nextCursor);
      cursor = res.nextCursor;
    }
  });

  test("normalizeInputCursor clamps negative cursor", () => {
    assert.equal(normalizeInputCursor("abc", -7), 0);
  });

  test("normalizeInputCursor clamps cursor past end", () => {
    assert.equal(normalizeInputCursor("abc", 99), 3);
  });

  test("normalizeInputCursor snaps inside combining sequence to left boundary", () => {
    assert.equal(normalizeInputCursor("e\u0301", 1), 0);
  });

  test("normalizeInputCursor snaps inside family emoji to left boundary", () => {
    assert.equal(normalizeInputCursor("👨‍👩‍👧‍👦", 4), 0);
  });

  test("normalizeInputCursor snaps inside flag emoji to left boundary", () => {
    assert.equal(normalizeInputCursor("🇺🇸", 2), 0);
  });

  test("text event maps out-of-range codepoint to replacement character", () => {
    const res = edit(textEvent(0x110000), { value: "", cursor: 0 });
    assert.deepEqual(res, {
      nextValue: "\ufffd",
      nextCursor: 1,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "\ufffd", cursor: 1 },
    });
  });

  test("text event maps surrogate codepoint to replacement character", () => {
    const res = edit(textEvent(0xd800), { value: "", cursor: 0 });
    assert.deepEqual(res, {
      nextValue: "\ufffd",
      nextCursor: 1,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "\ufffd", cursor: 1 },
    });
  });

  test("text newline is ignored for single-line input", () => {
    assert.equal(edit(textEvent(0x0a), { value: "x", cursor: 1 }), null);
  });
});
