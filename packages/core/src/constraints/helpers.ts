/**
 * packages/core/src/constraints/helpers.ts — High-level constraint helpers.
 *
 * Why: Most app code should express layout intent without writing raw expression strings.
 * These helpers compile to `expr("...")` using the existing DSL (same determinism/error rules).
 *
 * See: docs/rfc/002-constraint-helper-layer.md
 */

import { expr } from "./expr.js";
import type { ConstraintExpr, RefProp } from "./types.js";

export type ConstraintValue = number | ConstraintExpr;

export type WidgetMetric = "width" | "height" | "minWidth" | "minHeight";
export type SiblingAggregation = "none" | "max" | "sum";

export type SpaceTerm = Readonly<{
  id: string;
  metric?: WidgetMetric;
  aggregation?: SiblingAggregation;
}>;

function invalidArg(fn: string, detail: string): Error {
  const err = new Error(`${fn}: ${detail}`);
  err.name = "ConstraintHelperError";
  return err;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertFiniteNumber(fn: string, name: string, value: unknown): number {
  if (!isFiniteNumber(value)) {
    throw invalidArg(fn, `${name} must be a finite number`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function assertInt32NonNegative(fn: string, name: string, value: unknown): number {
  const n = assertFiniteNumber(fn, name, value);
  const i = Math.trunc(n);
  if (i !== n) throw invalidArg(fn, `${name} must be an integer`);
  if (i < 0) throw invalidArg(fn, `${name} must be >= 0`);
  if (i > 2147483647) throw invalidArg(fn, `${name} must be <= 2147483647`);
  return i;
}

function assertRatio01(fn: string, name: string, value: unknown): number {
  const n = assertFiniteNumber(fn, name, value);
  if (n < 0 || n > 1) throw invalidArg(fn, `${name} must be between 0 and 1 (inclusive)`);
  return n;
}

function assertMinMax(fn: string, min: number, max: number): void {
  if (min > max)
    throw invalidArg(fn, `min must be <= max (got min=${String(min)} max=${String(max)})`);
}

function assertWidgetIdRefable(fn: string, id: unknown): string {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw invalidArg(fn, "id must be a non-empty string");
  }
  if (/\s/.test(id))
    throw invalidArg(fn, `id must not contain whitespace (got ${JSON.stringify(id)})`);
  if (id.includes(".")) throw invalidArg(fn, `id must not contain "." (got ${JSON.stringify(id)})`);
  return id;
}

function formatDslNumber(fn: string, value: number): string {
  // The DSL parser accepts digits with optional decimal point and does NOT support exponent notation.
  if (!Number.isFinite(value))
    throw invalidArg(fn, "internal: attempted to format a non-finite number");
  const raw = String(Object.is(value, -0) ? 0 : value);
  if (!raw.includes("e") && !raw.includes("E")) return raw;

  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(raw);
  if (match === null) {
    throw invalidArg(fn, `internal: unsupported number format ${JSON.stringify(raw)}`);
  }

  const sign = match[1] === "-" ? "-" : "";
  const intPart = match[2] ?? "0";
  const fracPart = match[3] ?? "";
  const exp = Number.parseInt(match[4] ?? "0", 10);
  if (!Number.isFinite(exp))
    throw invalidArg(fn, `internal: invalid exponent in ${JSON.stringify(raw)}`);

  const digits = `${intPart}${fracPart}`.replace(/^0+/, "") || "0";
  const decimalPos = intPart.length + exp;

  let out: string;
  if (digits === "0") {
    out = "0";
  } else if (decimalPos <= 0) {
    out = `0.${"0".repeat(-decimalPos)}${digits}`;
  } else if (decimalPos >= digits.length) {
    out = `${digits}${"0".repeat(decimalPos - digits.length)}`;
  } else {
    out = `${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`;
  }

  if (out.includes(".")) {
    out = out.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (out.length > 64) {
    throw invalidArg(
      fn,
      `number is too large to safely embed in expr(...) (got ${JSON.stringify(raw)})`,
    );
  }
  return `${sign}${out}`;
}

function metricToRefProp(metric: WidgetMetric): RefProp {
  switch (metric) {
    case "width":
      return "w";
    case "height":
      return "h";
    case "minWidth":
      return "min_w";
    case "minHeight":
      return "min_h";
    default:
      return "w";
  }
}

function formatConstraintValue(fn: string, name: string, value: ConstraintValue): string {
  if (typeof value === "number") return formatDslNumber(fn, assertFiniteNumber(fn, name, value));
  return `(${value.source})`;
}

function formatWidgetMetricRef(
  fn: string,
  id: string,
  metric: WidgetMetric,
  aggregation: SiblingAggregation,
): string {
  const safeId = assertWidgetIdRefable(fn, id);
  const prop = metricToRefProp(metric);
  const ref = `#${safeId}.${prop}`;
  switch (aggregation) {
    case "none":
      return ref;
    case "max":
      return `max_sibling(${ref})`;
    case "sum":
      return `sum_sibling(${ref})`;
    default:
      return ref;
  }
}

export const visibilityConstraints = Object.freeze({
  /**
   * Show when viewport width is at least `cols`.
   *
   * Returns a constraint expression suitable for `display: ...`.
   */
  viewportWidthAtLeast(cols: number): ConstraintExpr {
    const fn = "visibilityConstraints.viewportWidthAtLeast";
    const n = assertInt32NonNegative(fn, "cols", cols);
    return expr(`viewport.w >= ${formatDslNumber(fn, n)}`);
  },

  /** Show when viewport width is below `cols`. */
  viewportWidthBelow(cols: number): ConstraintExpr {
    const fn = "visibilityConstraints.viewportWidthBelow";
    const n = assertInt32NonNegative(fn, "cols", cols);
    return expr(`viewport.w < ${formatDslNumber(fn, n)}`);
  },

  /** Show when viewport height is at least `rows`. */
  viewportHeightAtLeast(rows: number): ConstraintExpr {
    const fn = "visibilityConstraints.viewportHeightAtLeast";
    const n = assertInt32NonNegative(fn, "rows", rows);
    return expr(`viewport.h >= ${formatDslNumber(fn, n)}`);
  },

  /** Show when viewport height is below `rows`. */
  viewportHeightBelow(rows: number): ConstraintExpr {
    const fn = "visibilityConstraints.viewportHeightBelow";
    const n = assertInt32NonNegative(fn, "rows", rows);
    return expr(`viewport.h < ${formatDslNumber(fn, n)}`);
  },

  /**
   * Show when the viewport is at least the given size.
   *
   * Use this when a region only makes sense above both a width and height threshold.
   *
   * Returns a constraint expression suitable for `display: ...`.
   */
  viewportAtLeast(options: Readonly<{ width?: number; height?: number }>): ConstraintExpr {
    const fn = "visibilityConstraints.viewportAtLeast";
    const hasWidth = options.width !== undefined;
    const hasHeight = options.height !== undefined;
    if (!hasWidth && !hasHeight) {
      throw invalidArg(fn, "options must specify at least one of width or height");
    }
    const width =
      options.width === undefined
        ? null
        : assertInt32NonNegative(fn, "options.width", options.width);
    const height =
      options.height === undefined
        ? null
        : assertInt32NonNegative(fn, "options.height", options.height);

    if (width !== null && height !== null) {
      return expr(
        `if(viewport.w >= ${formatDslNumber(fn, width)}, viewport.h >= ${formatDslNumber(fn, height)}, 0)`,
      );
    }
    if (width !== null) return expr(`viewport.w >= ${formatDslNumber(fn, width)}`);
    return expr(`viewport.h >= ${formatDslNumber(fn, height ?? 0)}`);
  },
});

export const conditionalConstraints = Object.freeze({
  /**
   * Intent wrapper for `if(cond, then, else)`.
   *
   * Notes:
   * - `cond > 0` is truthy (same as the underlying DSL).
   * - `thenValue` / `elseValue` may be numbers or other constraints for composition.
   */
  ifThenElse(
    cond: ConstraintValue,
    thenValue: ConstraintValue,
    elseValue: ConstraintValue,
  ): ConstraintExpr {
    const fn = "conditionalConstraints.ifThenElse";
    const c = formatConstraintValue(fn, "cond", cond);
    const t = formatConstraintValue(fn, "thenValue", thenValue);
    const e = formatConstraintValue(fn, "elseValue", elseValue);
    return expr(`if(${c}, ${t}, ${e})`);
  },
});

export const widthConstraints = Object.freeze({
  /** `parent.w * ratio` (ratio is 0..1). */
  percentOfParent(ratio: number): ConstraintExpr {
    const fn = "widthConstraints.percentOfParent";
    const r = assertRatio01(fn, "ratio", ratio);
    return expr(`parent.w * ${formatDslNumber(fn, r)}`);
  },

  /** `viewport.w * ratio` (ratio is 0..1). */
  percentOfViewport(ratio: number): ConstraintExpr {
    const fn = "widthConstraints.percentOfViewport";
    const r = assertRatio01(fn, "ratio", ratio);
    return expr(`viewport.w * ${formatDslNumber(fn, r)}`);
  },

  /** `clamp(min, parent.w * ratio, max)` (ratio is 0..1). */
  clampedPercentOfParent(
    options: Readonly<{ ratio: number; min: number; max: number }>,
  ): ConstraintExpr {
    const fn = "widthConstraints.clampedPercentOfParent";
    const ratio = assertRatio01(fn, "options.ratio", options.ratio);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const max = assertFiniteNumber(fn, "options.max", options.max);
    assertMinMax(fn, min, max);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, parent.w * ${formatDslNumber(fn, ratio)}, ${formatDslNumber(fn, max)})`,
    );
  },

  /** `clamp(min, viewport.w - minus, max)` */
  clampedViewportMinus(
    options: Readonly<{ minus: number; min: number; max: number }>,
  ): ConstraintExpr {
    const fn = "widthConstraints.clampedViewportMinus";
    const minus = assertFiniteNumber(fn, "options.minus", options.minus);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const max = assertFiniteNumber(fn, "options.max", options.max);
    assertMinMax(fn, min, max);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, viewport.w - ${formatDslNumber(fn, minus)}, ${formatDslNumber(fn, max)})`,
    );
  },

  /** `max(min, viewport.w * ratio)` (ratio is 0..1). */
  minViewportPercent(options: Readonly<{ ratio: number; min: number }>): ConstraintExpr {
    const fn = "widthConstraints.minViewportPercent";
    const ratio = assertRatio01(fn, "options.ratio", options.ratio);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    return expr(`max(${formatDslNumber(fn, min)}, viewport.w * ${formatDslNumber(fn, ratio)})`);
  },

  /**
   * Breakpoint steps by viewport width using the DSL `steps(...)` function.
   *
   * Semantics:
   * `steps(viewport.w, 80: a, 120: b, 160: c)` yields:
   * - `a` when `viewport.w < 80`
   * - `b` when `viewport.w < 120`
   * - `c` otherwise
   *
   * Notes:
   * - Thresholds must be non-negative int32 and strictly increasing.
   * - Values may be numbers or nested constraints for composition.
   */
  stepsByViewportWidth(
    options: Readonly<{ steps: readonly Readonly<{ below: number; value: ConstraintValue }>[] }>,
  ): ConstraintExpr {
    const fn = "widthConstraints.stepsByViewportWidth";
    const steps = options.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      throw invalidArg(fn, "options.steps must contain at least one step");
    }

    let prev = -1;
    const parts: string[] = ["viewport.w"];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      const below = assertInt32NonNegative(fn, `options.steps[${String(i)}].below`, step.below);
      if (below <= prev) {
        throw invalidArg(fn, "options.steps thresholds must be strictly increasing");
      }
      prev = below;
      parts.push(
        `${formatDslNumber(fn, below)}: ${formatConstraintValue(fn, `options.steps[${String(i)}].value`, step.value)}`,
      );
    }

    return expr(`steps(${parts.join(", ")})`);
  },

  /**
   * Intrinsic-width-aware sizing with padding, clamped to a max bound.
   *
   * Common use: `width: clamp(min, intrinsic.w + pad, parent.w)`
   */
  clampedIntrinsicPlus(
    options: Readonly<{ pad: number; min: number; max?: number | "parent" }>,
  ): ConstraintExpr {
    const fn = "widthConstraints.clampedIntrinsicPlus";
    const pad = assertFiniteNumber(fn, "options.pad", options.pad);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const maxOpt = options.max ?? "parent";
    const maxExpr =
      maxOpt === "parent"
        ? "parent.w"
        : formatDslNumber(fn, assertFiniteNumber(fn, "options.max", maxOpt));
    if (maxOpt !== "parent") assertMinMax(fn, min, maxOpt);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, intrinsic.w + ${formatDslNumber(fn, pad)}, ${maxExpr})`,
    );
  },
});

export const heightConstraints = Object.freeze({
  /** `parent.h * ratio` (ratio is 0..1). */
  percentOfParent(ratio: number): ConstraintExpr {
    const fn = "heightConstraints.percentOfParent";
    const r = assertRatio01(fn, "ratio", ratio);
    return expr(`parent.h * ${formatDslNumber(fn, r)}`);
  },

  /** `viewport.h * ratio` (ratio is 0..1). */
  percentOfViewport(ratio: number): ConstraintExpr {
    const fn = "heightConstraints.percentOfViewport";
    const r = assertRatio01(fn, "ratio", ratio);
    return expr(`viewport.h * ${formatDslNumber(fn, r)}`);
  },

  /** `max(min, viewport.h * ratio)` (ratio is 0..1). */
  minViewportPercent(options: Readonly<{ ratio: number; min: number }>): ConstraintExpr {
    const fn = "heightConstraints.minViewportPercent";
    const ratio = assertRatio01(fn, "options.ratio", options.ratio);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    return expr(`max(${formatDslNumber(fn, min)}, viewport.h * ${formatDslNumber(fn, ratio)})`);
  },

  /**
   * Breakpoint steps by viewport height using the DSL `steps(...)` function.
   *
   * Thresholds must be non-negative int32 and strictly increasing.
   */
  stepsByViewportHeight(
    options: Readonly<{ steps: readonly Readonly<{ below: number; value: ConstraintValue }>[] }>,
  ): ConstraintExpr {
    const fn = "heightConstraints.stepsByViewportHeight";
    const steps = options.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      throw invalidArg(fn, "options.steps must contain at least one step");
    }

    let prev = -1;
    const parts: string[] = ["viewport.h"];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      const below = assertInt32NonNegative(fn, `options.steps[${String(i)}].below`, step.below);
      if (below <= prev) {
        throw invalidArg(fn, "options.steps thresholds must be strictly increasing");
      }
      prev = below;
      parts.push(
        `${formatDslNumber(fn, below)}: ${formatConstraintValue(fn, `options.steps[${String(i)}].value`, step.value)}`,
      );
    }

    return expr(`steps(${parts.join(", ")})`);
  },

  /** `clamp(min, parent.h * ratio, max)` (ratio is 0..1). */
  clampedPercentOfParent(
    options: Readonly<{ ratio: number; min: number; max: number }>,
  ): ConstraintExpr {
    const fn = "heightConstraints.clampedPercentOfParent";
    const ratio = assertRatio01(fn, "options.ratio", options.ratio);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const max = assertFiniteNumber(fn, "options.max", options.max);
    assertMinMax(fn, min, max);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, parent.h * ${formatDslNumber(fn, ratio)}, ${formatDslNumber(fn, max)})`,
    );
  },

  /** `clamp(min, viewport.h * ratio, max)` (ratio is 0..1). */
  clampedPercentOfViewport(
    options: Readonly<{ ratio: number; min: number; max: number }>,
  ): ConstraintExpr {
    const fn = "heightConstraints.clampedPercentOfViewport";
    const ratio = assertRatio01(fn, "options.ratio", options.ratio);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const max = assertFiniteNumber(fn, "options.max", options.max);
    assertMinMax(fn, min, max);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, viewport.h * ${formatDslNumber(fn, ratio)}, ${formatDslNumber(fn, max)})`,
    );
  },

  /** `clamp(min, viewport.h - minus, max)` */
  clampedViewportMinus(
    options: Readonly<{ minus: number; min: number; max: number }>,
  ): ConstraintExpr {
    const fn = "heightConstraints.clampedViewportMinus";
    const minus = assertFiniteNumber(fn, "options.minus", options.minus);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const max = assertFiniteNumber(fn, "options.max", options.max);
    assertMinMax(fn, min, max);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, viewport.h - ${formatDslNumber(fn, minus)}, ${formatDslNumber(fn, max)})`,
    );
  },

  /** `clamp(min, intrinsic.h + pad, parent.h)` (or a numeric max). */
  clampedIntrinsicPlus(
    options: Readonly<{ pad: number; min: number; max?: number | "parent" }>,
  ): ConstraintExpr {
    const fn = "heightConstraints.clampedIntrinsicPlus";
    const pad = assertFiniteNumber(fn, "options.pad", options.pad);
    const min = assertFiniteNumber(fn, "options.min", options.min);
    const maxOpt = options.max ?? "parent";
    const maxExpr =
      maxOpt === "parent"
        ? "parent.h"
        : formatDslNumber(fn, assertFiniteNumber(fn, "options.max", maxOpt));
    if (maxOpt !== "parent") assertMinMax(fn, min, maxOpt);
    return expr(
      `clamp(${formatDslNumber(fn, min)}, intrinsic.h + ${formatDslNumber(fn, pad)}, ${maxExpr})`,
    );
  },
});

export const groupConstraints = Object.freeze({
  /** `max_sibling(#id.w)` */
  maxSiblingWidth(id: string): ConstraintExpr {
    const fn = "groupConstraints.maxSiblingWidth";
    return expr(formatWidgetMetricRef(fn, id, "width", "max"));
  },
  /** `max_sibling(#id.h)` */
  maxSiblingHeight(id: string): ConstraintExpr {
    const fn = "groupConstraints.maxSiblingHeight";
    return expr(formatWidgetMetricRef(fn, id, "height", "max"));
  },
  /** `max_sibling(#id.min_w)` */
  maxSiblingMinWidth(id: string): ConstraintExpr {
    const fn = "groupConstraints.maxSiblingMinWidth";
    return expr(formatWidgetMetricRef(fn, id, "minWidth", "max"));
  },
  /** `max_sibling(#id.min_h)` */
  maxSiblingMinHeight(id: string): ConstraintExpr {
    const fn = "groupConstraints.maxSiblingMinHeight";
    return expr(formatWidgetMetricRef(fn, id, "minHeight", "max"));
  },
  /** `sum_sibling(#id.w)` */
  sumSiblingWidth(id: string): ConstraintExpr {
    const fn = "groupConstraints.sumSiblingWidth";
    return expr(formatWidgetMetricRef(fn, id, "width", "sum"));
  },
  /** `sum_sibling(#id.h)` */
  sumSiblingHeight(id: string): ConstraintExpr {
    const fn = "groupConstraints.sumSiblingHeight";
    return expr(formatWidgetMetricRef(fn, id, "height", "sum"));
  },
  /** `sum_sibling(#id.min_w)` */
  sumSiblingMinWidth(id: string): ConstraintExpr {
    const fn = "groupConstraints.sumSiblingMinWidth";
    return expr(formatWidgetMetricRef(fn, id, "minWidth", "sum"));
  },
  /** `sum_sibling(#id.min_h)` */
  sumSiblingMinHeight(id: string): ConstraintExpr {
    const fn = "groupConstraints.sumSiblingMinHeight";
    return expr(formatWidgetMetricRef(fn, id, "minHeight", "sum"));
  },
});

export const spaceConstraints = Object.freeze({
  /**
   * Remaining width inside the parent after subtracting other terms.
   *
   * Defaults to non-negative output (`max(0, ...)`) to avoid negative sizing surprises.
   *
   * Example:
   * `spaceConstraints.remainingWidth({ subtract: [{ id: "sidebar" }, { id: "rail" }], minus: 1 })`
   * => `max(0, parent.w - #sidebar.w - #rail.w - 1)`
   */
  remainingWidth(
    options: Readonly<{ subtract: readonly SpaceTerm[]; minus?: number; clampMin?: number }>,
  ): ConstraintExpr {
    const fn = "spaceConstraints.remainingWidth";
    const minus =
      options.minus === undefined ? 0 : assertFiniteNumber(fn, "options.minus", options.minus);
    const clampMin =
      options.clampMin === undefined
        ? 0
        : assertFiniteNumber(fn, "options.clampMin", options.clampMin);

    let inner = "parent.w";
    for (const term of options.subtract) {
      const metric = term.metric ?? "width";
      const aggregation = term.aggregation ?? "none";
      inner += ` - ${formatWidgetMetricRef(fn, term.id, metric, aggregation)}`;
    }
    if (minus !== 0) inner += ` - ${formatDslNumber(fn, minus)}`;

    if (clampMin !== 0) {
      return expr(`max(${formatDslNumber(fn, clampMin)}, ${inner})`);
    }
    return expr(`max(0, ${inner})`);
  },

  /** Height variant of `remainingWidth(...)`. */
  remainingHeight(
    options: Readonly<{ subtract: readonly SpaceTerm[]; minus?: number; clampMin?: number }>,
  ): ConstraintExpr {
    const fn = "spaceConstraints.remainingHeight";
    const minus =
      options.minus === undefined ? 0 : assertFiniteNumber(fn, "options.minus", options.minus);
    const clampMin =
      options.clampMin === undefined
        ? 0
        : assertFiniteNumber(fn, "options.clampMin", options.clampMin);

    let inner = "parent.h";
    for (const term of options.subtract) {
      const metric = term.metric ?? "height";
      const aggregation = term.aggregation ?? "none";
      inner += ` - ${formatWidgetMetricRef(fn, term.id, metric, aggregation)}`;
    }
    if (minus !== 0) inner += ` - ${formatDslNumber(fn, minus)}`;

    if (clampMin !== 0) {
      return expr(`max(${formatDslNumber(fn, clampMin)}, ${inner})`);
    }
    return expr(`max(0, ${inner})`);
  },
});
