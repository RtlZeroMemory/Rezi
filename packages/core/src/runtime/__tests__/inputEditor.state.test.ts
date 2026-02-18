import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  applyInputEditEvent,
  normalizeInputCursor,
  normalizeInputSelection,
} from "../inputEditor.js";

const ZR_KEY_BACKSPACE = 4;
const ZR_KEY_DELETE = 11;
const ZR_KEY_HOME = 12;
const ZR_KEY_END = 13;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;
const ZR_MOD_SHIFT = 1 << 0;

function keyEvent(key: number, mods = 0): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods, action: "down" };
}

function textEvent(codepoint: number): ZrevEvent {
  return { kind: "text", timeMs: 0, codepoint };
}

function pasteEvent(text: string): ZrevEvent {
  return { kind: "paste", timeMs: 0, bytes: new TextEncoder().encode(text) };
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
): ReturnType<typeof applyInputEditEvent> {
  const targetId =
    ctx.focusedId === ctx.inputId && ctx.enabledById.get(ctx.focusedId) === true
      ? ctx.focusedId
      : null;
  if (targetId === null) return null;
  return applyInputEditEvent(event, { id: targetId, value: ctx.value, cursor: ctx.cursor });
}

function assertInvariants(res: NonNullable<ReturnType<typeof applyInputEditEvent>>): void {
  assert.equal(res.nextCursor >= 0, true);
  assert.equal(res.nextCursor <= res.nextValue.length, true);
  assert.equal(normalizeInputCursor(res.nextValue, res.nextCursor), res.nextCursor);

  const normalized = normalizeInputSelection(
    res.nextValue,
    res.nextSelectionStart,
    res.nextSelectionEnd,
  );
  if (res.nextSelectionStart === null || res.nextSelectionEnd === null) {
    assert.equal(normalized, null);
  } else {
    assert.ok(normalized);
    if (!normalized) return;
    assert.equal(normalized.start, res.nextSelectionStart);
    assert.equal(normalized.end, res.nextSelectionEnd);
  }

  if (res.action) {
    assert.equal(res.action.value, res.nextValue);
    assert.equal(res.action.cursor, res.nextCursor);
  }
}

describe("input editor state consistency", () => {
  test("rapid insert sequence keeps cursor and boundaries valid", () => {
    let value = "";
    let cursor = 0;
    for (let i = 0; i < 64; i++) {
      const ch = 97 + (i % 26);
      const res = applyInputEditEvent(textEvent(ch), { id: "input", value, cursor });
      assert.ok(res);
      if (!res) return;
      assertInvariants(res);
      value = res.nextValue;
      cursor = res.nextCursor;
    }
    assert.equal(value.length, 64);
    assert.equal(cursor, 64);
  });

  test("mixed edit sequence maintains invariants step-by-step", () => {
    const events = [
      textEvent(120),
      textEvent(121),
      pasteEvent("A\r\nB👍"),
      keyEvent(ZR_KEY_LEFT),
      keyEvent(ZR_KEY_BACKSPACE),
      keyEvent(ZR_KEY_RIGHT),
      keyEvent(ZR_KEY_DELETE),
      keyEvent(ZR_KEY_HOME),
      keyEvent(ZR_KEY_END),
    ] as const;
    let value = "a\u0301b";
    let cursor = value.length;
    for (const event of events) {
      const res = applyInputEditEvent(event, { id: "input", value, cursor });
      assert.ok(res);
      if (!res) return;
      assertInvariants(res);
      value = res.nextValue;
      cursor = res.nextCursor;
    }
  });

  test("cursor is clamped when incoming cursor is out of range", () => {
    const res = applyInputEditEvent(keyEvent(ZR_KEY_BACKSPACE), {
      id: "input",
      value: "abc",
      cursor: 999,
    });
    assert.deepEqual(res, {
      nextValue: "ab",
      nextCursor: 2,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "ab", cursor: 2 },
    });
  });

  test("incoming selection is normalized to grapheme boundaries", () => {
    const res = applyInputEditEvent(keyEvent(ZR_KEY_DELETE), {
      id: "input",
      value: "a👍🏽b",
      cursor: 3,
      selectionStart: 2,
      selectionEnd: 5,
    });
    assert.deepEqual(res, {
      nextValue: "ab",
      nextCursor: 1,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "ab", cursor: 1 },
    });
  });

  test("movement saturation remains deterministic at string boundaries", () => {
    let cursor = 0;
    const value = "a\u0301🙂";
    for (let i = 0; i < 5; i++) {
      const res = applyInputEditEvent(keyEvent(ZR_KEY_LEFT), { id: "input", value, cursor });
      assert.ok(res);
      if (!res) return;
      assert.equal(res.nextCursor, 0);
      cursor = res.nextCursor;
    }
    cursor = value.length;
    for (let i = 0; i < 5; i++) {
      const res = applyInputEditEvent(keyEvent(ZR_KEY_RIGHT), { id: "input", value, cursor });
      assert.ok(res);
      if (!res) return;
      assert.equal(res.nextCursor, value.length);
      cursor = res.nextCursor;
    }
  });

  test("shift-selection movement keeps valid selection state", () => {
    const res = applyInputEditEvent(keyEvent(ZR_KEY_RIGHT, ZR_MOD_SHIFT), {
      id: "input",
      value: "你好",
      cursor: 0,
    });
    assert.deepEqual(res, {
      nextValue: "你好",
      nextCursor: 1,
      nextSelectionStart: 0,
      nextSelectionEnd: 1,
    });
  });

  test("type-to-replace clears selection and keeps cursor valid", () => {
    const res = applyInputEditEvent(textEvent(90), {
      id: "input",
      value: "hello",
      cursor: 5,
      selectionStart: 1,
      selectionEnd: 4,
    });
    assert.deepEqual(res, {
      nextValue: "hZo",
      nextCursor: 2,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "hZo", cursor: 2 },
    });
  });

  test("selection collapse via non-shift movement is deterministic", () => {
    const res = applyInputEditEvent(keyEvent(ZR_KEY_HOME), {
      id: "input",
      value: "hello",
      cursor: 4,
      selectionStart: 1,
      selectionEnd: 4,
    });
    assert.deepEqual(res, {
      nextValue: "hello",
      nextCursor: 1,
      nextSelectionStart: null,
      nextSelectionEnd: null,
    });
  });

  test("backspace and delete on empty string remain stable", () => {
    assert.deepEqual(
      applyInputEditEvent(keyEvent(ZR_KEY_BACKSPACE), { id: "input", value: "", cursor: 0 }),
      {
        nextValue: "",
        nextCursor: 0,
        nextSelectionStart: null,
        nextSelectionEnd: null,
      },
    );
    assert.deepEqual(
      applyInputEditEvent(keyEvent(ZR_KEY_DELETE), { id: "input", value: "", cursor: 0 }),
      {
        nextValue: "",
        nextCursor: 0,
        nextSelectionStart: null,
        nextSelectionEnd: null,
      },
    );
  });

  test("unhandled key up events still return null", () => {
    const upEvent: ZrevEvent = { kind: "key", timeMs: 0, key: ZR_KEY_LEFT, mods: 0, action: "up" };
    assert.equal(applyInputEditEvent(upEvent, { id: "input", value: "abc", cursor: 1 }), null);
  });

  test("disabled or unfocused inputs are ignored by routing", () => {
    const ev = textEvent(120);
    const enabledById = new Map<string, boolean>([["input", true]]);
    assert.equal(
      routeInputWithFocus(ev, {
        inputId: "input",
        focusedId: "other",
        enabledById,
        value: "",
        cursor: 0,
      }),
      null,
    );
    assert.equal(
      routeInputWithFocus(ev, {
        inputId: "input",
        focusedId: "input",
        enabledById: new Map([["input", false]]),
        value: "",
        cursor: 0,
      }),
      null,
    );
  });
});
