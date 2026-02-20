import type { Rgb } from "./style.js";
import type { CanvasContext, GraphicsBlitter } from "./types.js";

export type CanvasOverlayText = Readonly<{
  x: number;
  y: number;
  text: string;
  color?: string;
}>;

export type CanvasResolution = Readonly<{
  subWidth: number;
  subHeight: number;
}>;

export type CanvasDrawingSurface = Readonly<{
  widthPx: number;
  heightPx: number;
  rgba: Uint8Array;
  overlays: readonly CanvasOverlayText[];
  ctx: CanvasContext;
  blitter: GraphicsBlitter;
}>;

export type CanvasColorResolver = (color: string) => Rgb;

const TRANSPARENT_PIXEL = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
const DEFAULT_SOLID_PIXEL = Object.freeze({ r: 255, g: 255, b: 255, a: 255 });

function toI32(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.trunc(v);
}

function toCellCoord(v: number, subSize: number): number {
  if (!Number.isFinite(v)) return -1;
  return Math.floor(v / subSize);
}

function clampU8(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

function parseHexColor(input: string): Rgb | null {
  const raw = input.startsWith("#") ? input.slice(1) : input;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    const n = Number.parseInt(raw, 16);
    return Object.freeze({
      r: (n >> 16) & 0xff,
      g: (n >> 8) & 0xff,
      b: n & 0xff,
    });
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const r = Number.parseInt(raw[0] ?? "0", 16);
    const g = Number.parseInt(raw[1] ?? "0", 16);
    const b = Number.parseInt(raw[2] ?? "0", 16);
    return Object.freeze({
      r: (r << 4) | r,
      g: (g << 4) | g,
      b: (b << 4) | b,
    });
  }
  return null;
}

function resolvePixel(
  color: string | undefined,
  resolveColor: CanvasColorResolver | undefined,
): Readonly<{ r: number; g: number; b: number; a: number }> {
  if (color === undefined) return DEFAULT_SOLID_PIXEL;
  const parsedHex = parseHexColor(color);
  if (parsedHex) {
    return Object.freeze({ ...parsedHex, a: 255 });
  }
  if (!resolveColor) return DEFAULT_SOLID_PIXEL;
  const resolved = resolveColor(color);
  return Object.freeze({
    r: clampU8(resolved.r),
    g: clampU8(resolved.g),
    b: clampU8(resolved.b),
    a: 255,
  });
}

export function resolveCanvasBlitter(
  preferred: GraphicsBlitter | undefined,
  supportsSubcell: boolean,
): GraphicsBlitter {
  const candidate = preferred ?? "auto";
  if (candidate !== "auto") return candidate;
  if (!supportsSubcell) return "ascii";
  return "braille";
}

export function getCanvasResolution(blitter: GraphicsBlitter): CanvasResolution {
  switch (blitter) {
    case "braille":
      return Object.freeze({ subWidth: 2, subHeight: 4 });
    case "sextant":
      return Object.freeze({ subWidth: 2, subHeight: 3 });
    case "quadrant":
      return Object.freeze({ subWidth: 2, subHeight: 2 });
    case "halfblock":
      return Object.freeze({ subWidth: 1, subHeight: 2 });
    default:
      return Object.freeze({ subWidth: 1, subHeight: 1 });
  }
}

function writePixel(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  x: number,
  y: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  if (x < 0 || y < 0 || x >= widthPx || y >= heightPx) return;
  const off = (y * widthPx + x) * 4;
  rgba[off] = pixel.r;
  rgba[off + 1] = pixel.g;
  rgba[off + 2] = pixel.b;
  rgba[off + 3] = pixel.a;
}

function drawLine(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  let xStart = toI32(x0);
  let yStart = toI32(y0);
  const xEnd = toI32(x1);
  const yEnd = toI32(y1);
  const dx = Math.abs(xEnd - xStart);
  const sx = xStart < xEnd ? 1 : -1;
  const dy = -Math.abs(yEnd - yStart);
  const sy = yStart < yEnd ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    writePixel(rgba, widthPx, heightPx, xStart, yStart, pixel);
    if (xStart === xEnd && yStart === yEnd) break;
    const e2 = err * 2;
    if (e2 >= dy) {
      err += dy;
      xStart += sx;
    }
    if (e2 <= dx) {
      err += dx;
      yStart += sy;
    }
  }
}

function fillRect(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  const x0 = Math.max(0, toI32(x));
  const y0 = Math.max(0, toI32(y));
  const x1 = Math.min(widthPx, toI32(x + w));
  const y1 = Math.min(heightPx, toI32(y + h));
  if (x1 <= x0 || y1 <= y0) return;
  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      writePixel(rgba, widthPx, heightPx, col, row, pixel);
    }
  }
}

function strokeRect(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  const x0 = toI32(x);
  const y0 = toI32(y);
  const x1 = toI32(x + w - 1);
  const y1 = toI32(y + h - 1);
  if (x1 < x0 || y1 < y0) return;
  drawLine(rgba, widthPx, heightPx, x0, y0, x1, y0, pixel);
  drawLine(rgba, widthPx, heightPx, x0, y1, x1, y1, pixel);
  drawLine(rgba, widthPx, heightPx, x0, y0, x0, y1, pixel);
  drawLine(rgba, widthPx, heightPx, x1, y0, x1, y1, pixel);
}

function circlePlot8(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  cx: number,
  cy: number,
  x: number,
  y: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  writePixel(rgba, widthPx, heightPx, cx + x, cy + y, pixel);
  writePixel(rgba, widthPx, heightPx, cx - x, cy + y, pixel);
  writePixel(rgba, widthPx, heightPx, cx + x, cy - y, pixel);
  writePixel(rgba, widthPx, heightPx, cx - x, cy - y, pixel);
  writePixel(rgba, widthPx, heightPx, cx + y, cy + x, pixel);
  writePixel(rgba, widthPx, heightPx, cx - y, cy + x, pixel);
  writePixel(rgba, widthPx, heightPx, cx + y, cy - x, pixel);
  writePixel(rgba, widthPx, heightPx, cx - y, cy - x, pixel);
}

function drawCircleOutline(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  cx: number,
  cy: number,
  radius: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  let x = Math.max(0, toI32(radius));
  let y = 0;
  let err = 1 - x;
  const centerX = toI32(cx);
  const centerY = toI32(cy);
  while (x >= y) {
    circlePlot8(rgba, widthPx, heightPx, centerX, centerY, x, y, pixel);
    y += 1;
    if (err < 0) {
      err += 2 * y + 1;
      continue;
    }
    x -= 1;
    err += 2 * (y - x + 1);
  }
}

function drawCircleFill(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  cx: number,
  cy: number,
  radius: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  const centerX = toI32(cx);
  const centerY = toI32(cy);
  const r = Math.max(0, toI32(radius));
  const rr = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const y = centerY + dy;
    if (y < 0 || y >= heightPx) continue;
    const dx = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
    const x0 = centerX - dx;
    const x1 = centerX + dx;
    for (let x = x0; x <= x1; x++) {
      writePixel(rgba, widthPx, heightPx, x, y, pixel);
    }
  }
}

export function createCanvasDrawingSurface(
  cols: number,
  rows: number,
  blitter: GraphicsBlitter,
  resolveColor: CanvasColorResolver | undefined,
): CanvasDrawingSurface {
  const safeCols = Math.max(0, toI32(cols));
  const safeRows = Math.max(0, toI32(rows));
  const resolvedBlitter = resolveCanvasBlitter(blitter, true);
  const resolution = getCanvasResolution(resolvedBlitter);
  const widthPx = safeCols * resolution.subWidth;
  const heightPx = safeRows * resolution.subHeight;
  const rgba = new Uint8Array(widthPx * heightPx * 4);
  const overlays: CanvasOverlayText[] = [];

  const ctx: CanvasContext = {
    width: widthPx,
    height: heightPx,
    line(x0, y0, x1, y1, color) {
      drawLine(rgba, widthPx, heightPx, x0, y0, x1, y1, resolvePixel(color, resolveColor));
    },
    fillRect(x, y, w, h, color) {
      fillRect(rgba, widthPx, heightPx, x, y, w, h, resolvePixel(color, resolveColor));
    },
    strokeRect(x, y, w, h, color) {
      strokeRect(rgba, widthPx, heightPx, x, y, w, h, resolvePixel(color, resolveColor));
    },
    circle(cx, cy, radius, color) {
      drawCircleOutline(rgba, widthPx, heightPx, cx, cy, radius, resolvePixel(color, resolveColor));
    },
    fillCircle(cx, cy, radius, color) {
      drawCircleFill(rgba, widthPx, heightPx, cx, cy, radius, resolvePixel(color, resolveColor));
    },
    setPixel(x, y, color) {
      writePixel(rgba, widthPx, heightPx, toI32(x), toI32(y), resolvePixel(color, resolveColor));
    },
    text(x, y, str, color) {
      if (str.length === 0) return;
      const cellX = toCellCoord(x, resolution.subWidth);
      const cellY = toCellCoord(y, resolution.subHeight);
      if (cellX < 0 || cellY < 0 || cellX >= safeCols || cellY >= safeRows) return;
      overlays.push(Object.freeze({ x: cellX, y: cellY, text: str, ...(color ? { color } : {}) }));
    },
    clear(color) {
      overlays.length = 0;
      if (color === undefined) {
        rgba.fill(0);
        return;
      }
      const pixel = resolvePixel(color, resolveColor);
      if (pixel.a === 0 && pixel.r === 0 && pixel.g === 0 && pixel.b === 0) {
        rgba.fill(0);
        return;
      }
      for (let off = 0; off + 3 < rgba.length; off += 4) {
        rgba[off] = pixel.r;
        rgba[off + 1] = pixel.g;
        rgba[off + 2] = pixel.b;
        rgba[off + 3] = pixel.a;
      }
    },
  };

  return Object.freeze({
    widthPx,
    heightPx,
    rgba,
    overlays,
    ctx,
    blitter: resolvedBlitter,
  });
}

export function clearCanvasSurface(surface: CanvasDrawingSurface): void {
  surface.rgba.fill(0);
  (surface.overlays as CanvasOverlayText[]).length = 0;
  void TRANSPARENT_PIXEL;
}
