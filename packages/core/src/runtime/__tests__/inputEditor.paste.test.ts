import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { applyInputEditEvent } from "../inputEditor.js";

function pasteTextEvent(text: string): ZrevEvent {
  return { kind: "paste", timeMs: 0, bytes: new TextEncoder().encode(text) };
}

function pasteBytesEvent(bytes: readonly number[]): ZrevEvent {
  return { kind: "paste", timeMs: 0, bytes: Uint8Array.from(bytes) };
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

describe("input editor paste handling", () => {
  test("CRLF is stripped from pasted text", () => {
    assert.deepEqual(edit(pasteTextEvent("A\r\nB"), { value: "xy", cursor: 1 }), {
      nextValue: "xABy",
      nextCursor: 3,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "xABy", cursor: 3 },
    });
  });

  test("LF is stripped from pasted text", () => {
    assert.deepEqual(edit(pasteTextEvent("A\nB"), { value: "xy", cursor: 1 }), {
      nextValue: "xABy",
      nextCursor: 3,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "xABy", cursor: 3 },
    });
  });

  test("CR is stripped from pasted text", () => {
    assert.deepEqual(edit(pasteTextEvent("A\rB"), { value: "xy", cursor: 1 }), {
      nextValue: "xABy",
      nextCursor: 3,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "xABy", cursor: 3 },
    });
  });

  test("tab is preserved during paste", () => {
    assert.deepEqual(edit(pasteTextEvent("A\tB"), { value: "xy", cursor: 1 }), {
      nextValue: "xA\tBy",
      nextCursor: 4,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "xA\tBy", cursor: 4 },
    });
  });

  test("empty paste bytes produce no edit", () => {
    assert.equal(edit(pasteBytesEvent([]), { value: "abc", cursor: 2 }), null);
  });

  test("paste containing only line breaks produces no edit", () => {
    assert.equal(edit(pasteBytesEvent([13, 10, 10, 13]), { value: "abc", cursor: 2 }), null);
  });

  test("invalid UTF-8 bytes are replaced deterministically", () => {
    assert.deepEqual(edit(pasteBytesEvent([195, 40]), { value: "hi", cursor: 2 }), {
      nextValue: "hi\ufffd(",
      nextCursor: 4,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "hi\ufffd(", cursor: 4 },
    });
  });

  test("very long paste inserts without crashing and updates cursor", () => {
    const long = "x".repeat(12000);
    const res = edit(pasteTextEvent(long), { value: "ab", cursor: 1 });
    assert.ok(res);
    if (!res) return;
    assert.equal(res.nextValue.length, 12002);
    assert.equal(res.nextCursor, 12001);
    assert.equal(res.nextValue.startsWith("a"), true);
    assert.equal(res.nextValue.endsWith("b"), true);
  });

  test("paste at position 0 prepends text", () => {
    assert.deepEqual(edit(pasteTextEvent("X"), { value: "cat", cursor: 0 }), {
      nextValue: "Xcat",
      nextCursor: 1,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "Xcat", cursor: 1 },
    });
  });

  test("paste at end appends text", () => {
    assert.deepEqual(edit(pasteTextEvent("X"), { value: "cat", cursor: 3 }), {
      nextValue: "catX",
      nextCursor: 4,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "catX", cursor: 4 },
    });
  });

  test("paste in middle splices text correctly", () => {
    assert.deepEqual(edit(pasteTextEvent("X"), { value: "cat", cursor: 1 }), {
      nextValue: "cXat",
      nextCursor: 2,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "cXat", cursor: 2 },
    });
  });

  test("unicode paste inserts CJK + emoji + combining marks", () => {
    assert.deepEqual(edit(pasteTextEvent("你👍🏽e\u0301"), { value: "ab", cursor: 1 }), {
      nextValue: "a你👍🏽e\u0301b",
      nextCursor: 8,
      nextSelectionStart: null,
      nextSelectionEnd: null,
      action: { id: "input", action: "input", value: "a你👍🏽e\u0301b", cursor: 8 },
    });
  });

  test("paste replaces an active forward selection", () => {
    assert.deepEqual(
      edit(pasteTextEvent("there"), {
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

  test("paste replaces an active backward selection", () => {
    assert.deepEqual(
      edit(pasteTextEvent("there"), {
        value: "hello world",
        cursor: 6,
        selectionStart: 11,
        selectionEnd: 6,
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

  test("paste with only CR/LF and active selection is a no-op", () => {
    assert.equal(
      edit(pasteBytesEvent([13, 10]), {
        value: "abcdef",
        cursor: 4,
        selectionStart: 2,
        selectionEnd: 4,
      }),
      null,
    );
  });
});
