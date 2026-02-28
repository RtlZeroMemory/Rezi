/**
 * packages/core/src/constraints/resolver.ts — Constraint expression evaluator/resolver.
 *
 * Why: Resolves parsed expressions against deterministic runtime inputs.
 */

import type { InstanceId } from "../runtime/instance.js";
import type { ConstraintGraph, ConstraintNodeProp } from "./graph.js";
import type { AggregationName, BinaryOp, CompareOp, ExprNode, RefProp, RefScope } from "./types.js";

export type RefValues = Readonly<{
  w: number;
  h: number;
  min_w: number;
  min_h: number;
}>;

export type RefValuesInput = Readonly<Partial<RefValues>>;

export type ResolvedConstraintValues = Readonly<{
  width?: number;
  height?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flexBasis?: number;
  display?: number;
}>;

type MutableResolvedConstraintValues = {
  width?: number;
  height?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flexBasis?: number;
  display?: number;
};

export type EvaluationContext = Readonly<{
  viewport: RefValues;
  parent: RefValues;
  intrinsic: RefValues | null;
  source?: string;
  resolveWidgetRef?: (id: string, prop: RefProp) => number;
  resolveAggregation?: (name: AggregationName, id: string, prop: RefProp) => number;
}>;

export type ConstraintResolutionOptions = Readonly<{
  viewport: Readonly<{ w: number; h: number }>;
  parent: Readonly<{ w: number; h: number }>;
  baseValues?: ReadonlyMap<InstanceId, ResolvedConstraintValues>;
  parentValues?: ReadonlyMap<InstanceId, RefValuesInput>;
  intrinsicValues?: ReadonlyMap<InstanceId, RefValuesInput>;
  cache?: ConstraintResolutionCache;
  cacheKey?: string;
}>;

export type ConstraintResolutionResult = Readonly<{
  values: ReadonlyMap<InstanceId, ResolvedConstraintValues>;
  cacheHit: boolean;
}>;

function sanitizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeRefValues(
  input: RefValuesInput | null | undefined,
  fallback: RefValues,
): RefValues {
  return {
    w: sanitizeFinite(input?.w ?? fallback.w),
    h: sanitizeFinite(input?.h ?? fallback.h),
    min_w: sanitizeFinite(input?.min_w ?? input?.w ?? fallback.min_w),
    min_h: sanitizeFinite(input?.min_h ?? input?.h ?? fallback.min_h),
  };
}

function createRootRefValues(w: number, h: number): RefValues {
  const safeW = sanitizeFinite(w);
  const safeH = sanitizeFinite(h);
  return {
    w: safeW,
    h: safeH,
    min_w: safeW,
    min_h: safeH,
  };
}

function readRefValue(values: RefValues, prop: RefProp): number {
  switch (prop) {
    case "w":
      return values.w;
    case "h":
      return values.h;
    case "min_w":
      return values.min_w;
    case "min_h":
      return values.min_h;
    default:
      return 0;
  }
}

function constraintPropFromRefProp(prop: RefProp): "width" | "height" | "minWidth" | "minHeight" {
  switch (prop) {
    case "w":
      return "width";
    case "h":
      return "height";
    case "min_w":
      return "minWidth";
    case "min_h":
      return "minHeight";
    default:
      return "width";
  }
}

function readResolvedProp(
  values: MutableResolvedConstraintValues | ResolvedConstraintValues | undefined,
  prop: ConstraintNodeProp,
): number | undefined {
  if (values === undefined) return undefined;
  switch (prop) {
    case "width":
      return values.width;
    case "height":
      return values.height;
    case "minWidth":
      return values.minWidth;
    case "maxWidth":
      return values.maxWidth;
    case "minHeight":
      return values.minHeight;
    case "maxHeight":
      return values.maxHeight;
    case "flexBasis":
      return values.flexBasis;
    case "display":
      return values.display;
    default:
      return undefined;
  }
}

function writeResolvedProp(
  values: MutableResolvedConstraintValues,
  prop: ConstraintNodeProp,
  nextValue: number,
): void {
  const normalized = sanitizeFinite(nextValue);
  switch (prop) {
    case "width":
      values.width = normalized;
      return;
    case "height":
      values.height = normalized;
      return;
    case "minWidth":
      values.minWidth = normalized;
      return;
    case "maxWidth":
      values.maxWidth = normalized;
      return;
    case "minHeight":
      values.minHeight = normalized;
      return;
    case "maxHeight":
      values.maxHeight = normalized;
      return;
    case "flexBasis":
      values.flexBasis = normalized;
      return;
    case "display":
      values.display = normalized;
      return;
    default:
      return;
  }
}

function applyBinary(op: BinaryOp, left: number, right: number): number {
  const a = sanitizeFinite(left);
  const b = sanitizeFinite(right);
  switch (op) {
    case "+":
      return sanitizeFinite(a + b);
    case "-":
      return sanitizeFinite(a - b);
    case "*":
      return sanitizeFinite(a * b);
    case "/":
      if (b === 0) return 0;
      return sanitizeFinite(a / b);
    default:
      return 0;
  }
}

function applyCompare(op: CompareOp, left: number, right: number): number {
  const a = sanitizeFinite(left);
  const b = sanitizeFinite(right);
  switch (op) {
    case ">":
      return a > b ? 1 : 0;
    case ">=":
      return a >= b ? 1 : 0;
    case "<":
      return a < b ? 1 : 0;
    case "<=":
      return a <= b ? 1 : 0;
    case "==":
      return a === b ? 1 : 0;
    case "!=":
      return a !== b ? 1 : 0;
    default:
      return 0;
  }
}

function applyCall(
  ast: Readonly<{ name: string; args: readonly ExprNode[] }>,
  context: EvaluationContext,
): number {
  const name = ast.name;
  if (name === "if") {
    const cond = ast.args[0];
    const thenNode = ast.args[1];
    const elseNode = ast.args[2];
    if (cond === undefined || thenNode === undefined || elseNode === undefined) return 0;
    return evaluate(cond, context) > 0 ? evaluate(thenNode, context) : evaluate(elseNode, context);
  }

  if (name === "steps") {
    const input = ast.args[0];
    if (input === undefined || ast.args.length < 3) return 0;
    const value = evaluate(input, context);
    for (let i = 1; i + 1 < ast.args.length; i += 2) {
      const thresholdNode = ast.args[i];
      const resultNode = ast.args[i + 1];
      if (thresholdNode === undefined || resultNode === undefined) continue;
      const threshold = evaluate(thresholdNode, context);
      if (value < threshold) return evaluate(resultNode, context);
    }
    const fallback = ast.args[ast.args.length - 1];
    return fallback === undefined ? 0 : evaluate(fallback, context);
  }

  if (name === "max_sibling" || name === "sum_sibling") {
    const first = ast.args[0];
    if (first?.kind !== "ref" || first.scope.kind !== "widget") return 0;
    const resolved = context.resolveAggregation?.(name, first.scope.id, first.prop);
    return sanitizeFinite(resolved ?? 0);
  }

  const args: number[] = [];
  for (const arg of ast.args) args.push(evaluate(arg, context));

  switch (name) {
    case "clamp": {
      if (args.length < 3) return 0;
      const minValue = sanitizeFinite(args[0] ?? 0);
      const value = sanitizeFinite(args[1] ?? 0);
      const maxValue = sanitizeFinite(args[2] ?? 0);
      return Math.max(minValue, Math.min(value, maxValue));
    }
    case "min":
      if (args.length < 2) return 0;
      return Math.min(sanitizeFinite(args[0] ?? 0), sanitizeFinite(args[1] ?? 0));
    case "max":
      if (args.length < 2) return 0;
      return Math.max(sanitizeFinite(args[0] ?? 0), sanitizeFinite(args[1] ?? 0));
    case "floor":
      if (args.length < 1) return 0;
      return Math.floor(sanitizeFinite(args[0] ?? 0));
    case "ceil":
      if (args.length < 1) return 0;
      return Math.ceil(sanitizeFinite(args[0] ?? 0));
    case "round":
      if (args.length < 1) return 0;
      return Math.round(sanitizeFinite(args[0] ?? 0));
    case "abs":
      if (args.length < 1) return 0;
      return Math.abs(sanitizeFinite(args[0] ?? 0));
    default: {
      const sourceDetail =
        typeof context.source === "string" ? ` in expr("${context.source}")` : "";
      throw new Error(`Unknown constraint function "${name}"${sourceDetail}`);
    }
  }
}

export function resolveRef(scope: RefScope, prop: RefProp, context: EvaluationContext): number {
  switch (scope.kind) {
    case "viewport":
      return sanitizeFinite(readRefValue(context.viewport, prop));
    case "parent":
      return sanitizeFinite(readRefValue(context.parent, prop));
    case "intrinsic":
      if (context.intrinsic === null) return 0;
      return sanitizeFinite(readRefValue(context.intrinsic, prop));
    case "widget":
      return sanitizeFinite(context.resolveWidgetRef?.(scope.id, prop) ?? 0);
    default:
      return 0;
  }
}

export function evaluate(ast: ExprNode, context: EvaluationContext): number {
  switch (ast.kind) {
    case "number":
      return sanitizeFinite(ast.value);
    case "ref":
      return resolveRef(ast.scope, ast.prop, context);
    case "unary":
      return sanitizeFinite(-evaluate(ast.operand, context));
    case "binary":
      return applyBinary(ast.op, evaluate(ast.left, context), evaluate(ast.right, context));
    case "compare":
      return applyCompare(ast.op, evaluate(ast.left, context), evaluate(ast.right, context));
    case "ternary":
      return evaluate(ast.condition, context) > 0
        ? evaluate(ast.then, context)
        : evaluate(ast.else, context);
    case "call":
      return sanitizeFinite(applyCall(ast, context));
    default:
      return 0;
  }
}

export class ConstraintResolutionCache {
  #maxEntries: number;
  #entries = new Map<string, ReadonlyMap<InstanceId, ResolvedConstraintValues>>();

  constructor(maxEntries = 8) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      this.#maxEntries = 1;
      return;
    }
    this.#maxEntries = maxEntries;
  }

  get(key: string): ReadonlyMap<InstanceId, ResolvedConstraintValues> | null {
    const hit = this.#entries.get(key);
    if (hit === undefined) return null;
    // Refresh access order for simple LRU eviction.
    this.#entries.delete(key);
    this.#entries.set(key, hit);
    return hit;
  }

  set(key: string, value: ReadonlyMap<InstanceId, ResolvedConstraintValues>): void {
    if (this.#entries.has(key)) {
      this.#entries.delete(key);
    }
    this.#entries.set(key, value);
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.#entries.delete(oldest);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}

export function createResolutionCacheKey(
  fingerprint: number,
  viewport: Readonly<{ w: number; h: number }>,
  parent: Readonly<{ w: number; h: number }>,
): string {
  return [
    Math.trunc(fingerprint),
    Math.trunc(viewport.w),
    Math.trunc(viewport.h),
    Math.trunc(parent.w),
    Math.trunc(parent.h),
  ].join("|");
}

export function resolveConstraints(
  graph: ConstraintGraph,
  options: ConstraintResolutionOptions,
): ConstraintResolutionResult {
  const viewportRoot = createRootRefValues(options.viewport.w, options.viewport.h);
  const parentRoot = createRootRefValues(options.parent.w, options.parent.h);
  const cacheKey =
    options.cacheKey ??
    createResolutionCacheKey(graph.fingerprint, options.viewport, options.parent);
  const cached = options.cache?.get(cacheKey) ?? null;
  if (cached !== null) {
    return { values: cached, cacheHit: true };
  }

  const resolvedByInstance = new Map<InstanceId, MutableResolvedConstraintValues>();

  const readMetric = (instanceId: InstanceId, prop: RefProp): number => {
    const resolvedDisplay = readResolvedProp(resolvedByInstance.get(instanceId), "display");
    if (
      typeof resolvedDisplay === "number" &&
      Number.isFinite(resolvedDisplay) &&
      resolvedDisplay <= 0
    ) {
      return 0;
    }

    const baselineDisplay = readResolvedProp(options.baseValues?.get(instanceId), "display");
    if (
      typeof baselineDisplay === "number" &&
      Number.isFinite(baselineDisplay) &&
      baselineDisplay <= 0
    ) {
      return 0;
    }

    const targetProp = constraintPropFromRefProp(prop);
    const resolvedValue = readResolvedProp(resolvedByInstance.get(instanceId), targetProp);
    if (resolvedValue !== undefined) return sanitizeFinite(resolvedValue);

    const baseline = readResolvedProp(options.baseValues?.get(instanceId), targetProp);
    if (baseline !== undefined) return sanitizeFinite(baseline);

    const intrinsic = options.intrinsicValues?.get(instanceId);
    if (intrinsic !== undefined) {
      const normalized = normalizeRefValues(intrinsic, parentRoot);
      return sanitizeFinite(readRefValue(normalized, prop));
    }
    return 0;
  };

  const resolveAggregation = (name: AggregationName, id: string, prop: RefProp): number => {
    const instances = graph.idToInstances.get(id) ?? [];
    if (instances.length === 0) return 0;

    if (name === "max_sibling") {
      let maxValue = Number.NEGATIVE_INFINITY;
      for (const instanceId of instances) {
        const value = sanitizeFinite(readMetric(instanceId, prop));
        if (value > maxValue) maxValue = value;
      }
      return Number.isFinite(maxValue) ? maxValue : 0;
    }

    let total = 0;
    for (const instanceId of instances) {
      total += sanitizeFinite(readMetric(instanceId, prop));
    }
    return sanitizeFinite(total);
  };

  for (const node of graph.order) {
    const parentValues = normalizeRefValues(options.parentValues?.get(node.instanceId), parentRoot);
    const intrinsicInput = options.intrinsicValues?.get(node.instanceId);
    const intrinsicValues =
      intrinsicInput === undefined ? null : normalizeRefValues(intrinsicInput, parentRoot);

    const value = evaluate(node.expr.ast, {
      viewport: viewportRoot,
      parent: parentValues,
      intrinsic: intrinsicValues,
      source: node.expr.source,
      resolveWidgetRef: (id, prop) => {
        const instances = graph.idToInstances.get(id) ?? [];
        if (instances.length === 0) return 0;
        const target = instances[0];
        return target === undefined ? 0 : readMetric(target, prop);
      },
      resolveAggregation,
    });

    const current = resolvedByInstance.get(node.instanceId) ?? {};
    writeResolvedProp(current, node.prop, value);
    resolvedByInstance.set(node.instanceId, current);
  }

  const frozen = new Map<InstanceId, ResolvedConstraintValues>();
  for (const [instanceId, values] of resolvedByInstance.entries()) {
    frozen.set(instanceId, Object.freeze({ ...values }));
  }
  options.cache?.set(cacheKey, frozen);
  return { values: frozen, cacheHit: false };
}
