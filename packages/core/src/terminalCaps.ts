/**
 * packages/core/src/terminalCaps.ts — Terminal capability types.
 *
 * Why: Exposes the engine's terminal capability snapshot to the TypeScript layer.
 * This allows the framework to adapt behavior based on terminal capabilities
 * (e.g., graceful degradation when cursor shaping isn't supported).
 *
 * @see zr_terminal_caps_t in zr_terminal_caps.h
 */

/**
 * Color mode supported by the terminal.
 * Matches plat_color_mode_t in the C engine.
 */
export type ColorMode = 0 | 1 | 2 | 3;

export const COLOR_MODE_UNKNOWN: ColorMode = 0;
export const COLOR_MODE_16: ColorMode = 1;
export const COLOR_MODE_256: ColorMode = 2;
export const COLOR_MODE_RGB: ColorMode = 3;

/**
 * Terminal capability snapshot.
 *
 * Reports what terminal features are supported by the current backend.
 * Use this to adapt UI behavior and degrade gracefully.
 */
export type TerminalCaps = Readonly<{
  /** Color mode: 0=unknown, 1=16, 2=256, 3=rgb */
  colorMode: ColorMode;

  /** Mouse input support */
  supportsMouse: boolean;

  /** Bracketed paste mode support */
  supportsBracketedPaste: boolean;

  /** Terminal focus events (in/out) support */
  supportsFocusEvents: boolean;

  /** OSC 52 clipboard access support */
  supportsOsc52: boolean;

  /** Synchronized output / DEC SM 2026 support */
  supportsSyncUpdate: boolean;

  /** Scroll region support */
  supportsScrollRegion: boolean;

  /** Cursor shape control support (bar, underline, block) */
  supportsCursorShape: boolean;

  /** Output wait/drain support for backpressure */
  supportsOutputWaitWritable: boolean;

  /** Extended underline style variants (double/curly/dotted/dashed) */
  supportsUnderlineStyles: boolean;

  /** Independent underline color (SGR 58 / 59) */
  supportsColoredUnderlines: boolean;

  /** OSC 8 hyperlinks */
  supportsHyperlinks: boolean;

  /** Bitmask of supported SGR text attributes */
  sgrAttrsSupported: number;
}>;

/**
 * Default terminal caps when engine hasn't reported yet.
 * Conservative defaults that should work on any terminal.
 */
export const DEFAULT_TERMINAL_CAPS: TerminalCaps = Object.freeze({
  colorMode: COLOR_MODE_UNKNOWN,
  supportsMouse: false,
  supportsBracketedPaste: false,
  supportsFocusEvents: false,
  supportsOsc52: false,
  supportsSyncUpdate: false,
  supportsScrollRegion: false,
  supportsCursorShape: false,
  supportsOutputWaitWritable: false,
  supportsUnderlineStyles: false,
  supportsColoredUnderlines: false,
  supportsHyperlinks: false,
  sgrAttrsSupported: 0,
});

/**
 * Check if the terminal supports the native cursor protocol.
 *
 * @param caps - Terminal capabilities
 * @returns true if SET_CURSOR commands will work
 */
export function supportsCursorProtocol(_caps: TerminalCaps): boolean {
  return true;
}

/**
 * Check if cursor shaping is fully supported.
 *
 * @param caps - Terminal capabilities
 * @returns true if bar/underline/block cursor shapes are supported
 */
export function supportsCursorShaping(caps: TerminalCaps): boolean {
  return caps.supportsCursorShape;
}

/**
 * Get the best available color mode.
 *
 * @param caps - Terminal capabilities
 * @param preferred - Preferred color mode
 * @returns The highest color mode supported up to preferred
 */
export function getBestColorMode(caps: TerminalCaps, preferred: ColorMode): ColorMode {
  if (caps.colorMode >= preferred) return preferred;
  return caps.colorMode;
}
