/**
 * packages/core/src/layout/validateProps.ts — Widget props validation.
 *
 * Why: Validates widget props before layout, ensuring all values are within
 * expected ranges and types. Returns structured fatal errors for invalid props
 * rather than throwing, enabling deterministic error reporting.
 *
 * Validation rules:
 *   - Numeric props must be int32 >= 0 (pad, gap, size)
 *   - Padding props accept int32 >= 0 OR spacing keys ("sm", "md", etc.)
 *   - Margin props accept signed int32 OR spacing keys ("sm", "md", etc.)
 *   - String props must be non-empty where required (id)
 *   - Enum props must be valid values (align, border)
 *   - Boolean props default to false if undefined
 *
 * @see docs/guide/layout.md
 */

import type {
  Align,
  BoxProps,
  ButtonProps,
  InputProps,
  SpacerProps,
  StackProps,
  TextProps,
} from "../index.js";
import { SPACING_SCALE, isSpacingKey } from "./spacing-scale.js";
import type { SizeConstraint } from "./types.js";

/** Fatal error type for invalid widget props. */
export type InvalidPropsFatal = Readonly<{ code: "ZRUI_INVALID_PROPS"; detail: string }>;

/**
 * Layout operation result: success with value, or failure with fatal error.
 * Used throughout layout system to propagate validation failures upward.
 */
export type LayoutResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; fatal: InvalidPropsFatal }>;

/* --- Validated Props Types (with defaults applied and types guaranteed) --- */

export type ValidatedLayoutConstraints = Readonly<{
  width?: SizeConstraint;
  height?: SizeConstraint;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flex?: number;
  aspectRatio?: number;
}>;

export type ValidatedSpacingProps = Readonly<{
  p?: number;
  px?: number;
  py?: number;
  pt?: number;
  pb?: number;
  pl?: number;
  pr?: number;
  m?: number;
  mx?: number;
  my?: number;
  mt?: number;
  mr?: number;
  mb?: number;
  ml?: number;
}>;

export type ValidatedStackProps = Readonly<
  {
    pad: number;
    gap: number;
    align: Align;
    justify: "start" | "end" | "center" | "between" | "around" | "evenly";
  } & ValidatedSpacingProps &
    ValidatedLayoutConstraints
>;
export type ValidatedBoxProps = Readonly<
  {
    pad: number;
    border: "none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed";
    borderTop: boolean;
    borderRight: boolean;
    borderBottom: boolean;
    borderLeft: boolean;
  } & ValidatedSpacingProps &
    ValidatedLayoutConstraints
>;
export type ValidatedSpacerProps = Readonly<{ size: number; flex: number }>;
export type ValidatedButtonProps = Readonly<{ id: string; label: string; disabled: boolean }>;
export type ValidatedInputProps = Readonly<{ id: string; value: string; disabled: boolean }>;
export type ValidatedTextProps = Readonly<{ maxWidth?: number }>;

type LayoutConstraintPropBag = Readonly<{
  width?: unknown;
  height?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  minHeight?: unknown;
  maxHeight?: unknown;
  flex?: unknown;
  aspectRatio?: unknown;
}>;

type StackPropBag = Readonly<
  {
    pad?: unknown;
    gap?: unknown;
    align?: unknown;
    items?: unknown;
    justify?: unknown;
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
  } & LayoutConstraintPropBag
>;

type BoxPropBag = Readonly<
  {
    pad?: unknown;
    border?: unknown;
    borderTop?: unknown;
    borderRight?: unknown;
    borderBottom?: unknown;
    borderLeft?: unknown;
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
  } & LayoutConstraintPropBag
>;

function invalid(detail: string): LayoutResult<never> {
  return { ok: false, fatal: { code: "ZRUI_INVALID_PROPS", detail } };
}

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

function requireIntNonNegative(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const value = v === undefined ? def : v;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > I32_MAX) {
    return invalid(`${kind}.${name} must be an int32 >= 0`);
  }
  return { ok: true, value: value as number };
}

function requireIntSigned(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const value = v === undefined ? def : v;
  if (typeof value !== "number" || !Number.isInteger(value) || value < I32_MIN || value > I32_MAX) {
    return invalid(`${kind}.${name} must be an int32`);
  }
  return { ok: true, value: value as number };
}

function requireSpacingIntNonNegative(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const value = v === undefined ? def : v;
  if (typeof value === "string") {
    if (!isSpacingKey(value)) {
      return invalid(
        `${kind}.${name} must be an int32 >= 0 or a spacing key ("none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl")`,
      );
    }
    return { ok: true, value: SPACING_SCALE[value] };
  }
  return requireIntNonNegative(kind, name, value, def);
}

function requireSpacingIntSigned(
  kind: string,
  name: string,
  v: unknown,
  def: number,
): LayoutResult<number> {
  const value = v === undefined ? def : v;
  if (typeof value === "string") {
    if (!isSpacingKey(value)) {
      return invalid(
        `${kind}.${name} must be an int32 or a spacing key ("none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl")`,
      );
    }
    return { ok: true, value: SPACING_SCALE[value] };
  }
  return requireIntSigned(kind, name, value, def);
}

function requireOptionalIntNonNegative(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<number | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  const res = requireIntNonNegative(kind, name, v, 0);
  if (!res.ok) return res;
  return { ok: true, value: res.value };
}

function requireString(kind: string, name: string, v: unknown): LayoutResult<string> {
  if (typeof v !== "string") {
    return invalid(`${kind}.${name} must be a string`);
  }
  return { ok: true, value: v };
}

function requireNonEmptyString(kind: string, name: string, v: unknown): LayoutResult<string> {
  const res = requireString(kind, name, v);
  if (!res.ok) return res;
  if (res.value.length === 0) return invalid(`${kind}.${name} must be a non-empty string`);
  return res;
}

function requireBoolean(
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

function parsePercent(kind: string, name: string, raw: string): LayoutResult<`${number}%`> {
  if (raw === "auto") {
    return invalid(`${kind}.${name} must be a number | "<n>%" | "auto"`);
  }
  const m = /^(\d+(?:\.\d+)?)%$/.exec(raw);
  if (!m) return invalid(`${kind}.${name} must be a number | "<n>%" | "auto"`);
  const n = Number.parseFloat(m[1] ?? "");
  if (!Number.isFinite(n) || n < 0)
    return invalid(`${kind}.${name} must be a number | "<n>%" | "auto"`);
  return { ok: true, value: raw as `${number}%` };
}

function requireSizeConstraint(
  kind: string,
  name: string,
  v: unknown,
): LayoutResult<SizeConstraint | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === "auto") return { ok: true, value: "auto" };
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v < 0 || v > I32_MAX)
      return invalid(`${kind}.${name} must be an int32 >= 0`);
    return { ok: true, value: v };
  }
  if (typeof v === "string") {
    const pct = parsePercent(kind, name, v);
    if (!pct.ok) return pct;
    return { ok: true, value: pct.value };
  }
  return invalid(`${kind}.${name} must be a number | "<n>%" | "auto"`);
}

function requireFlex(kind: string, v: unknown): LayoutResult<number | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    return invalid(`${kind}.flex must be a number >= 0`);
  }
  return { ok: true, value: v };
}

function requireAspectRatio(kind: string, v: unknown): LayoutResult<number | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    return invalid(`${kind}.aspectRatio must be a finite number > 0`);
  }
  return { ok: true, value: v };
}

function validateSpacingProps(
  kind: string,
  p: Record<string, unknown>,
): LayoutResult<ValidatedSpacingProps> {
  const paddingKeys = ["p", "px", "py", "pt", "pb", "pl", "pr"] as const;
  const marginKeys = ["m", "mx", "my", "mt", "mr", "mb", "ml"] as const;
  const out: Record<string, number> = {};

  for (const k of paddingKeys) {
    const v = p[k];
    if (v === undefined) continue;
    const r = requireSpacingIntNonNegative(kind, k, v, 0);
    if (!r.ok) return r;
    out[k] = r.value;
  }

  for (const k of marginKeys) {
    const v = p[k];
    if (v === undefined) continue;
    const r = requireSpacingIntSigned(kind, k, v, 0);
    if (!r.ok) return r;
    out[k] = r.value;
  }

  return { ok: true, value: out as unknown as ValidatedSpacingProps };
}

function validateMinMax(
  kind: string,
  minName: string,
  maxName: string,
  minV: number | undefined,
  maxV: number | undefined,
): LayoutResult<true> {
  if (minV !== undefined && maxV !== undefined && minV > maxV) {
    return invalid(`${kind}.${minName} must be <= ${kind}.${maxName}`);
  }
  return { ok: true, value: true };
}

function validateLayoutConstraints(
  kind: string,
  p: LayoutConstraintPropBag,
): LayoutResult<ValidatedLayoutConstraints> {
  const widthRes = requireSizeConstraint(kind, "width", p.width);
  if (!widthRes.ok) return widthRes;
  const heightRes = requireSizeConstraint(kind, "height", p.height);
  if (!heightRes.ok) return heightRes;

  const minWidthRes = requireOptionalIntNonNegative(kind, "minWidth", p.minWidth);
  if (!minWidthRes.ok) return minWidthRes;
  const maxWidthRes = requireOptionalIntNonNegative(kind, "maxWidth", p.maxWidth);
  if (!maxWidthRes.ok) return maxWidthRes;
  const minHeightRes = requireOptionalIntNonNegative(kind, "minHeight", p.minHeight);
  if (!minHeightRes.ok) return minHeightRes;
  const maxHeightRes = requireOptionalIntNonNegative(kind, "maxHeight", p.maxHeight);
  if (!maxHeightRes.ok) return maxHeightRes;

  const mmw = validateMinMax(kind, "minWidth", "maxWidth", minWidthRes.value, maxWidthRes.value);
  if (!mmw.ok) return mmw;
  const mmh = validateMinMax(
    kind,
    "minHeight",
    "maxHeight",
    minHeightRes.value,
    maxHeightRes.value,
  );
  if (!mmh.ok) return mmh;

  const flexRes = requireFlex(kind, p.flex);
  if (!flexRes.ok) return flexRes;
  const arRes = requireAspectRatio(kind, p.aspectRatio);
  if (!arRes.ok) return arRes;

  return {
    ok: true,
    value: {
      ...(widthRes.value === undefined ? {} : { width: widthRes.value }),
      ...(heightRes.value === undefined ? {} : { height: heightRes.value }),
      ...(minWidthRes.value === undefined ? {} : { minWidth: minWidthRes.value }),
      ...(maxWidthRes.value === undefined ? {} : { maxWidth: maxWidthRes.value }),
      ...(minHeightRes.value === undefined ? {} : { minHeight: minHeightRes.value }),
      ...(maxHeightRes.value === undefined ? {} : { maxHeight: maxHeightRes.value }),
      ...(flexRes.value === undefined ? {} : { flex: flexRes.value }),
      ...(arRes.value === undefined ? {} : { aspectRatio: arRes.value }),
    },
  };
}

/** Validate Row/Column props: pad (default 0), gap (default 0), align (default "start"). */
export function validateStackProps(
  kind: "row" | "column",
  props: StackProps | unknown,
): LayoutResult<ValidatedStackProps> {
  const p = (props ?? {}) as StackPropBag;

  const padRes = requireSpacingIntNonNegative(kind, "pad", p.pad, 0);
  if (!padRes.ok) return padRes;
  const gapRes = requireSpacingIntNonNegative(kind, "gap", p.gap, 0);
  if (!gapRes.ok) return gapRes;

  const alignRaw = p.items ?? p.align;
  const alignValue = alignRaw === undefined ? "start" : alignRaw;
  if (
    alignValue !== "start" &&
    alignValue !== "center" &&
    alignValue !== "end" &&
    alignValue !== "stretch"
  ) {
    return invalid(`${kind}.align must be one of "start" | "center" | "end" | "stretch"`);
  }

  const justifyValue = p.justify === undefined ? "start" : p.justify;
  if (
    justifyValue !== "start" &&
    justifyValue !== "end" &&
    justifyValue !== "center" &&
    justifyValue !== "between" &&
    justifyValue !== "around" &&
    justifyValue !== "evenly"
  ) {
    return invalid(
      `${kind}.justify must be one of "start" | "end" | "center" | "between" | "around" | "evenly"`,
    );
  }

  const lcRes = validateLayoutConstraints(kind, p);
  if (!lcRes.ok) return lcRes;

  const spRes = validateSpacingProps(kind, p as unknown as Record<string, unknown>);
  if (!spRes.ok) return spRes;

  return {
    ok: true,
    value: {
      pad: padRes.value,
      gap: gapRes.value,
      align: alignValue,
      justify: justifyValue,
      ...spRes.value,
      ...lcRes.value,
    },
  };
}

/** Validate Box props: pad (default 0), border (default "single"). */
export function validateBoxProps(props: BoxProps | unknown): LayoutResult<ValidatedBoxProps> {
  const p = (props ?? {}) as BoxPropBag;

  const padRes = requireSpacingIntNonNegative("box", "pad", p.pad, 0);
  if (!padRes.ok) return padRes;

  const borderValue = p.border === undefined ? "single" : p.border;
  if (
    borderValue !== "none" &&
    borderValue !== "single" &&
    borderValue !== "double" &&
    borderValue !== "rounded" &&
    borderValue !== "heavy" &&
    borderValue !== "dashed" &&
    borderValue !== "heavy-dashed"
  ) {
    return invalid(
      'box.border must be one of "none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed"',
    );
  }

  const defaultSide = borderValue !== "none";
  const topRes = requireBoolean("box", "borderTop", p.borderTop, defaultSide);
  if (!topRes.ok) return topRes;
  const rightRes = requireBoolean("box", "borderRight", p.borderRight, defaultSide);
  if (!rightRes.ok) return rightRes;
  const bottomRes = requireBoolean("box", "borderBottom", p.borderBottom, defaultSide);
  if (!bottomRes.ok) return bottomRes;
  const leftRes = requireBoolean("box", "borderLeft", p.borderLeft, defaultSide);
  if (!leftRes.ok) return leftRes;

  const lcRes = validateLayoutConstraints("box", p);
  if (!lcRes.ok) return lcRes;

  const spRes = validateSpacingProps("box", p as unknown as Record<string, unknown>);
  if (!spRes.ok) return spRes;

  return {
    ok: true,
    value: {
      pad: padRes.value,
      border: borderValue,
      borderTop: topRes.value,
      borderRight: rightRes.value,
      borderBottom: bottomRes.value,
      borderLeft: leftRes.value,
      ...spRes.value,
      ...lcRes.value,
    },
  };
}

/** Validate Spacer props: size (default 1). */
export function validateSpacerProps(
  props: SpacerProps | unknown,
): LayoutResult<ValidatedSpacerProps> {
  const p = (props ?? {}) as { size?: unknown; flex?: unknown };
  const flexRes = requireFlex("spacer", p.flex);
  if (!flexRes.ok) return flexRes;
  const flex = flexRes.value ?? 0;
  const defaultSize = flex > 0 ? 0 : 1;
  const sizeRes = requireIntNonNegative("spacer", "size", p.size, defaultSize);
  if (!sizeRes.ok) return sizeRes;
  return { ok: true, value: { size: sizeRes.value, flex } };
}

/** Validate Button props: id (required), label (required), disabled (default false). */
export function validateButtonProps(
  props: ButtonProps | unknown,
): LayoutResult<ValidatedButtonProps> {
  const p = (props ?? {}) as { id?: unknown; label?: unknown; disabled?: unknown };
  const idRes = requireString("button", "id", p.id);
  if (!idRes.ok) return idRes;
  const labelRes = requireString("button", "label", p.label);
  if (!labelRes.ok) return labelRes;
  const disabledRes = requireBoolean("button", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  return {
    ok: true,
    value: { id: idRes.value, label: labelRes.value, disabled: disabledRes.value },
  };
}

/** Validate Input props: id (required, non-empty), value (required), disabled (default false). */
export function validateInputProps(props: InputProps | unknown): LayoutResult<ValidatedInputProps> {
  const p = (props ?? {}) as { id?: unknown; value?: unknown; disabled?: unknown };
  const idRes = requireNonEmptyString("input", "id", p.id);
  if (!idRes.ok) return idRes;
  const valueRes = requireString("input", "value", p.value);
  if (!valueRes.ok) return valueRes;
  const disabledRes = requireBoolean("input", "disabled", p.disabled, false);
  if (!disabledRes.ok) return disabledRes;
  return {
    ok: true,
    value: { id: idRes.value, value: valueRes.value, disabled: disabledRes.value },
  };
}

/** Validate Text props (`maxWidth` affects measurement; style/overflow are renderer concerns). */
export function validateTextProps(props: TextProps | unknown): LayoutResult<ValidatedTextProps> {
  const p = (props ?? {}) as { maxWidth?: unknown };
  const maxWidthRes = requireOptionalIntNonNegative("text", "maxWidth", p.maxWidth);
  if (!maxWidthRes.ok) return maxWidthRes;

  return {
    ok: true,
    value: maxWidthRes.value === undefined ? {} : { maxWidth: maxWidthRes.value },
  };
}
