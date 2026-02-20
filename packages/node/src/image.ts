import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const IMAGE_CACHE = new Map<string, Uint8Array>();

export function loadImage(path: string): Uint8Array {
  if (path.length === 0) {
    throw new TypeError("loadImage(path): path must be a non-empty string");
  }
  const resolvedPath = resolve(path);
  const cached = IMAGE_CACHE.get(resolvedPath);
  if (cached) return cached;
  const bytes = new Uint8Array(readFileSync(resolvedPath));
  IMAGE_CACHE.set(resolvedPath, bytes);
  return bytes;
}
