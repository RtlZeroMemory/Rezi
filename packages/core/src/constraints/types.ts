/**
 * packages/core/src/constraints/types.ts — Constraint expression AST model.
 *
 * Why: Provides the parse/evaluate contract shared by parser, graph, and resolver.
 */

export type RefProp = "w" | "h" | "min_w" | "min_h";
export type BinaryOp = "+" | "-" | "*" | "/";
export type CompareOp = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type AggregationName = "max_sibling" | "sum_sibling";

export type RefScope =
  | Readonly<{ kind: "parent" }>
  | Readonly<{ kind: "viewport" }>
  | Readonly<{ kind: "intrinsic" }>
  | Readonly<{ kind: "widget"; id: string }>;

export type ExprNode =
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "ref"; scope: RefScope; prop: RefProp }>
  | Readonly<{ kind: "binary"; op: BinaryOp; left: ExprNode; right: ExprNode }>
  | Readonly<{ kind: "unary"; op: "-"; operand: ExprNode }>
  | Readonly<{ kind: "call"; name: string; args: readonly ExprNode[] }>
  | Readonly<{ kind: "ternary"; condition: ExprNode; then: ExprNode; else: ExprNode }>
  | Readonly<{ kind: "compare"; op: CompareOp; left: ExprNode; right: ExprNode }>;

export type ConstraintExpr = Readonly<{
  __brand: "ConstraintExpr";
  source: string;
  ast: ExprNode;
  refs: ReadonlySet<string>;
  hasIntrinsic: boolean;
  hasSiblingAggregation: boolean;
}>;

export type WidgetRefUsage = Readonly<{
  id: string;
  prop: RefProp;
  viaAggregation: boolean;
  aggregation: AggregationName | null;
}>;
