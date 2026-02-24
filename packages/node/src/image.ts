import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_IMAGE_CACHE_MAX_ENTRIES = 100;
const IMAGE_CACHE = new Map<string, Uint8Array>();
let imageCacheMaxEntries = DEFAULT_IMAGE_CACHE_MAX_ENTRIES;

function normalizeCacheMaxEntries(maxEntries: number): number {
  if (!Number.isFinite(maxEntries) || !Number.isInteger(maxEntries) || maxEntries < 0) {
    throw new TypeError("setImageCacheMaxEntries(maxEntries): maxEntries must be a non-negative integer");
  }
  return maxEntries;
}

function evictOverflowEntries(): void {
  while (IMAGE_CACHE.size > imageCacheMaxEntries) {
    const oldest = IMAGE_CACHE.keys().next();
    if (oldest.done) return;
    IMAGE_CACHE.delete(oldest.value);
  }
}

export function setImageCacheMaxEntries(maxEntries: number): void {
  imageCacheMaxEntries = normalizeCacheMaxEntries(maxEntries);
  evictOverflowEntries();
}

export function clearImageCache(): void {
  IMAGE_CACHE.clear();
}

export function loadImage(path: string): Uint8Array {
  if (path.length === 0) {
    throw new TypeError("loadImage(path): path must be a non-empty string");
  }
  const resolvedPath = resolve(path);
  const cached = IMAGE_CACHE.get(resolvedPath);
  if (cached) {
    IMAGE_CACHE.delete(resolvedPath);
    IMAGE_CACHE.set(resolvedPath, cached);
    return cached;
  }
  const bytes = new Uint8Array(readFileSync(resolvedPath));
  IMAGE_CACHE.set(resolvedPath, bytes);
  evictOverflowEntries();
  return bytes;
}
