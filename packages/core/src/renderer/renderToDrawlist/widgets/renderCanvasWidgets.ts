import type { DrawlistBuilder } from "../../../drawlist/types.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { TerminalProfile } from "../../../terminalProfile.js";
import type { Theme } from "../../../theme/theme.js";
import { resolveColor } from "../../../theme/theme.js";
import { rgbB, rgbG, rgbR } from "../../../widgets/style.js";
import { createCanvasDrawingSurface, resolveCanvasBlitter } from "../../../widgets/canvas.js";
import {
  type ImageBinaryFormat,
  analyzeImageSource,
  hashImageBytes,
  inferRgbaDimensions,
  normalizeImageFit,
  normalizeImageProtocol,
} from "../../../widgets/image.js";
import type { GraphicsBlitter } from "../../../widgets/types.js";
import { isVisibleRect } from "../indices.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { truncateToWidth } from "./renderTextWidgets.js";

type ReadZLayer = (v: unknown) => -1 | 0 | 1;

const REPEAT_CACHE_MAX_ENTRIES = 2048;
const repeatCache = new Map<string, string>();

function repeatCached(glyph: string, count: number): string {
  if (count <= 0) return "";
  if (count === 1) return glyph;
  if (count > 256) return glyph.repeat(count);
  const key = `${glyph}\u0000${String(count)}`;
  const cached = repeatCache.get(key);
  if (cached !== undefined) return cached;
  const value = glyph.repeat(count);
  if (repeatCache.size >= REPEAT_CACHE_MAX_ENTRIES) {
    const oldest = repeatCache.keys().next();
    if (!oldest.done) repeatCache.delete(oldest.value);
  }
  repeatCache.set(key, value);
  return value;
}

function resolveCanvasOverlayColor(theme: Theme, color: string): number {
  return resolveColor(theme, color);
}

function readNumber(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function readNonNegativeInt(v: unknown): number | undefined {
  const n = readNumber(v);
  if (n === undefined || n < 0) return undefined;
  return Math.trunc(n);
}

function readPositiveInt(v: unknown): number | undefined {
  const n = readNonNegativeInt(v);
  if (n === undefined || n <= 0) return undefined;
  return n;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readGraphicsBlitter(v: unknown): GraphicsBlitter | undefined {
  switch (v) {
    case "auto":
    case "braille":
    case "sextant":
    case "quadrant":
    case "halfblock":
    case "ascii":
      return v;
    default:
      return undefined;
  }
}

function readImageFit(v: unknown): "fill" | "contain" | "cover" | undefined {
  switch (v) {
    case "fill":
    case "contain":
    case "cover":
      return v;
    default:
      return undefined;
  }
}

function readImageProtocol(
  v: unknown,
): "auto" | "kitty" | "sixel" | "iterm2" | "blitter" | undefined {
  switch (v) {
    case "auto":
    case "kitty":
    case "sixel":
    case "iterm2":
    case "blitter":
      return v;
    default:
      return undefined;
  }
}

type ImageRenderRoute = Readonly<
  | { ok: true; mode: "drawImage"; protocol: "auto" | "kitty" | "sixel" | "iterm2" }
  | { ok: true; mode: "drawCanvas" }
  | { ok: false; reason: string }
>;

function resolveProtocolForImageSource(
  requested: "auto" | "kitty" | "sixel" | "iterm2" | "blitter",
  format: ImageBinaryFormat,
  terminalProfile: TerminalProfile | undefined,
  canDrawCanvas: boolean,
): ImageRenderRoute {
  if (requested === "blitter") {
    if (!canDrawCanvas) {
      return Object.freeze({ ok: false, reason: "blitter protocol requires canvas draw support" });
    }
    if (format !== "rgba") {
      return Object.freeze({ ok: false, reason: "blitter protocol requires RGBA source" });
    }
    return Object.freeze({ ok: true, mode: "drawCanvas" });
  }

  if (requested === "kitty" || requested === "sixel") {
    if (format !== "png")
      return Object.freeze({ ok: true, mode: "drawImage", protocol: requested });
    return Object.freeze({
      ok: false,
      reason: "PNG source requires RGBA when using kitty/sixel",
    });
  }

  if (requested === "iterm2") {
    return Object.freeze({ ok: true, mode: "drawImage", protocol: "iterm2" });
  }

  if (requested !== "auto") {
    return Object.freeze({ ok: false, reason: "unsupported image protocol" });
  }

  if (!terminalProfile) {
    if (format === "png") {
      return Object.freeze({
        ok: false,
        reason: "PNG source requires iTerm2 image support (or switch to RGBA)",
      });
    }
    return Object.freeze({ ok: true, mode: "drawImage", protocol: "auto" });
  }

  const supportsKitty = terminalProfile.supportsKittyGraphics === true;
  const supportsIterm2 = terminalProfile.supportsIterm2Images === true;
  const supportsSixel = terminalProfile.supportsSixel === true;

  if (format === "rgba") {
    if (supportsKitty) return Object.freeze({ ok: true, mode: "drawImage", protocol: "kitty" });
    if (supportsIterm2) return Object.freeze({ ok: true, mode: "drawImage", protocol: "iterm2" });
    if (supportsSixel) return Object.freeze({ ok: true, mode: "drawImage", protocol: "sixel" });
    if (canDrawCanvas) return Object.freeze({ ok: true, mode: "drawCanvas" });
    return Object.freeze({
      ok: false,
      reason: "no supported image protocol and blitter fallback unavailable",
    });
  }

  if (supportsIterm2) return Object.freeze({ ok: true, mode: "drawImage", protocol: "iterm2" });
  return Object.freeze({
    ok: false,
    reason: "PNG source requires iTerm2 image support (or switch to RGBA)",
  });
}

export function drawPlaceholderBox(
  builder: DrawlistBuilder,
  rect: Rect,
  style: ResolvedTextStyle,
  title: string,
  body: string,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;
  builder.pushClip(rect.x, rect.y, rect.w, rect.h);
  if (rect.w >= 2 && rect.h >= 2) {
    const top = `┌${repeatCached("─", Math.max(0, rect.w - 2))}┐`;
    const mid = `│${repeatCached(" ", Math.max(0, rect.w - 2))}│`;
    const bottom = `└${repeatCached("─", Math.max(0, rect.w - 2))}┘`;
    builder.drawText(rect.x, rect.y, truncateToWidth(top, rect.w), style);
    for (let row = 1; row < rect.h - 1; row++) {
      builder.drawText(rect.x, rect.y + row, truncateToWidth(mid, rect.w), style);
    }
    builder.drawText(rect.x, rect.y + rect.h - 1, truncateToWidth(bottom, rect.w), style);
    if (rect.h >= 3) {
      const titleLine = truncateToWidth(title, Math.max(0, rect.w - 2));
      const bodyLine = truncateToWidth(body, Math.max(0, rect.w - 2));
      builder.drawText(rect.x + 1, rect.y + 1, titleLine, style);
      if (rect.h >= 4) builder.drawText(rect.x + 1, rect.y + 2, bodyLine, style);
    }
  } else {
    builder.drawText(rect.x, rect.y, truncateToWidth(`[${title}]`, rect.w), style);
  }
  builder.popClip();
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

export function addBlobAligned(builder: DrawlistBuilder, bytes: Uint8Array): number | null {
  if ((bytes.byteLength & 3) === 0) return builder.addBlob(bytes);
  const padded = new Uint8Array(align4(bytes.byteLength));
  padded.set(bytes);
  return builder.addBlob(padded);
}

export function rgbToHex(color: ReturnType<typeof resolveColor>): string {
  const r = rgbR(color).toString(16).padStart(2, "0");
  const g = rgbG(color).toString(16).padStart(2, "0");
  const b = rgbB(color).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function renderCanvasWidgets(
  builder: DrawlistBuilder,
  rect: Rect,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  terminalProfile: TerminalProfile | undefined,
  readZLayer: ReadZLayer,
): boolean {
  const vnode = node.vnode;

  switch (vnode.kind) {
    case "canvas": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        draw?: unknown;
        blitter?: unknown;
      };
      if (typeof props.draw !== "function") break;
      const requestedBlitter = readGraphicsBlitter(props.blitter);
      const blitter = resolveCanvasBlitter(requestedBlitter, true);
      const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
        resolveColor(theme, color),
      );
      (props.draw as (ctx: typeof surface.ctx) => void)(surface.ctx);

      if (rect.w > 0 && rect.h > 0) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Canvas", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Canvas", "invalid canvas size");
      }

      if (surface.overlays.length > 0) {
        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        for (const overlay of surface.overlays) {
          const color =
            overlay.color === undefined
              ? undefined
              : { fg: resolveCanvasOverlayColor(theme, overlay.color) };
          builder.drawText(rect.x + overlay.x, rect.y + overlay.y, overlay.text, color);
        }
        builder.popClip();
      }
      break;
    }
    case "image": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        src?: unknown;
        sourceWidth?: unknown;
        sourceHeight?: unknown;
        fit?: unknown;
        protocol?: unknown;
        alt?: unknown;
        imageId?: unknown;
        zLayer?: unknown;
      };
      const alt = readString(props.alt);
      const fallbackBody = (reason: string): string => {
        if (alt !== undefined) {
          const trimmed = alt.trim();
          if (trimmed.length > 0) return trimmed;
        }
        return reason;
      };
      const src = props.src;
      if (!(src instanceof Uint8Array)) {
        drawPlaceholderBox(builder, rect, parentStyle, "Image", fallbackBody("invalid source"));
        break;
      }
      const analyzed = analyzeImageSource(src);
      if (!analyzed.ok || !analyzed.bytes || !analyzed.format) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody(analyzed.error ?? "decode failed"),
        );
        break;
      }

      if (rect.w <= 0 || rect.h <= 0) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("graphics not supported"),
        );
        break;
      }

      const fit = normalizeImageFit(readImageFit(props.fit));
      const requestedProtocol = normalizeImageProtocol(readImageProtocol(props.protocol));
      const resolvedProtocol = resolveProtocolForImageSource(
        requestedProtocol,
        analyzed.format,
        terminalProfile,
        true,
      );
      if (!resolvedProtocol.ok) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody(resolvedProtocol.reason),
        );
        break;
      }
      const zLayer = readZLayer(props.zLayer);
      const imageId = readNonNegativeInt(props.imageId) ?? hashImageBytes(analyzed.bytes) ?? 0;
      const explicitSourceWidth = readPositiveInt(props.sourceWidth);
      const explicitSourceHeight = readPositiveInt(props.sourceHeight);
      if ((explicitSourceWidth === undefined) !== (explicitSourceHeight === undefined)) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("sourceWidth/sourceHeight must be provided together"),
        );
        break;
      }
      const explicitDims =
        explicitSourceWidth !== undefined && explicitSourceHeight !== undefined
          ? { width: explicitSourceWidth, height: explicitSourceHeight }
          : null;
      if (explicitDims && analyzed.format === "rgba") {
        const expectedLen = explicitDims.width * explicitDims.height * 4;
        if (!Number.isSafeInteger(expectedLen) || expectedLen !== analyzed.bytes.byteLength) {
          drawPlaceholderBox(
            builder,
            rect,
            parentStyle,
            "Image",
            fallbackBody("RGBA source size does not match sourceWidth/sourceHeight"),
          );
          break;
        }
      }
      const dims =
        explicitDims ??
        (analyzed.format === "png"
          ? analyzed.width !== undefined && analyzed.height !== undefined
            ? { width: analyzed.width, height: analyzed.height }
            : null
          : inferRgbaDimensions(analyzed.bytes.byteLength, rect.w, rect.h));
      if (!dims) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("unable to infer pixel size"),
        );
        break;
      }

      if (resolvedProtocol.mode === "drawCanvas") {
        const canvasBlobIndex = addBlobAligned(builder, analyzed.bytes);
        if (canvasBlobIndex === null) {
          drawPlaceholderBox(
            builder,
            rect,
            parentStyle,
            "Image",
            fallbackBody("blob allocation failed"),
          );
          break;
        }
        const blitter = resolveCanvasBlitter("auto", true);
        builder.drawCanvas(
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          canvasBlobIndex,
          blitter,
          dims.width,
          dims.height,
        );
        break;
      }

      const blobIndex = addBlobAligned(builder, analyzed.bytes);
      if (blobIndex === null) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("blob allocation failed"),
        );
        break;
      }

      const protocol = resolvedProtocol.protocol;
      builder.drawImage(
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        blobIndex,
        analyzed.format,
        protocol,
        zLayer,
        fit,
        imageId >>> 0,
        dims.width,
        dims.height,
      );
      break;
    }
    default:
      return false;
  }

  return true;
}
