import { type Rgb24, rgbB, rgbG, rgbR } from "./style.js";
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

export type CanvasColorResolver = (color: string) => Rgb24;

const TRANSPARENT_PIXEL = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
const DEFAULT_SOLID_PIXEL = Object.freeze({ r: 255, g: 255, b: 255, a: 255 });
const TAU = Math.PI * 2;

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

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const n = Math.trunc(v);
  if (n <= min) return min;
  if (n >= max) return max;
  return n;
}

function parseHexColor(input: string): Rgb24 | null {
  const raw = input.startsWith("#") ? input.slice(1) : input;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return Number.parseInt(raw, 16) & 0x00ff_ffff;
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const r = Number.parseInt(raw[0] ?? "0", 16);
    const g = Number.parseInt(raw[1] ?? "0", 16);
    const b = Number.parseInt(raw[2] ?? "0", 16);
    return (((r << 4) | r) << 16) | (((g << 4) | g) << 8) | ((b << 4) | b);
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
    return Object.freeze({
      r: clampU8(rgbR(parsedHex)),
      g: clampU8(rgbG(parsedHex)),
      b: clampU8(rgbB(parsedHex)),
      a: 255,
    });
  }
  if (!resolveColor) return DEFAULT_SOLID_PIXEL;
  const resolved = resolveColor(color);
  return Object.freeze({
    r: clampU8(rgbR(resolved)),
    g: clampU8(rgbG(resolved)),
    b: clampU8(rgbB(resolved)),
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

function drawPolyline(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  points: readonly Readonly<{ x: number; y: number }>[],
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  if (points.length < 2) return;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    if (!prev || !next) continue;
    drawLine(rgba, widthPx, heightPx, prev.x, prev.y, next.x, next.y, pixel);
  }
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

function drawArcOutline(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return;
  const centerX = toI32(cx);
  const centerY = toI32(cy);
  const r = Math.max(0, toI32(radius));
  if (r === 0) {
    writePixel(rgba, widthPx, heightPx, centerX, centerY, pixel);
    return;
  }

  const start = startAngle;
  let end = endAngle;
  let sweep = end - start;
  if (!Number.isFinite(sweep)) return;
  if (sweep === 0) {
    const x = toI32(centerX + Math.cos(start) * r);
    const y = toI32(centerY + Math.sin(start) * r);
    writePixel(rgba, widthPx, heightPx, x, y, pixel);
    return;
  }
  if (Math.abs(sweep) >= TAU) {
    drawCircleOutline(rgba, widthPx, heightPx, centerX, centerY, r, pixel);
    return;
  }

  if (sweep < 0) {
    const turns = Math.ceil(-sweep / TAU);
    end += turns * TAU;
    sweep = end - start;
  }

  const steps = Math.max(1, Math.ceil(Math.abs(sweep) * Math.max(1, r * 2)));
  let prevX = toI32(centerX + Math.cos(start) * r);
  let prevY = toI32(centerY + Math.sin(start) * r);
  for (let step = 1; step <= steps; step++) {
    const t = start + (sweep * step) / steps;
    const nextX = toI32(centerX + Math.cos(t) * r);
    const nextY = toI32(centerY + Math.sin(t) * r);
    drawLine(rgba, widthPx, heightPx, prevX, prevY, nextX, nextY, pixel);
    prevX = nextX;
    prevY = nextY;
  }
}

function strokeRoundedRect(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  const left = toI32(x);
  const top = toI32(y);
  const right = toI32(x + w - 1);
  const bottom = toI32(y + h - 1);
  if (right < left || bottom < top) return;

  const rectWidth = right - left + 1;
  const rectHeight = bottom - top + 1;
  const maxRadius = Math.floor(Math.min(rectWidth, rectHeight) / 2);
  const r = clampInt(radius, 0, Math.max(0, maxRadius));
  if (r === 0) {
    strokeRect(rgba, widthPx, heightPx, left, top, rectWidth, rectHeight, pixel);
    return;
  }

  drawLine(rgba, widthPx, heightPx, left + r, top, right - r, top, pixel);
  drawLine(rgba, widthPx, heightPx, left + r, bottom, right - r, bottom, pixel);
  drawLine(rgba, widthPx, heightPx, left, top + r, left, bottom - r, pixel);
  drawLine(rgba, widthPx, heightPx, right, top + r, right, bottom - r, pixel);

  drawArcOutline(rgba, widthPx, heightPx, left + r, top + r, r, Math.PI, Math.PI * 1.5, pixel);
  drawArcOutline(rgba, widthPx, heightPx, right - r, top + r, r, Math.PI * 1.5, TAU, pixel);
  drawArcOutline(rgba, widthPx, heightPx, right - r, bottom - r, r, 0, Math.PI * 0.5, pixel);
  drawArcOutline(rgba, widthPx, heightPx, left + r, bottom - r, r, Math.PI * 0.5, Math.PI, pixel);
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

function edgeSign(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function fillTriangle(
  rgba: Uint8Array,
  widthPx: number,
  heightPx: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pixel: Readonly<{ r: number; g: number; b: number; a: number }>,
): void {
  const ax = toI32(x0);
  const ay = toI32(y0);
  const bx = toI32(x1);
  const by = toI32(y1);
  const cx = toI32(x2);
  const cy = toI32(y2);
  const area = edgeSign(ax, ay, bx, by, cx, cy);
  if (area === 0) {
    drawLine(rgba, widthPx, heightPx, ax, ay, bx, by, pixel);
    drawLine(rgba, widthPx, heightPx, bx, by, cx, cy, pixel);
    drawLine(rgba, widthPx, heightPx, cx, cy, ax, ay, pixel);
    return;
  }

  const minX = Math.max(0, Math.min(ax, bx, cx));
  const minY = Math.max(0, Math.min(ay, by, cy));
  const maxX = Math.min(widthPx - 1, Math.max(ax, bx, cx));
  const maxY = Math.min(heightPx - 1, Math.max(ay, by, cy));
  if (maxX < minX || maxY < minY) return;

  const isPositiveArea = area > 0;
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const e0 = edgeSign(bx, by, cx, cy, px, py);
      const e1 = edgeSign(cx, cy, ax, ay, px, py);
      const e2 = edgeSign(ax, ay, bx, by, px, py);
      if (
        (isPositiveArea && e0 >= 0 && e1 >= 0 && e2 >= 0) ||
        (!isPositiveArea && e0 <= 0 && e1 <= 0 && e2 <= 0)
      ) {
        writePixel(rgba, widthPx, heightPx, px, py, pixel);
      }
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
    polyline(points, color) {
      drawPolyline(rgba, widthPx, heightPx, points, resolvePixel(color, resolveColor));
    },
    fillRect(x, y, w, h, color) {
      fillRect(rgba, widthPx, heightPx, x, y, w, h, resolvePixel(color, resolveColor));
    },
    strokeRect(x, y, w, h, color) {
      strokeRect(rgba, widthPx, heightPx, x, y, w, h, resolvePixel(color, resolveColor));
    },
    roundedRect(x, y, w, h, radius, color) {
      strokeRoundedRect(
        rgba,
        widthPx,
        heightPx,
        x,
        y,
        w,
        h,
        radius,
        resolvePixel(color, resolveColor),
      );
    },
    circle(cx, cy, radius, color) {
      drawCircleOutline(rgba, widthPx, heightPx, cx, cy, radius, resolvePixel(color, resolveColor));
    },
    arc(cx, cy, radius, startAngle, endAngle, color) {
      drawArcOutline(
        rgba,
        widthPx,
        heightPx,
        cx,
        cy,
        radius,
        startAngle,
        endAngle,
        resolvePixel(color, resolveColor),
      );
    },
    fillCircle(cx, cy, radius, color) {
      drawCircleFill(rgba, widthPx, heightPx, cx, cy, radius, resolvePixel(color, resolveColor));
    },
    fillTriangle(x0, y0, x1, y1, x2, y2, color) {
      fillTriangle(
        rgba,
        widthPx,
        heightPx,
        x0,
        y0,
        x1,
        y1,
        x2,
        y2,
        resolvePixel(color, resolveColor),
      );
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
