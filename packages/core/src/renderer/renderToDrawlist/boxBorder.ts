import type { DrawlistBuilderV1 } from "../../drawlist/types.js";
import { measureTextCells, truncateWithEllipsis } from "../../layout/textMeasure.js";
import type { Rect } from "../../layout/types.js";
import {
  type BorderGlyphSet,
  type BorderStyle,
  getBorderGlyphs,
  isBorderStyle,
} from "../boxGlyphs.js";
import { isVisibleRect } from "./indices.js";
import { clampNonNegative } from "./spacing.js";
import type { ResolvedTextStyle } from "./textStyle.js";

// Re-export BorderStyle for backwards compatibility
export type { BorderStyle } from "../boxGlyphs.js";

/**
 * Read and validate a border style value.
 * Returns "single" as default for invalid values.
 */
export function readBoxBorder(v: unknown): BorderStyle {
  if (isBorderStyle(v)) return v;
  return "single";
}

/**
 * Read and validate a title alignment value.
 */
export function readTitleAlign(v: unknown): "left" | "center" | "right" {
  if (v === "left" || v === "center" || v === "right") return v;
  return "left";
}

/**
 * Render a box border with optional title.
 *
 * @param builder - Drawlist builder
 * @param rect - Box rectangle
 * @param border - Border style
 * @param title - Optional title text
 * @param titleAlign - Title alignment ("left", "center", "right")
 * @param style - Text style for border and title
 */
export function renderBoxBorder(
  builder: DrawlistBuilderV1,
  rect: Rect,
  border: BorderStyle,
  title: string | undefined,
  titleAlign: "left" | "center" | "right",
  style: ResolvedTextStyle,
  sides?: Readonly<{ top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }>,
): void {
  if (border === "none") return;
  if (rect.w < 2 || rect.h < 2) return;
  if (!isVisibleRect(rect)) return;

  const glyphs = getBorderGlyphs(border);
  if (glyphs === null) return;

  const top = sides?.top ?? true;
  const right = sides?.right ?? true;
  const bottom = sides?.bottom ?? true;
  const left = sides?.left ?? true;

  renderBorderFrame(builder, rect, glyphs, style, { top, right, bottom, left });

  if (top && title && title.length > 0 && rect.w >= 4) {
    renderBorderTitle(builder, rect, title, titleAlign, style);
  }
}

/**
 * Render the border frame (corners and edges).
 */
function renderBorderFrame(
  builder: DrawlistBuilderV1,
  rect: Rect,
  glyphs: BorderGlyphSet,
  style: ResolvedTextStyle,
  sides: Readonly<{ top: boolean; right: boolean; bottom: boolean; left: boolean }>,
): void {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w - 1;
  const y1 = rect.y + rect.h - 1;

  const innerW = Math.max(0, rect.w - 2);

  if (sides.top) {
    // Top edge (fallback to horizontal cap when missing a vertical side).
    const leftCap = sides.left ? glyphs.TL : glyphs.H;
    const rightCap = sides.right ? glyphs.TR : glyphs.H;
    builder.drawText(x0, y0, `${leftCap}${glyphs.H.repeat(innerW)}${rightCap}`, style);
  }

  if (sides.bottom) {
    // Bottom edge (fallback to horizontal cap when missing a vertical side).
    const leftCap = sides.left ? glyphs.BL : glyphs.H;
    const rightCap = sides.right ? glyphs.BR : glyphs.H;
    builder.drawText(x0, y1, `${leftCap}${glyphs.H.repeat(innerW)}${rightCap}`, style);
  }

  const yStart = y0 + (sides.top ? 1 : 0);
  const yEnd = y1 - (sides.bottom ? 1 : 0);

  if (yStart > yEnd) return;

  // Left and right edges.
  for (let y = yStart; y <= yEnd; y++) {
    if (sides.left) builder.drawText(x0, y, glyphs.V, style);
    if (sides.right) builder.drawText(x1, y, glyphs.V, style);
  }
}

/**
 * Render the title in the top border.
 */
function renderBorderTitle(
  builder: DrawlistBuilderV1,
  rect: Rect,
  title: string,
  titleAlign: "left" | "center" | "right",
  style: ResolvedTextStyle,
): void {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w - 1;

  const availableWidth = rect.w - 4; // Leave space for corners and padding
  if (availableWidth <= 0) return;

  const titleWidth = measureTextCells(title);
  const clippedTitle =
    titleWidth > availableWidth ? truncateWithEllipsis(title, availableWidth) : title;
  const actualWidth = measureTextCells(clippedTitle);

  let titleX: number;
  if (titleAlign === "center") {
    titleX = x0 + 1 + Math.floor((rect.w - 2 - actualWidth) / 2);
  } else if (titleAlign === "right") {
    titleX = x1 - actualWidth - 1;
  } else {
    // left
    titleX = x0 + 2;
  }

  builder.pushClip(x0 + 1, y0, clampNonNegative(rect.w - 2), 1);
  builder.drawText(titleX, y0, clippedTitle, style);
  builder.popClip();
}

/**
 * Render a horizontal divider line within a box.
 * Uses T-junction glyphs to connect with box border.
 *
 * @param builder - Drawlist builder
 * @param rect - Box rectangle
 * @param y - Y position for the divider
 * @param border - Border style (must match box border)
 * @param style - Text style
 */
export function renderBoxDivider(
  builder: DrawlistBuilderV1,
  rect: Rect,
  y: number,
  border: BorderStyle,
  style: ResolvedTextStyle,
): void {
  if (border === "none") return;
  if (rect.w < 2) return;
  if (y <= rect.y || y >= rect.y + rect.h - 1) return;

  const glyphs = getBorderGlyphs(border);
  if (glyphs === null) return;

  const x0 = rect.x;
  const x1 = rect.x + rect.w - 1;
  const innerW = Math.max(0, rect.w - 2);

  // Draw: TH ─── THL
  builder.drawText(x0, y, `${glyphs.TH}${glyphs.H.repeat(innerW)}${glyphs.THL}`, style);
}
