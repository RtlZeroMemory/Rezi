/**
 * packages/core/src/repro/stable.ts - Deterministic repro serialization.
 *
 * Why: Repro bundles must produce stable bytes for equivalent content to make
 * diffs, hashing, and replay artifacts deterministic.
 */

import type { ReproBundle } from "./types.js";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ",";
      const item = value[i];
      out += stableJson(item === undefined ? null : item);
    }
    out += "]";
    return out;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  let out = "{";
  let first = true;
  for (const key of keys) {
    const current = obj[key];
    if (current === undefined) continue;
    if (!first) out += ",";
    first = false;
    out += `${JSON.stringify(key)}:${stableJson(current)}`;
  }
  out += "}";
  return out;
}

/**
 * Serialize a bundle to deterministic JSON:
 * - object keys sorted lexicographically
 * - array order preserved
 * - undefined object fields omitted
 */
export function serializeReproBundleStable(bundle: ReproBundle): string {
  return stableJson(bundle);
}

/**
 * Export deterministic UTF-8 bytes for a repro bundle.
 */
export function exportReproBundleBytes(bundle: ReproBundle): Uint8Array {
  return new TextEncoder().encode(serializeReproBundleStable(bundle));
}
