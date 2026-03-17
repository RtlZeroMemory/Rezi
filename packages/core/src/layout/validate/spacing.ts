import type { ConstraintExpr } from "../../constraints/types.js";
import { requireSpacingIntNonNegative, requireSpacingIntSigned } from "./primitives.js";
import { type LayoutResult, invalid } from "./shared.js";

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

export function validateSpacingProps(
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

export function validateMinMax(
  kind: string,
  minName: string,
  maxName: string,
  minV: number | ConstraintExpr | undefined,
  maxV: number | ConstraintExpr | undefined,
): LayoutResult<true> {
  if (typeof minV === "number" && typeof maxV === "number" && minV > maxV) {
    return invalid(`${kind}.${minName} must be <= ${kind}.${maxName}`);
  }
  return { ok: true, value: true };
}
