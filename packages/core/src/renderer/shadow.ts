/**
 * packages/core/src/renderer/shadow.ts — Shadow rendering for depth effects.
 *
 * Why: Creates visual depth for elevated surfaces (modals, dropdowns, cards)
 * using half-block/shade characters.
 *
 * Shadow is rendered BEFORE the box content so it appears behind.
 *
 * @see docs/guide/runtime-and-layout.md
 */

import type { DrawlistBuilderV1 } from "../index.js";
import type { Rect } from "../layout/types.js";
import type { Rgb } from "../widgets/style.js";
import type { ResolvedTextStyle } from "./renderToDrawlist/textStyle.js";

/** Shadow characters for different densities. */
export const SHADOW_LIGHT = "░";
export const SHADOW_MEDIUM = "▒";
export const SHADOW_DENSE = "▓";

/** Shadow density options. */
export type ShadowDensity = "light" | "medium" | "dense";

/**
 * Shadow configuration.
 */
export type ShadowConfig = Readonly<{
  /** Horizontal offset in cells (typically 1-2). */
  offsetX: number;
  /** Vertical offset in cells (typically 1). */
  offsetY: number;
  /** Shadow color. */
  color: Rgb;
  /** Shadow character density. */
  density: ShadowDensity;
}>;

type ShadowBoundsConfig = Readonly<{
  offsetX: number;
  offsetY: number;
}>;

/**
 * Default shadow configuration.
 */
export const DEFAULT_SHADOW: ShadowConfig = Object.freeze({
  offsetX: 1,
  offsetY: 1,
  color: Object.freeze({ r: 0, g: 0, b: 0 }),
  density: "light",
});

/**
 * Create a shadow config with custom options.
 */
export function createShadowConfig(options: Partial<ShadowConfig> = {}): ShadowConfig {
  return Object.freeze({
    offsetX: options.offsetX ?? DEFAULT_SHADOW.offsetX,
    offsetY: options.offsetY ?? DEFAULT_SHADOW.offsetY,
    color: options.color ?? DEFAULT_SHADOW.color,
    density: options.density ?? DEFAULT_SHADOW.density,
  });
}

/**
 * Get the shadow character for a given density.
 */
function getShadowChar(density: ShadowDensity): string {
  switch (density) {
    case "light":
      return SHADOW_LIGHT;
    case "dense":
      return SHADOW_DENSE;
    default:
      return SHADOW_MEDIUM;
  }
}

/**
 * Render a shadow behind a rectangle.
 *
 * Call this BEFORE rendering the box content to ensure the shadow
 * appears behind the box.
 *
 * The shadow is drawn to the right and below the box, creating
 * a drop shadow effect.
 *
 * @param builder - Drawlist builder
 * @param rect - The rectangle to cast shadow from
 * @param config - Shadow configuration
 * @param baseStyle - Base style to get background color from
 *
 * @example
 * ```typescript
 * // Render shadow first
 * renderShadow(builder, { x: 5, y: 2, w: 20, h: 10 }, DEFAULT_SHADOW, baseStyle);
 *
 * // Then render the box on top
 * renderBoxBorder(builder, rect, "rounded", ...);
 * ```
 */
export function renderShadow(
  builder: DrawlistBuilderV1,
  rect: Rect,
  config: ShadowConfig,
  baseStyle: ResolvedTextStyle,
): void {
  const { offsetX, offsetY, color, density } = config;

  if (offsetX <= 0 && offsetY <= 0) return;
  if (rect.w <= 0 || rect.h <= 0) return;

  const shadowChar = getShadowChar(density);
  const style: ResolvedTextStyle = {
    fg: color,
    bg: baseStyle.bg,
  };

  // Right edge shadow (vertical strip)
  if (offsetX > 0) {
    const shadowX = rect.x + rect.w;
    const startY = rect.y + offsetY;
    const endY = rect.y + rect.h;
    const shadowStr = shadowChar.repeat(offsetX);

    for (let y = startY; y < endY; y++) {
      builder.drawText(shadowX, y, shadowStr, style);
    }
  }

  // Bottom edge shadow (horizontal strip including corner)
  if (offsetY > 0) {
    const startX = rect.x + offsetX;
    const shadowY = rect.y + rect.h;
    // Keep horizontal strip aligned with content width and shifted by offsetX.
    // This avoids overextending one extra cell beyond the vertical strip corner.
    const shadowStr = shadowChar.repeat(Math.max(0, rect.w));

    for (let dy = 0; dy < offsetY; dy++) {
      builder.drawText(startX, shadowY + dy, shadowStr, style);
    }
  }
}

/**
 * Calculate the total bounds including shadow.
 *
 * @param rect - Original rectangle
 * @param config - Shadow configuration
 * @returns Rectangle including shadow area
 */
export function getRectWithShadow(rect: Rect, config: ShadowBoundsConfig): Rect {
  return {
    x: rect.x,
    y: rect.y,
    // renderShadow() draws bottom strip at x + offsetX with width rect.w,
    // so rightmost painted cell extends by offsetX beyond rect right edge.
    w: rect.w + config.offsetX,
    h: rect.h + config.offsetY,
  };
}
