/**
 * packages/core/src/ui/capabilities.ts — Capability tier detection.
 *
 * Why: Provides a simple A/B/C capability tier abstraction derived from
 * terminal capabilities. Widgets and recipes use the tier to adapt styling
 * (e.g., color depth, glyph selection, shadow effects).
 *
 * Tiers:
 *   A — 16/256-color + unicode box drawing (no images)
 *   B — Truecolor (24-bit RGB)
 *   C — Enhanced: truecolor + image protocols (kitty/sixel/iterm2) or sub-cell canvas
 *
 * @see docs/design-system.md
 */

import type { ColorMode, TerminalCaps } from "../terminalCaps.js";
import { COLOR_MODE_RGB } from "../terminalCaps.js";
import type { TerminalProfile } from "../terminalProfile.js";

/**
 * Capability tier: A (basic), B (truecolor), C (enhanced/images).
 */
export type CapabilityTier = "A" | "B" | "C";

/**
 * Resolved capability context passed to recipes and widgets.
 */
export type CapabilityContext = Readonly<{
  /** The resolved tier */
  tier: CapabilityTier;
  /** True if truecolor (24-bit) is supported */
  truecolor: boolean;
  /** True if any image protocol is available */
  hasImageProtocol: boolean;
  /** True if extended underline styles work */
  hasUnderlineStyles: boolean;
  /** True if colored underlines work */
  hasColoredUnderlines: boolean;
  /** True if hyperlinks are supported */
  hasHyperlinks: boolean;
}>;

/**
 * Derive the capability tier from terminal capabilities.
 *
 * @param caps - Terminal capabilities from the engine
 * @param profile - Optional terminal profile for image protocol detection
 * @returns The resolved capability tier
 */
export function getCapabilityTier(caps: TerminalCaps, profile?: TerminalProfile): CapabilityTier {
  const isTruecolor = caps.colorMode === COLOR_MODE_RGB;

  if (!isTruecolor) return "A";

  // Check for image protocol support
  const hasImages =
    profile !== undefined &&
    (profile.supportsKittyGraphics || profile.supportsSixel || profile.supportsIterm2Images);

  return hasImages ? "C" : "B";
}

/**
 * Build a full capability context from terminal capabilities.
 *
 * @param caps - Terminal capabilities from the engine
 * @param profile - Optional terminal profile for extended detection
 * @returns Resolved capability context
 */
export function resolveCapabilityContext(
  caps: TerminalCaps,
  profile?: TerminalProfile,
): CapabilityContext {
  const tier = getCapabilityTier(caps, profile);
  const truecolor = caps.colorMode === COLOR_MODE_RGB;

  return Object.freeze({
    tier,
    truecolor,
    hasImageProtocol:
      profile !== undefined &&
      (profile.supportsKittyGraphics || profile.supportsSixel || profile.supportsIterm2Images),
    hasUnderlineStyles: caps.supportsUnderlineStyles || (profile?.supportsUnderlineStyles ?? false),
    hasColoredUnderlines:
      caps.supportsColoredUnderlines || (profile?.supportsColoredUnderlines ?? false),
    hasHyperlinks: caps.supportsHyperlinks || (profile?.supportsHyperlinks ?? false),
  });
}

/**
 * Default capability context (conservative: Tier A).
 */
export const DEFAULT_CAPABILITY_CONTEXT: CapabilityContext = Object.freeze({
  tier: "A" as CapabilityTier,
  truecolor: false,
  hasImageProtocol: false,
  hasUnderlineStyles: false,
  hasColoredUnderlines: false,
  hasHyperlinks: false,
});

/**
 * Map an RGB color to the nearest 256-color palette index.
 *
 * Used for Tier A color fallback. Implements the standard xterm-256 color
 * cube mapping with grayscale ramp.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Nearest 256-color palette index (16-255)
 */
export function rgbTo256(r: number, g: number, b: number): number {
  // Check if grayscale is a better match
  const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

  // 6x6x6 color cube (indices 16-231)
  const ri = Math.round((r / 255) * 5);
  const gi = Math.round((g / 255) * 5);
  const bi = Math.round((b / 255) * 5);
  const cubeIndex = 16 + 36 * ri + 6 * gi + bi;

  // Reconstruct the cube color for distance comparison
  const cubeR = ri * 51;
  const cubeG = gi * 51;
  const cubeB = bi * 51;
  const cubeDist = (r - cubeR) ** 2 + (g - cubeG) ** 2 + (b - cubeB) ** 2;

  // Grayscale ramp (indices 232-255): 24 shades from 8 to 238
  const grayIndex = Math.round((gray - 8) / 10);
  const clampedGrayIndex = Math.max(0, Math.min(23, grayIndex));
  const grayValue = 8 + clampedGrayIndex * 10;
  const grayDist = (r - grayValue) ** 2 + (g - grayValue) ** 2 + (b - grayValue) ** 2;

  return grayDist < cubeDist ? 232 + clampedGrayIndex : cubeIndex;
}
