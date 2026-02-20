import type { ImageFit, ImageProtocol } from "./types.js";

export type ImageBinaryFormat = "png" | "rgba";

export type ImageSourceAnalysis = Readonly<{
  ok: boolean;
  format?: ImageBinaryFormat;
  bytes?: Uint8Array;
  error?: string;
}>;

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPngBuffer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength) return false;
  for (let index = 0; index < PNG_SIGNATURE.byteLength; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

export function detectImageFormat(bytes: Uint8Array): ImageBinaryFormat {
  return isPngBuffer(bytes) ? "png" : "rgba";
}

export function analyzeImageSource(src: Uint8Array): ImageSourceAnalysis {
  if (!(src instanceof Uint8Array)) {
    return Object.freeze({ ok: false, error: "src must be a Uint8Array" });
  }
  if (src.byteLength === 0) {
    return Object.freeze({ ok: false, error: "src is empty" });
  }
  return Object.freeze({
    ok: true,
    bytes: src,
    format: detectImageFormat(src),
  });
}

export function normalizeImageFit(fit: ImageFit | undefined): ImageFit {
  switch (fit) {
    case "fill":
    case "contain":
    case "cover":
      return fit;
    default:
      return "contain";
  }
}

export function normalizeImageProtocol(protocol: ImageProtocol | undefined): ImageProtocol {
  switch (protocol) {
    case "auto":
    case "kitty":
    case "sixel":
    case "iterm2":
    case "blitter":
      return protocol;
    default:
      return "auto";
  }
}

export function hashImageBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.byteLength; index++) {
    hash ^= bytes[index] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
