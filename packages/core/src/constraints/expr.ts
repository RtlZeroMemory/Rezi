/**
 * packages/core/src/constraints/expr.ts — Public expression entrypoint.
 *
 * Why: Provides parse-once objects with frozen AST metadata for frame-time reuse.
 */

import {
  collectWidgetRefUsages,
  detectIntrinsicRefs,
  detectSiblingAggregation,
  extractRefs,
  parse,
} from "./parser.js";
import type { ConstraintExpr, ExprNode, RefScope } from "./types.js";

const EXPR_CACHE_MAX = 256;
const EXPR_CACHE = new Map<string, ConstraintExpr>();

function freezeScope(scope: RefScope): RefScope {
  if (scope.kind === "widget") {
    return Object.freeze({ kind: "widget" as const, id: scope.id });
  }
  return Object.freeze({ kind: scope.kind });
}

function freezeAst(node: ExprNode): ExprNode {
  switch (node.kind) {
    case "number":
      return Object.freeze({ kind: "number", value: node.value });
    case "ref":
      return Object.freeze({
        kind: "ref",
        scope: freezeScope(node.scope),
        prop: node.prop,
      });
    case "unary":
      return Object.freeze({
        kind: "unary",
        op: node.op,
        operand: freezeAst(node.operand),
      });
    case "binary":
      return Object.freeze({
        kind: "binary",
        op: node.op,
        left: freezeAst(node.left),
        right: freezeAst(node.right),
      });
    case "compare":
      return Object.freeze({
        kind: "compare",
        op: node.op,
        left: freezeAst(node.left),
        right: freezeAst(node.right),
      });
    case "ternary":
      return Object.freeze({
        kind: "ternary",
        condition: freezeAst(node.condition),
        // biome-ignore lint/suspicious/noThenProperty: "then" is an AST field (not a Promise-like thenable).
        then: freezeAst(node.then),
        else: freezeAst(node.else),
      });
    case "call": {
      const args = Object.freeze(node.args.map((arg) => freezeAst(arg)));
      return Object.freeze({
        kind: "call",
        name: node.name,
        args,
      });
    }
    default:
      return node;
  }
}

function freezeReadonlySet<T>(set: Set<T>): ReadonlySet<T> {
  return Object.freeze(set) as ReadonlySet<T>;
}

export function expr(source: string): ConstraintExpr {
  const cached = EXPR_CACHE.get(source);
  if (cached !== undefined) {
    // Refresh simple LRU access order.
    EXPR_CACHE.delete(source);
    EXPR_CACHE.set(source, cached);
    return cached;
  }

  const parsed = parse(source);
  const ast = freezeAst(parsed);
  const refs = freezeReadonlySet(extractRefs(ast));
  const hasIntrinsic = detectIntrinsicRefs(ast);
  const hasSiblingAggregation = detectSiblingAggregation(ast);
  // Keep call-site analysis hot-path free by validating usage here once.
  void collectWidgetRefUsages(ast);
  const out = Object.freeze({
    __brand: "ConstraintExpr" as const,
    source,
    ast,
    refs,
    hasIntrinsic,
    hasSiblingAggregation,
  });
  EXPR_CACHE.set(source, out);
  while (EXPR_CACHE.size > EXPR_CACHE_MAX) {
    const oldest = EXPR_CACHE.keys().next().value;
    if (typeof oldest !== "string") break;
    EXPR_CACHE.delete(oldest);
  }
  return out;
}

export function isConstraintExpr(value: unknown): value is ConstraintExpr {
  if (typeof value !== "object" || value === null) return false;
  const maybe = value as { __brand?: unknown; source?: unknown; ast?: unknown };
  return (
    maybe.__brand === "ConstraintExpr" &&
    typeof maybe.source === "string" &&
    maybe.ast !== undefined
  );
}
