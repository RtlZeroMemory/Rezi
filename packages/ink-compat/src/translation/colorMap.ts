import { type Rgb24, rgb } from "@rezi-ui/core";
import { isTranslationTraceEnabled, pushTranslationTrace } from "./traceCollector.js";

const NAMED_COLORS: Record<string, Rgb24> = {
  black: rgb(0, 0, 0),
  red: rgb(205, 0, 0),
  green: rgb(0, 205, 0),
  yellow: rgb(205, 205, 0),
  blue: rgb(0, 0, 238),
  magenta: rgb(205, 0, 205),
  cyan: rgb(0, 205, 205),
  white: rgb(229, 229, 229),
  gray: rgb(127, 127, 127),
  grey: rgb(127, 127, 127),
  redBright: rgb(255, 0, 0),
  greenBright: rgb(0, 255, 0),
  yellowBright: rgb(255, 255, 0),
  blueBright: rgb(92, 92, 255),
  magentaBright: rgb(255, 0, 255),
  cyanBright: rgb(0, 255, 255),
  whiteBright: rgb(255, 255, 255),
};

const NAMED_COLORS_LOWER: Record<string, Rgb24> = {};
for (const [name, value] of Object.entries(NAMED_COLORS)) {
  NAMED_COLORS_LOWER[name.toLowerCase()] = value;
}

const COLOR_CACHE = new Map<string, Rgb24 | undefined>();
const COLOR_CACHE_MAX = 256;

function rgbR(value: Rgb24): number {
  return (value >>> 16) & 0xff;
}

function rgbG(value: Rgb24): number {
  return (value >>> 8) & 0xff;
}

function rgbB(value: Rgb24): number {
  return value & 0xff;
}

function isByte(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 255;
}

/**
 * Parse an Ink color string into a packed Rezi color.
 * Supports: named colors, "#rrggbb", "#rgb", "rgb(r, g, b)".
 * Returns undefined for unrecognized input.
 */
export function parseColor(color: string | undefined): Rgb24 | undefined {
  if (!color) return undefined;

  const result = parseColorInner(color);
  if (isTranslationTraceEnabled()) {
    pushTranslationTrace({
      kind: "color-parse",
      input: color,
      result: result !== undefined ? { r: rgbR(result), g: rgbG(result), b: rgbB(result) } : null,
    });
  }
  return result;
}

function parseColorInner(color: string): Rgb24 | undefined {
  const cached = COLOR_CACHE.get(color);
  if (cached !== undefined || COLOR_CACHE.has(color)) return cached;

  const result = parseColorUncached(color);
  if (COLOR_CACHE.size >= COLOR_CACHE_MAX) {
    COLOR_CACHE.clear();
  }
  COLOR_CACHE.set(color, result);
  return result;
}

function parseColorUncached(color: string): Rgb24 | undefined {
  if (color in NAMED_COLORS) return NAMED_COLORS[color];

  const lower = color.toLowerCase();
  if (lower in NAMED_COLORS_LOWER) return NAMED_COLORS_LOWER[lower];

  const ansi256Match = lower.match(/^ansi256\(\s*(\d{1,3})\s*\)$/);
  if (ansi256Match) {
    const index = Number.parseInt(ansi256Match[1]!, 10);
    if (Number.isInteger(index) && index >= 0 && index <= 255) {
      return decodeAnsi256Color(index);
    }
    return undefined;
  }

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (/^[\da-fA-F]{6}$/.test(hex)) {
      return rgb(
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      );
    }

    if (/^[\da-fA-F]{3}$/.test(hex)) {
      return rgb(
        Number.parseInt(hex[0]! + hex[0]!, 16),
        Number.parseInt(hex[1]! + hex[1]!, 16),
        Number.parseInt(hex[2]! + hex[2]!, 16),
      );
    }

    return undefined;
  }

  const rgbMatch = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!rgbMatch) return undefined;

  const r = Number(rgbMatch[1]);
  const g = Number(rgbMatch[2]);
  const b = Number(rgbMatch[3]);
  if (!isByte(r) || !isByte(g) || !isByte(b)) return undefined;

  return rgb(r, g, b);
}

function decodeAnsi256Color(index: number): Rgb24 {
  if (index < 16) {
    const palette16: readonly Rgb24[] = [
      rgb(0, 0, 0),
      rgb(205, 0, 0),
      rgb(0, 205, 0),
      rgb(205, 205, 0),
      rgb(0, 0, 238),
      rgb(205, 0, 205),
      rgb(0, 205, 205),
      rgb(229, 229, 229),
      rgb(127, 127, 127),
      rgb(255, 0, 0),
      rgb(0, 255, 0),
      rgb(255, 255, 0),
      rgb(92, 92, 255),
      rgb(255, 0, 255),
      rgb(0, 255, 255),
      rgb(255, 255, 255),
    ];
    return palette16[index]!;
  }

  if (index <= 231) {
    const offset = index - 16;
    const rLevel = Math.floor(offset / 36);
    const gLevel = Math.floor((offset % 36) / 6);
    const bLevel = offset % 6;
    const toChannel = (level: number): number => (level === 0 ? 0 : 55 + level * 40);
    return rgb(toChannel(rLevel), toChannel(gLevel), toChannel(bLevel));
  }

  const gray = 8 + (index - 232) * 10;
  return rgb(gray, gray, gray);
}
