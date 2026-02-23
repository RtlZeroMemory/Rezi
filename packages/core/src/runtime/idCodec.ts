/**
 * Shared ID segment encoding/decoding for compound widget IDs.
 *
 * Used by tabs, accordion, breadcrumb, and any future widget that
 * encodes user-provided strings into focus/routing IDs.
 */

/**
 * Encode a user-provided string for safe embedding in compound IDs.
 * Empty strings encode to an empty segment; callers that need parse round-trips
 * should pass non-empty segment values.
 */
export function encodeIdSegment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Decode an ID segment back to the original string.
 * Returns null if the segment is empty or cannot be decoded.
 */
export function decodeIdSegment(value: string): string | null {
  if (value.length === 0) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Build a compound ID from a prefix and encoded segments.
 */
export function makeCompoundId(prefix: string, ...segments: readonly string[]): string {
  return `${prefix}:${segments.map(encodeIdSegment).join(":")}`;
}

/**
 * Parse a compound ID, returning null if prefix doesn't match or segments are invalid.
 */
export function parseCompoundId(
  id: string,
  prefix: string,
  expectedSegments: number,
): readonly string[] | null {
  if (!id.startsWith(`${prefix}:`)) return null;
  const body = id.slice(prefix.length + 1);
  const parts = body.split(":");
  if (parts.length !== expectedSegments) return null;
  const decoded: string[] = [];
  for (const part of parts) {
    if (part.length === 0) return null;
    const d = decodeIdSegment(part);
    if (d === null) return null;
    decoded.push(d);
  }
  return decoded;
}
