/** Fatal error type for invalid widget props. */
export type InvalidPropsFatal = Readonly<{ code: "ZRUI_INVALID_PROPS"; detail: string }>;

/**
 * Layout operation result: success with value, or failure with fatal error.
 * Used throughout layout system to propagate validation failures upward.
 */
export type LayoutResult<T> =
  | Readonly<{ ok: true; value: T; warnings?: readonly string[] }>
  | Readonly<{ ok: false; fatal: InvalidPropsFatal }>;

export function invalid(detail: string): LayoutResult<never> {
  return { ok: false, fatal: { code: "ZRUI_INVALID_PROPS", detail } };
}

export function describeReceivedType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function invalidProp(
  kind: string,
  name: string,
  expected: string,
  received: unknown,
): LayoutResult<never> {
  return invalid(
    `Invalid prop "${name}" on <${kind}>: expected ${expected}, ` +
      `got ${describeReceivedType(received)} (${String(received)})`,
  );
}
