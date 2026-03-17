import { isConstraintExpr } from "../../constraints/expr.js";
import type { ConstraintExpr } from "../../constraints/types.js";
import { resolveResponsiveValue } from "../responsive.js";
import { SPACING_SCALE, isSpacingKey } from "../spacing-scale.js";
import type { DisplayConstraint, SizeConstraint } from "../types.js";
import { type LayoutResult, invalid, invalidProp } from "./shared.js";

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

export function normalizeStringToken(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.trim().toLowerCase();
}

function isResponsiveBreakpointMap(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if ((value as { kind?: unknown }).kind === "fluid") return false;
  const record = value as Record<string, unknown>;
  return "sm" in record || "md" in record || "lg" in record || "xl" in record;
}

export function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function parseCoercedInt(value: unknown): number | undefined {
  const n = parseFiniteNumber(value);
  if (n === undefined) return undefined;
  return Math.trunc(n);
}

export function requireIntNonNegative(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const resolved = resolveResponsiveValue(v);
  const value = resolved === undefined ? def : resolved;
  const n = parseFiniteNumber(value);
  if (n === undefined || n < 0) {
    return invalid(`${kind}.${name} must be an int32 >= 0`);
  }
  const parsed = Math.trunc(n);
  if (parsed > I32_MAX) return invalid(`${kind}.${name} must be an int32 >= 0`);
  return { ok: true, value: parsed };
}

export function requireIntSigned(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const resolved = resolveResponsiveValue(v);
  const value = resolved === undefined ? def : resolved;
  const parsed = parseCoercedInt(value);
  if (parsed === undefined || parsed < I32_MIN || parsed > I32_MAX) {
    return invalid(`${kind}.${name} must be an int32`);
  }
  return { ok: true, value: parsed };
}

export function requireSpacingIntNonNegative(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const resolved = resolveResponsiveValue(v);
  const value = resolved === undefined ? def : resolved;
  if (typeof value === "string") {
    const normalized = normalizeStringToken(value);
    if (typeof normalized === "string" && isSpacingKey(normalized)) {
      return { ok: true, value: SPACING_SCALE[normalized] };
    }
  }
  return requireIntNonNegative(kind, name, value, def);
}

export function requireSpacingIntSigned(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const resolved = resolveResponsiveValue(v);
  const value = resolved === undefined ? def : resolved;
  if (typeof value === "string") {
    const normalized = normalizeStringToken(value);
    if (typeof normalized === "string" && isSpacingKey(normalized)) {
      return { ok: true, value: SPACING_SCALE[normalized] };
    }
  }
  return requireIntSigned(kind, name, value, def);
}

export function requireOptionalIntNonNegative(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  const res = requireIntNonNegative(kind, name, resolved, 0);
  if (!res.ok) return res;
  return { ok: true, value: res.value };
}

export function requireOptionalIntNonNegativeOrConstraint(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<number | ConstraintExpr | undefined> {
  if (isResponsiveBreakpointMap(v)) {
    return invalid(
      `${kind}.${name} no longer supports responsive maps. Use expr("steps(...)") or fluid(...) instead.`,
    );
  }
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (isConstraintExpr(resolved)) return { ok: true, value: resolved };
  const res = requireIntNonNegative(kind, name, resolved, 0);
  if (!res.ok) return res;
  return { ok: true, value: res.value };
}

export function requireOptionalIntSigned(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  const res = requireIntSigned(kind, name, resolved, 0);
  if (!res.ok) return res;
  return { ok: true, value: res.value };
}

export function requireString(kind: string, name: string, v: unknown): LayoutResult<string> {
  if (typeof v !== "string") {
    return invalid(`${kind}.${name} must be a string`);
  }
  return { ok: true, value: v };
}

export function requireNonEmptyString(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<string> {
  const res = requireString(kind, name, v);
  if (!res.ok) return res;
  if (res.value.length === 0) return invalid(`${kind}.${name} must be a non-empty string`);
  return res;
}

export function requireOptionalString(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<string | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  return requireString(kind, name, v);
}

export function requireFiniteNumber(kind: string, name: string, v: unknown): LayoutResult<number> {
  const parsed = parseFiniteNumber(resolveResponsiveValue(v));
  if (parsed === undefined) {
    return invalid(`${kind}.${name} must be a finite number`);
  }
  return { ok: true, value: parsed };
}

export function requireOptionalFiniteNumber(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<number | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  return requireFiniteNumber(kind, name, v);
}

export function requireBoolean(
  kind: string,
  name: string,
  v: unknown,
  def: boolean,
): LayoutResult<boolean> {
  const value = v === undefined ? def : v;
  if (typeof value !== "boolean") {
    return invalid(`${kind}.${name} must be a boolean`);
  }
  return { ok: true, value };
}

export function requireOverflow(
  kind: string,
  name: string,
  v: unknown,
  def: "visible" | "hidden" | "scroll",
): LayoutResult<"visible" | "hidden" | "scroll"> {
  const resolved = resolveResponsiveValue(v);
  const value = resolved === undefined ? def : resolved;
  const normalized = normalizeStringToken(value);
  if (normalized === "visible" || normalized === "hidden" || normalized === "scroll") {
    return { ok: true, value: normalized };
  }
  return invalid(`${kind}.${name} must be one of "visible" | "hidden" | "scroll"`);
}

export function requireSizeConstraint(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<SizeConstraint | undefined> {
  if (isResponsiveBreakpointMap(v)) {
    return invalid(
      `${kind}.${name} no longer supports responsive maps. Use expr("steps(...)") or fluid(...) instead.`,
    );
  }
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (isConstraintExpr(resolved)) return { ok: true, value: resolved };
  if (typeof resolved === "string") {
    const normalized = normalizeStringToken(resolved);
    if (normalized === "auto") return { ok: true, value: "auto" };
    if (normalized === "full") return { ok: true, value: "full" };
    if (typeof normalized === "string" && normalized.endsWith("%")) {
      return invalid(
        `${kind}.${name} no longer supports percentage strings. Use expr("parent.${name === "height" ? "h" : "w"} * <ratio>") instead.`,
      );
    }
    const parsed = parseCoercedInt(normalized);
    if (parsed === undefined || parsed < 0 || parsed > I32_MAX) {
      return invalidProp(kind, name, 'number | "full" | "auto" | fluid(...) | expr(...)', resolved);
    }
    return { ok: true, value: parsed };
  }
  if (typeof resolved === "number") {
    const parsed = parseCoercedInt(resolved);
    if (parsed === undefined || parsed < 0 || parsed > I32_MAX) {
      return invalidProp(kind, name, "non-negative integer", resolved);
    }
    return { ok: true, value: parsed };
  }
  return invalidProp(kind, name, 'number | "full" | "auto" | fluid(...) | expr(...)', resolved);
}

export function requireDisplayConstraint(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<DisplayConstraint | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (isResponsiveBreakpointMap(v)) {
    return invalid(
      `${kind}.${name} no longer supports responsive maps. Use expr("steps(...)") instead.`,
    );
  }
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (typeof resolved === "boolean") return { ok: true, value: resolved };
  if (isConstraintExpr(resolved)) return { ok: true, value: resolved };
  return invalidProp(kind, name, "boolean | expr(...)", resolved);
}

export function requireOptionalTextMaxWidth(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<number | ConstraintExpr | undefined> {
  if (isResponsiveBreakpointMap(v)) {
    return invalid(
      `${kind}.${name} no longer supports responsive maps. Use expr("steps(...)") or fluid(...) instead.`,
    );
  }
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (isConstraintExpr(resolved)) return { ok: true, value: resolved };
  if (resolved === "full" || resolved === "auto") return { ok: true, value: undefined };
  if (typeof resolved === "string" && resolved.trim().endsWith("%")) {
    return invalid(
      `${kind}.${name} no longer supports percentage strings. Use expr("parent.w * <ratio>") instead.`,
    );
  }
  const res = requireIntNonNegative(kind, name, resolved, 0);
  if (!res.ok) return res;
  return { ok: true, value: res.value };
}

export function requireFlex(kind: string, v: unknown): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < 0) {
    return invalid(`${kind}.flex must be a number >= 0`);
  }
  return { ok: true, value: resolved };
}

export function requireFlexShrink(kind: string, v: unknown): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < 0) {
    return invalid(`${kind}.flexShrink must be a number >= 0`);
  }
  return { ok: true, value: resolved };
}

export function requireAspectRatio(kind: string, v: unknown): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved <= 0) {
    return invalid(`${kind}.aspectRatio must be a finite number > 0`);
  }
  return { ok: true, value: resolved };
}

export function requireAlignSelf(
  kind: string,
  v: unknown,
): LayoutResult<"auto" | "start" | "center" | "end" | "stretch" | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  const normalized = normalizeStringToken(resolved);
  if (
    normalized === "auto" ||
    normalized === "start" ||
    normalized === "center" ||
    normalized === "end" ||
    normalized === "stretch"
  ) {
    return { ok: true, value: normalized };
  }
  return invalid(
    `${kind}.alignSelf must be one of "auto" | "start" | "center" | "end" | "stretch"`,
  );
}

export function requirePosition(
  kind: string,
  v: unknown,
): LayoutResult<"static" | "absolute" | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  const normalized = normalizeStringToken(resolved);
  if (normalized === "static" || normalized === "absolute") {
    return { ok: true, value: normalized };
  }
  return invalid(`${kind}.position must be one of "static" | "absolute"`);
}

export function requireGridStart(
  kind: string,
  name: "gridColumn" | "gridRow",
  v: unknown,
): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  const parsed = parseCoercedInt(resolved);
  if (parsed === undefined || parsed < 1 || parsed > I32_MAX) {
    return invalid(`${kind}.${name} must be an int32 >= 1`);
  }
  return { ok: true, value: parsed };
}

export function requireGridSpan(
  kind: string,
  name: "colSpan" | "rowSpan",
  v: unknown,
): LayoutResult<number | undefined> {
  const resolved = resolveResponsiveValue(v);
  if (resolved === undefined) return { ok: true, value: undefined };
  const parsed = parseCoercedInt(resolved);
  if (parsed === undefined || parsed < 1 || parsed > I32_MAX) {
    return invalid(`${kind}.${name} must be an int32 >= 1`);
  }
  return { ok: true, value: parsed };
}
