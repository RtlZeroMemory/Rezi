/**
 * packages/core/src/runtime/inputEditor.ts — Input widget text editing.
 *
 * Why: Handles text editing operations for Input widgets, including cursor
 * movement, character insertion, deletion, and paste handling. Uses grapheme
 * cluster boundaries for correct cursor positioning with complex Unicode.
 *
 * Editing operations:
 *   - Left/Right: move cursor by grapheme cluster
 *   - Ctrl+Left/Right: move cursor by word boundary
 *   - Home/End: move cursor to start/end
 *   - Shift + movement: extend selection
 *   - Ctrl+A: select all
 *   - Backspace: delete grapheme cluster before cursor
 *   - Delete: delete grapheme cluster after cursor
 *   - Text event: insert Unicode scalar at cursor
 *   - Paste event: insert UTF-8 text (CR/LF stripped)
 *
 * @see docs/widgets/input.md
 */

import type { ZrevEvent } from "../events.js";
import { GCB, gcbClass, isExtendedPictographic } from "../layout/unicode/props.js";

/* --- Key Codes (locked by engine ABI) --- */
/* See: docs/protocol/abi.md */
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;
const ZR_KEY_HOME = 12;
const ZR_KEY_END = 13;
const ZR_KEY_A = 65;
const ZR_KEY_BACKSPACE = 4;
const ZR_KEY_DELETE = 11;
const ZR_MOD_SHIFT = 1 << 0;
const ZR_MOD_CTRL = 1 << 1;

type DecodeOne = Readonly<{ scalar: number; size: 1 | 2 }>;

function decodeUtf16One(text: string, off: number): DecodeOne {
  const a = text.charCodeAt(off);
  if (!Number.isFinite(a)) {
    // Unreachable under a well-typed caller, but keep total behavior deterministic.
    return { scalar: 0xfffd, size: 1 };
  }

  // High surrogate
  if (a >= 0xd800 && a <= 0xdbff) {
    const b = text.charCodeAt(off + 1);
    // Valid surrogate pair
    if (b >= 0xdc00 && b <= 0xdfff) {
      const hi = a - 0xd800;
      const lo = b - 0xdc00;
      return { scalar: 0x10000 + (hi << 10) + lo, size: 2 };
    }
    // Unpaired high surrogate -> U+FFFD
    return { scalar: 0xfffd, size: 1 };
  }

  // Unpaired low surrogate -> U+FFFD
  if (a >= 0xdc00 && a <= 0xdfff) {
    return { scalar: 0xfffd, size: 1 };
  }

  return { scalar: a, size: 1 };
}

function shouldBreak(
  prevClass: number,
  prevZwjAfterEp: boolean,
  riRun: number,
  nextClass: number,
  nextIsEp: boolean,
): boolean {
  // GB3: CR x LF
  if (prevClass === GCB.CR && nextClass === GCB.LF) return false;

  // GB4/5: break around controls
  if (prevClass === GCB.CONTROL || prevClass === GCB.CR || prevClass === GCB.LF) return true;
  if (nextClass === GCB.CONTROL || nextClass === GCB.CR || nextClass === GCB.LF) return true;

  // GB6: L x (L|V|LV|LVT)
  if (
    prevClass === GCB.L &&
    (nextClass === GCB.L || nextClass === GCB.V || nextClass === GCB.LV || nextClass === GCB.LVT)
  ) {
    return false;
  }

  // GB7: (LV|V) x (V|T)
  if (
    (prevClass === GCB.LV || prevClass === GCB.V) &&
    (nextClass === GCB.V || nextClass === GCB.T)
  ) {
    return false;
  }

  // GB8: (LVT|T) x T
  if ((prevClass === GCB.LVT || prevClass === GCB.T) && nextClass === GCB.T) {
    return false;
  }

  // GB9: x Extend
  if (nextClass === GCB.EXTEND) return false;

  // GB9a: x SpacingMark
  if (nextClass === GCB.SPACINGMARK) return false;

  // GB9b: Prepend x
  if (prevClass === GCB.PREPEND) return false;

  // GB9c: x ZWJ
  if (nextClass === GCB.ZWJ) return false;

  // GB11: ... ZWJ x EP when ZWJ is preceded by EP (ignoring Extend).
  if (prevClass === GCB.ZWJ && nextIsEp && prevZwjAfterEp) return false;

  // GB12/13: Pair regional indicators.
  if (prevClass === GCB.REGIONAL_INDICATOR && nextClass === GCB.REGIONAL_INDICATOR) {
    return riRun % 2 === 0;
  }

  return true;
}

function nextClusterEnd(text: string, startOff: number): number {
  if (startOff >= text.length) return text.length;

  const start = startOff;
  let off = startOff;

  const prevDec = decodeUtf16One(text, off);
  off += prevDec.size;

  let prevClass = gcbClass(prevDec.scalar);
  const prevIsEp = isExtendedPictographic(prevDec.scalar);

  let riRun = prevClass === GCB.REGIONAL_INDICATOR ? 1 : 0;

  // GB11 state tracking: ExtPict Extend* ZWJ x ExtPict
  let lastNonExtendIsEp = prevClass !== GCB.EXTEND ? prevIsEp : false;
  let prevZwjAfterEp = prevClass === GCB.ZWJ ? lastNonExtendIsEp : false;

  while (off < text.length) {
    const nextOff = off;
    const nextDec = decodeUtf16One(text, nextOff);
    const nextClass = gcbClass(nextDec.scalar);
    const nextIsEp = isExtendedPictographic(nextDec.scalar);

    if (shouldBreak(prevClass, prevZwjAfterEp, riRun, nextClass, nextIsEp)) {
      break;
    }

    off += nextDec.size;

    if (nextClass === GCB.REGIONAL_INDICATOR) riRun++;
    else riRun = 0;

    prevZwjAfterEp = false;
    if (nextClass === GCB.ZWJ) prevZwjAfterEp = lastNonExtendIsEp;
    if (nextClass !== GCB.EXTEND) lastNonExtendIsEp = nextIsEp;

    prevClass = nextClass;
  }

  // Defensive progress guard: if decode returned 0-sized, force progress deterministically.
  if (off === start) return start + 1;
  return off;
}

function prevBoundary(value: string, cursor: number): number {
  if (cursor <= 0) return 0;
  let off = 0;
  let last = 0;
  while (off < value.length) {
    const end = nextClusterEnd(value, off);
    if (end >= cursor) return last;
    last = end;
    off = end;
  }
  return last;
}

function nextBoundary(value: string, cursor: number): number {
  if (cursor >= value.length) return value.length;
  let off = 0;
  while (off < value.length) {
    const end = nextClusterEnd(value, off);
    if (end > cursor) return end;
    off = end;
  }
  return value.length;
}

function clampInputCursor(value: string, cursor: number): number {
  let c = cursor;
  if (!Number.isFinite(c)) c = 0;
  if (c < 0) c = 0;
  if (c > value.length) c = value.length;
  return c;
}

/**
 * Normalize cursor position to a valid grapheme cluster boundary.
 * Clamps to [0, value.length] and snaps to the previous boundary.
 */
export function normalizeInputCursor(value: string, cursor: number): number {
  const c = clampInputCursor(value, cursor);
  if (c === 0 || c === value.length) return c;

  let off = 0;
  let last = 0;
  while (off < value.length) {
    const end = nextClusterEnd(value, off);
    if (end === c) return c;
    if (end > c) return last;
    last = end;
    off = end;
  }
  return value.length;
}

function normalizeInputCursorForward(value: string, cursor: number): number {
  const c = clampInputCursor(value, cursor);
  if (c === 0 || c === value.length) return c;

  let off = 0;
  while (off < value.length) {
    const end = nextClusterEnd(value, off);
    if (end >= c) return end;
    off = end;
  }
  return value.length;
}

export type InputSelection = Readonly<{ start: number; end: number }>;

export function normalizeInputSelection(
  value: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined,
): InputSelection | null {
  if (selectionStart === null || selectionStart === undefined) return null;
  if (selectionEnd === null || selectionEnd === undefined) return null;
  const start = normalizeInputCursor(value, selectionStart);
  const end = normalizeInputCursor(value, selectionEnd);
  if (start === end) return null;
  return Object.freeze({ start, end });
}

function asUnicodeScalarString(codepoint: number): string {
  if (!Number.isFinite(codepoint)) return "\ufffd";
  const cp = Math.trunc(codepoint);
  if (cp < 0 || cp > 0x10ffff) return "\ufffd";
  if (cp >= 0xd800 && cp <= 0xdfff) return "\ufffd";
  return String.fromCodePoint(cp);
}

function removeCrLf(s: string): string {
  if (s.length === 0) return s;
  let firstBreak = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 0x0a || ch === 0x0d) {
      firstBreak = i;
      break;
    }
  }
  if (firstBreak < 0) return s;

  // Single-pass removal for determinism and to avoid regex engine variability.
  const out: string[] = [];
  for (let i = 0; i < firstBreak; i++) out.push(s[i] ?? "");
  for (let i = firstBreak; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 0x0a || ch === 0x0d) continue;
    out.push(s[i] ?? "");
  }
  return out.join("");
}

type WordClass = "word" | "space" | "other";

const WORD_CLUSTER_RE = /[\p{L}\p{N}_]/u;
const SPACE_CLUSTER_RE = /\s/u;

function classifyCluster(cluster: string): WordClass {
  if (cluster.length === 0) return "other";
  const d = decodeUtf16One(cluster, 0);
  const first = String.fromCodePoint(d.scalar);
  if (WORD_CLUSTER_RE.test(first)) return "word";
  if (SPACE_CLUSTER_RE.test(first)) return "space";
  return "other";
}

function nextWordBoundary(value: string, cursor: number): number {
  if (cursor >= value.length) return value.length;
  let off = cursor;
  let end = nextClusterEnd(value, off);
  let cls = classifyCluster(value.slice(off, end));

  if (cls === "word") {
    off = end;
    while (off < value.length) {
      end = nextClusterEnd(value, off);
      cls = classifyCluster(value.slice(off, end));
      if (cls !== "word") break;
      off = end;
    }
    return off;
  }

  // Skip separators to the next word start.
  while (off < value.length) {
    off = end;
    if (off >= value.length) return value.length;
    end = nextClusterEnd(value, off);
    cls = classifyCluster(value.slice(off, end));
    if (cls === "word") break;
  }

  // Then consume the next word.
  while (off < value.length) {
    end = nextClusterEnd(value, off);
    cls = classifyCluster(value.slice(off, end));
    if (cls !== "word") break;
    off = end;
  }
  return off;
}

function prevWordBoundary(value: string, cursor: number): number {
  if (cursor <= 0) return 0;
  let position = cursor;

  while (position > 0) {
    const start = prevBoundary(value, position);
    const cls = classifyCluster(value.slice(start, position));
    if (cls === "word") break;
    position = start;
  }

  if (position <= 0) return 0;

  while (position > 0) {
    const start = prevBoundary(value, position);
    const cls = classifyCluster(value.slice(start, position));
    if (cls !== "word") break;
    position = start;
  }

  return position;
}

function normalizeSelectionRange(selection: InputSelection): readonly [number, number] {
  return selection.start <= selection.end
    ? [selection.start, selection.end]
    : [selection.end, selection.start];
}

function resolveSelectionAnchor(selection: InputSelection, cursor: number): number {
  if (cursor === selection.start) return selection.end;
  if (cursor === selection.end) return selection.start;
  return selection.start;
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });

/** Action emitted when input value changes. */
export type InputEditAction = Readonly<{
  id: string;
  action: "input";
  value: string;
  cursor: number;
}>;

/** Result of applying an edit event to an input. */
export type InputEditResult = Readonly<{
  nextValue: string;
  nextCursor: number;
  nextSelectionStart: number | null;
  nextSelectionEnd: number | null;
  action?: InputEditAction;
}>;

/**
 * Apply a key/text/paste event to an input widget.
 *
 * @param event - Engine event to apply
 * @param ctx - Current input state (id, value, cursor, optional selection)
 * @returns Edit result with new value/cursor/selection and optional action, or null if event not applicable
 */
export function applyInputEditEvent(
  event: ZrevEvent,
  ctx: Readonly<{
    id: string;
    value: string;
    cursor: number;
    selectionStart?: number | null;
    selectionEnd?: number | null;
  }>,
): InputEditResult | null {
  const id = ctx.id;
  const value = ctx.value;
  const selection0 = normalizeInputSelection(value, ctx.selectionStart, ctx.selectionEnd);
  const cursorBase = normalizeInputCursor(value, ctx.cursor);
  const cursor0 = cursorBase;
  const [selectionMin, selectionMax] = selection0
    ? normalizeSelectionRange(selection0)
    : [cursor0, cursor0];

  function result(
    nextValue: string,
    nextCursor: number,
    nextSelectionStart: number | null,
    nextSelectionEnd: number | null,
  ): InputEditResult {
    if (nextValue !== value) {
      const action: InputEditAction = Object.freeze({
        id,
        action: "input",
        value: nextValue,
        cursor: nextCursor,
      });
      return Object.freeze({ nextValue, nextCursor, nextSelectionStart, nextSelectionEnd, action });
    }
    return Object.freeze({ nextValue, nextCursor, nextSelectionStart, nextSelectionEnd });
  }

  if (event.kind === "key") {
    if (event.action !== "down" && event.action !== "repeat") return null;
    const hasShift = (event.mods & ZR_MOD_SHIFT) !== 0;
    const hasCtrl = (event.mods & ZR_MOD_CTRL) !== 0;

    if (event.key === ZR_KEY_A && hasCtrl && !hasShift) {
      if (value.length === 0)
        return Object.freeze({
          nextValue: value,
          nextCursor: 0,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      return Object.freeze({
        nextValue: value,
        nextCursor: value.length,
        nextSelectionStart: 0,
        nextSelectionEnd: value.length,
      });
    }

    if (
      event.key === ZR_KEY_LEFT ||
      event.key === ZR_KEY_RIGHT ||
      event.key === ZR_KEY_HOME ||
      event.key === ZR_KEY_END
    ) {
      if (hasShift) {
        const anchor = selection0 ? resolveSelectionAnchor(selection0, cursor0) : cursor0;
        const active = cursor0;
        let moved = active;
        if (event.key === ZR_KEY_LEFT) {
          moved = hasCtrl ? prevWordBoundary(value, active) : prevBoundary(value, active);
        } else if (event.key === ZR_KEY_RIGHT) {
          moved = hasCtrl ? nextWordBoundary(value, active) : nextBoundary(value, active);
        } else if (event.key === ZR_KEY_HOME) {
          moved = 0;
        } else {
          moved = value.length;
        }
        if (moved === anchor) {
          return Object.freeze({
            nextValue: value,
            nextCursor: moved,
            nextSelectionStart: null,
            nextSelectionEnd: null,
          });
        }
        return Object.freeze({
          nextValue: value,
          nextCursor: moved,
          nextSelectionStart: anchor,
          nextSelectionEnd: moved,
        });
      }

      if (selection0) {
        const collapsed =
          event.key === ZR_KEY_LEFT || event.key === ZR_KEY_HOME ? selectionMin : selectionMax;
        return Object.freeze({
          nextValue: value,
          nextCursor: collapsed,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      }

      if (event.key === ZR_KEY_LEFT) {
        const nextCursor = hasCtrl
          ? prevWordBoundary(value, cursor0)
          : prevBoundary(value, cursor0);
        return Object.freeze({
          nextValue: value,
          nextCursor,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      }
      if (event.key === ZR_KEY_RIGHT) {
        const nextCursor = hasCtrl
          ? nextWordBoundary(value, cursor0)
          : nextBoundary(value, cursor0);
        return Object.freeze({
          nextValue: value,
          nextCursor,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      }
      if (event.key === ZR_KEY_HOME) {
        return Object.freeze({
          nextValue: value,
          nextCursor: 0,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      }
      return Object.freeze({
        nextValue: value,
        nextCursor: value.length,
        nextSelectionStart: null,
        nextSelectionEnd: null,
      });
    }

    if (event.key === ZR_KEY_BACKSPACE) {
      if (selection0) {
        const nextValue = value.slice(0, selectionMin) + value.slice(selectionMax);
        const nextCursor = normalizeInputCursor(nextValue, selectionMin);
        return result(nextValue, nextCursor, null, null);
      }
      if (cursor0 === 0) {
        return Object.freeze({
          nextValue: value,
          nextCursor: cursor0,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      }
      const start = prevBoundary(value, cursor0);
      const nextValue = value.slice(0, start) + value.slice(cursor0);
      const nextCursor = normalizeInputCursor(nextValue, start);
      return result(nextValue, nextCursor, null, null);
    }

    if (event.key === ZR_KEY_DELETE) {
      if (selection0) {
        const nextValue = value.slice(0, selectionMin) + value.slice(selectionMax);
        const nextCursor = normalizeInputCursor(nextValue, selectionMin);
        return result(nextValue, nextCursor, null, null);
      }
      if (cursor0 === value.length) {
        return Object.freeze({
          nextValue: value,
          nextCursor: cursor0,
          nextSelectionStart: null,
          nextSelectionEnd: null,
        });
      }
      const end = nextBoundary(value, cursor0);
      const nextValue = value.slice(0, cursor0) + value.slice(end);
      const nextCursor = normalizeInputCursor(nextValue, cursor0);
      return result(nextValue, nextCursor, null, null);
    }

    // ENTER/TAB and all other keys do not edit.
    return null;
  }

  if (event.kind === "text") {
    const s = asUnicodeScalarString(event.codepoint);
    const ch = s.charCodeAt(0);
    if (ch === 0x0a || ch === 0x0d) return null;

    const start = selection0 ? selectionMin : cursor0;
    const end = selection0 ? selectionMax : cursor0;
    const nextValue = value.slice(0, start) + s + value.slice(end);
    const nextCursor = normalizeInputCursorForward(nextValue, start + s.length);
    return result(nextValue, nextCursor, null, null);
  }

  if (event.kind === "paste") {
    const decoded = UTF8_DECODER.decode(event.bytes);
    const inserted = removeCrLf(decoded);
    if (inserted.length === 0) return null;

    const start = selection0 ? selectionMin : cursor0;
    const end = selection0 ? selectionMax : cursor0;
    const nextValue = value.slice(0, start) + inserted + value.slice(end);
    const nextCursor = normalizeInputCursorForward(nextValue, start + inserted.length);
    return result(nextValue, nextCursor, null, null);
  }

  return null;
}
