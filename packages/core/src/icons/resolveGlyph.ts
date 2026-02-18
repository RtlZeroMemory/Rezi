/**
 * packages/core/src/icons/resolveGlyph.ts — Deterministic icon glyph resolution.
 *
 * Why: Keeps icon rendering/layout stable by selecting a width-safe glyph
 * (prefer Unicode when stable, otherwise fallback) and returning its measured
 * cell width.
 */

import { measureTextCells } from "../layout/textMeasure.js";
import { isEmoji } from "../layout/unicode/props.js";
import { resolveIcon } from "./registry.js";

export type ResolvedIconGlyph = Readonly<{
  glyph: string;
  width: number;
  source: "primary" | "fallback" | "path";
}>;

const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const RI_START = 0x1f1e6;
const RI_END = 0x1f1ff;

function glyphWidth(text: string): number {
  return Math.max(0, measureTextCells(text));
}

function isRiskyCodepoint(cp: number): boolean {
  if (cp > 0xffff) return true;
  if (cp === ZWJ || cp === VS15 || cp === VS16) return true;
  if (cp >= RI_START && cp <= RI_END) return true;
  if (isEmoji(cp)) return true;
  return false;
}

/**
 * True when glyph is a single, non-emoji, 1-cell codepoint.
 *
 * Why: These glyphs are the most portable across terminals and fonts.
 */
function isDeterministicNarrowGlyph(text: string): boolean {
  if (text.length === 0) return false;
  if (glyphWidth(text) !== 1) return false;

  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) return false;
    count++;
    if (count > 1) return false;
    if (isRiskyCodepoint(cp)) return false;
  }
  return count === 1;
}

function candidate(text: string, source: ResolvedIconGlyph["source"]): ResolvedIconGlyph | null {
  if (text.length === 0) return null;
  const width = glyphWidth(text);
  if (width <= 0) return null;
  return { glyph: text, width, source };
}

/**
 * Resolve icon path to glyph + width with a stability-first policy.
 *
 * Policy:
 * - If `preferFallback=true`, try fallback first.
 * - Otherwise, try primary first.
 * - Risky primary glyphs (emoji/ambiguous sequences) automatically downgrade
 *   to fallback when available.
 */
export function resolveIconGlyph(iconPath: string, preferFallback = false): ResolvedIconGlyph {
  if (iconPath.length === 0) {
    return { glyph: "", width: 0, source: "path" };
  }

  const icon = resolveIcon(iconPath);
  if (!icon) {
    return { glyph: iconPath, width: glyphWidth(iconPath), source: "path" };
  }

  const primary = candidate(icon.char, "primary");
  const fallback = candidate(icon.fallback, "fallback");
  const primaryIsStable = primary ? isDeterministicNarrowGlyph(primary.glyph) : false;

  const ordered = preferFallback
    ? [fallback, primary]
    : !primaryIsStable && fallback
      ? [fallback, primary]
      : [primary, fallback];

  for (const picked of ordered) {
    if (picked) return picked;
  }

  return { glyph: iconPath, width: glyphWidth(iconPath), source: "path" };
}
