/**
 * packages/core/src/constraints/parser.ts — Constraint expression parser.
 *
 * Why: Parses DSL expressions into AST nodes used by graph analysis and evaluation.
 */

import type {
  AggregationName,
  BinaryOp,
  CompareOp,
  ExprNode,
  RefProp,
  RefScope,
  WidgetRefUsage,
} from "./types.js";

const AGGREGATION_NAMES: ReadonlySet<string> = new Set<string>(["max_sibling", "sum_sibling"]);
const VALID_PROPS: ReadonlySet<RefProp> = new Set<RefProp>(["w", "h", "min_w", "min_h"]);
const KNOWN_FUNCTION_NAMES: readonly string[] = Object.freeze([
  "clamp",
  "min",
  "max",
  "floor",
  "ceil",
  "round",
  "abs",
  "if",
  "max_sibling",
  "sum_sibling",
  "steps",
]);
const KNOWN_FUNCTION_NAME_SET: ReadonlySet<string> = new Set<string>(KNOWN_FUNCTION_NAMES);

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$";
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch) || ch === "-";
}

function isPropStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isPropPart(ch: string): boolean {
  return isPropStart(ch) || isDigit(ch);
}

function formatErrorMessage(source: string, detail: string, position: number): string {
  const clamped = Number.isFinite(position)
    ? Math.min(Math.max(0, Math.trunc(position)), source.length)
    : 0;
  const caret = `${" ".repeat(8 + clamped)}^`;
  return `${detail} at position ${String(clamped)}\n  expr("${source}")\n${caret}`;
}

export class ConstraintSyntaxError extends Error {
  readonly source: string;
  readonly position: number;

  constructor(source: string, detail: string, position: number) {
    super(formatErrorMessage(source, detail, position));
    this.name = "ConstraintSyntaxError";
    this.source = source;
    this.position = position;
  }
}

class Parser {
  readonly source: string;
  private pos = 0;

  constructor(source: string) {
    this.source = source;
  }

  parse(): ExprNode {
    this.skipWhitespace();
    if (this.isEof()) {
      this.fail("Unexpected end of input");
    }
    const node = this.parseExpr();
    this.skipWhitespace();
    if (!this.isEof()) {
      const tok = this.peek();
      this.fail(tok === null ? "Unexpected end of input" : `Unexpected token "${tok}"`);
    }
    return node;
  }

  private parseExpr(): ExprNode {
    return this.parseTernary();
  }

  private parseTernary(): ExprNode {
    const condition = this.parseCompare();
    this.skipWhitespace();
    if (!this.consumeIf("?")) return condition;
    const thenExpr = this.parseExpr();
    this.skipWhitespace();
    if (!this.consumeIf(":")) {
      this.fail('Expected ":" in ternary expression');
    }
    const elseExpr = this.parseExpr();
    return {
      kind: "ternary",
      condition,
      // biome-ignore lint/suspicious/noThenProperty: "then" is an AST field (not a Promise-like thenable).
      then: thenExpr,
      else: elseExpr,
    };
  }

  private parseCompare(): ExprNode {
    const left = this.parseAdditive();
    this.skipWhitespace();
    const op = this.consumeCompareOp();
    if (op === null) return left;
    const right = this.parseAdditive();
    this.skipWhitespace();
    const extra = this.consumeCompareOp();
    if (extra !== null) {
      this.fail(
        "Only one comparison operator is allowed in a compare expression",
        this.pos - extra.length,
      );
    }
    return { kind: "compare", op, left, right };
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative();
    while (true) {
      this.skipWhitespace();
      const ch = this.peek();
      if (ch !== "+" && ch !== "-") break;
      this.pos++;
      const right = this.parseMultiplicative();
      left = { kind: "binary", op: ch as BinaryOp, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parseUnary();
    while (true) {
      this.skipWhitespace();
      const ch = this.peek();
      if (ch !== "*" && ch !== "/") break;
      this.pos++;
      const right = this.parseUnary();
      left = { kind: "binary", op: ch as BinaryOp, left, right };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    this.skipWhitespace();
    if (this.consumeIf("-")) {
      return {
        kind: "unary",
        op: "-",
        operand: this.parseUnary(),
      };
    }
    return this.parseAtom();
  }

  private parseAtom(): ExprNode {
    this.skipWhitespace();
    const ch = this.peek();
    if (ch === null) this.fail("Unexpected end of input");

    if (ch === "(") {
      this.pos++;
      const inner = this.parseExpr();
      this.skipWhitespace();
      if (!this.consumeIf(")")) this.fail('Expected ")"');
      return inner;
    }

    if (ch === "#") return this.parseWidgetRef();
    if (isDigit(ch)) return this.parseNumberNode();
    if (isIdentifierStart(ch)) return this.parseNamedAtom();
    this.fail(`Unexpected token "${ch}"`);
  }

  private parseNamedAtom(): ExprNode {
    const identStart = this.pos;
    const ident = this.readIdentifier();
    this.skipWhitespace();
    const next = this.peek();

    if (next === "(") return this.parseCall(ident, identStart);
    if (next === ".") return this.parseScopedRef(ident);
    this.fail(`Unknown identifier "${ident}"`, identStart);
  }

  private parseCall(name: string, namePosition: number): ExprNode {
    if (!isKnownConstraintFunctionName(name)) {
      this.fail(`Unknown function "${name}"`, namePosition);
    }
    this.expect("(");
    if (name === "steps") return this.parseStepsCall(name);

    const args: ExprNode[] = [];
    this.skipWhitespace();
    if (this.consumeIf(")")) {
      return { kind: "call", name, args: Object.freeze(args) };
    }

    while (true) {
      args.push(this.parseExpr());
      this.skipWhitespace();
      if (this.consumeIf(",")) continue;
      if (this.consumeIf(")")) break;
      this.fail('Expected "," or ")" in function call');
    }

    return { kind: "call", name, args: Object.freeze(args) };
  }

  private parseStepsCall(name: string): ExprNode {
    const args: ExprNode[] = [];
    this.skipWhitespace();
    if (this.consumeIf(")")) {
      this.fail('steps() requires at least one "threshold: value" pair');
    }

    args.push(this.parseExpr());
    let pairCount = 0;

    while (true) {
      this.skipWhitespace();
      if (!this.consumeIf(",")) break;
      this.skipWhitespace();
      const threshold = this.parseStepThreshold();
      this.skipWhitespace();
      if (!this.consumeIf(":")) {
        this.fail('Expected ":" in steps() threshold:value pair');
      }
      const valueExpr = this.parseExpr();
      args.push({ kind: "number", value: threshold }, valueExpr);
      pairCount++;
    }

    this.skipWhitespace();
    if (!this.consumeIf(")")) this.fail('Expected ")" after steps()');
    if (pairCount === 0) {
      this.fail('steps() requires at least one "threshold: value" pair');
    }
    return { kind: "call", name, args: Object.freeze(args) };
  }

  private parseStepThreshold(): number {
    const token = this.parseNumberNode();
    return token.value;
  }

  private parseScopedRef(scopeName: string): ExprNode {
    this.expect(".");
    const prop = this.readProp();

    let scope: RefScope;
    switch (scopeName) {
      case "parent":
        scope = { kind: "parent" };
        break;
      case "viewport":
        scope = { kind: "viewport" };
        break;
      case "intrinsic":
        scope = { kind: "intrinsic" };
        break;
      default:
        this.fail(`Unknown scope "${scopeName}"`, this.pos - (scopeName.length + prop.length + 1));
    }

    return { kind: "ref", scope, prop };
  }

  private parseWidgetRef(): ExprNode {
    this.expect("#");
    const start = this.pos;
    while (true) {
      const ch = this.peek();
      if (ch === null || ch === "." || isWhitespace(ch)) break;
      this.pos++;
    }
    const id = this.source.slice(start, this.pos);
    if (id.length === 0) this.fail('Expected widget ID after "#"');
    if (!this.consumeIf(".")) this.fail('Expected "." after widget ID');
    const prop = this.readProp();
    return {
      kind: "ref",
      scope: { kind: "widget", id },
      prop,
    };
  }

  private parseNumberNode(): Readonly<{ kind: "number"; value: number }> {
    const start = this.pos;
    const first = this.peek();
    if (first === null || !isDigit(first)) {
      this.fail("Expected number");
    }

    while (true) {
      const ch = this.peek();
      if (ch === null || !isDigit(ch)) break;
      this.pos++;
    }

    if (this.peek() === ".") {
      this.pos++;
      const fractional = this.peek();
      if (fractional === null || !isDigit(fractional)) {
        this.fail("Expected digits after decimal point");
      }
      while (true) {
        const ch = this.peek();
        if (ch === null || !isDigit(ch)) break;
        this.pos++;
      }
    }

    const raw = this.source.slice(start, this.pos);
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) this.fail(`Invalid number "${raw}"`, start);
    return { kind: "number", value };
  }

  private readIdentifier(): string {
    const start = this.pos;
    const first = this.peek();
    if (first === null || !isIdentifierStart(first)) {
      this.fail("Expected identifier");
    }
    this.pos++;
    while (true) {
      const ch = this.peek();
      if (ch === null || !isIdentifierPart(ch)) break;
      this.pos++;
    }
    return this.source.slice(start, this.pos);
  }

  private readProp(): RefProp {
    const start = this.pos;
    const first = this.peek();
    if (first === null || !isPropStart(first)) this.fail("Expected property name");
    this.pos++;
    while (true) {
      const ch = this.peek();
      if (ch === null || !isPropPart(ch)) break;
      this.pos++;
    }
    const token = this.source.slice(start, this.pos);
    if (!VALID_PROPS.has(token as RefProp)) {
      this.fail(`Unknown property "${token}"`, start);
    }
    return token as RefProp;
  }

  private consumeCompareOp(): CompareOp | null {
    this.skipWhitespace();
    if (this.consumeIf(">=")) return ">=";
    if (this.consumeIf("<=")) return "<=";
    if (this.consumeIf("==")) return "==";
    if (this.consumeIf("!=")) return "!=";
    if (this.consumeIf(">")) return ">";
    if (this.consumeIf("<")) return "<";
    return null;
  }

  private expect(token: string): void {
    if (!this.consumeIf(token)) {
      this.fail(`Expected "${token}"`);
    }
  }

  private consumeIf(token: string): boolean {
    if (this.source.startsWith(token, this.pos)) {
      this.pos += token.length;
      return true;
    }
    return false;
  }

  private skipWhitespace(): void {
    while (true) {
      const ch = this.peek();
      if (ch === null || !isWhitespace(ch)) break;
      this.pos++;
    }
  }

  private isEof(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(offset = 0): string | null {
    const ch = this.source[this.pos + offset];
    return ch === undefined ? null : ch;
  }

  private fail(detail: string, position = this.pos): never {
    throw new ConstraintSyntaxError(this.source, detail, position);
  }
}

export function parse(source: string): ExprNode {
  const parser = new Parser(source);
  return parser.parse();
}

export function isKnownConstraintFunctionName(name: string): boolean {
  return KNOWN_FUNCTION_NAME_SET.has(name);
}

function visitExpr(node: ExprNode, visitor: (node: ExprNode) => void): void {
  visitor(node);
  switch (node.kind) {
    case "number":
    case "ref":
      return;
    case "unary":
      visitExpr(node.operand, visitor);
      return;
    case "binary":
    case "compare":
      visitExpr(node.left, visitor);
      visitExpr(node.right, visitor);
      return;
    case "ternary":
      visitExpr(node.condition, visitor);
      visitExpr(node.then, visitor);
      visitExpr(node.else, visitor);
      return;
    case "call":
      for (const arg of node.args) visitExpr(arg, visitor);
      return;
    default:
      return;
  }
}

export function extractRefs(ast: ExprNode): Set<string> {
  const refs = new Set<string>();
  visitExpr(ast, (node) => {
    if (node.kind !== "ref") return;
    if (node.scope.kind === "widget") refs.add(node.scope.id);
  });
  return refs;
}

export function detectIntrinsicRefs(ast: ExprNode): boolean {
  let hasIntrinsic = false;
  visitExpr(ast, (node) => {
    if (hasIntrinsic || node.kind !== "ref") return;
    hasIntrinsic = node.scope.kind === "intrinsic";
  });
  return hasIntrinsic;
}

export function detectSiblingAggregation(ast: ExprNode): boolean {
  let hasAggregation = false;
  visitExpr(ast, (node) => {
    if (hasAggregation || node.kind !== "call") return;
    hasAggregation = AGGREGATION_NAMES.has(node.name);
  });
  return hasAggregation;
}

export function findUnknownFunctionName(ast: ExprNode): string | null {
  let unknown: string | null = null;
  visitExpr(ast, (node) => {
    if (unknown !== null || node.kind !== "call") return;
    if (!isKnownConstraintFunctionName(node.name)) unknown = node.name;
  });
  return unknown;
}

function collectUsagesInternal(node: ExprNode, out: WidgetRefUsage[]): void {
  switch (node.kind) {
    case "number":
      return;
    case "ref":
      if (node.scope.kind === "widget") {
        out.push({
          id: node.scope.id,
          prop: node.prop,
          viaAggregation: false,
          aggregation: null,
        });
      }
      return;
    case "unary":
      collectUsagesInternal(node.operand, out);
      return;
    case "binary":
    case "compare":
      collectUsagesInternal(node.left, out);
      collectUsagesInternal(node.right, out);
      return;
    case "ternary":
      collectUsagesInternal(node.condition, out);
      collectUsagesInternal(node.then, out);
      collectUsagesInternal(node.else, out);
      return;
    case "call": {
      if (AGGREGATION_NAMES.has(node.name)) {
        const first = node.args[0];
        if (first?.kind === "ref" && first.scope.kind === "widget") {
          out.push({
            id: first.scope.id,
            prop: first.prop,
            viaAggregation: true,
            aggregation: node.name as AggregationName,
          });
        } else if (first !== undefined) {
          collectUsagesInternal(first, out);
        }
        for (let i = 1; i < node.args.length; i++) {
          const arg = node.args[i];
          if (arg !== undefined) collectUsagesInternal(arg, out);
        }
        return;
      }
      for (const arg of node.args) collectUsagesInternal(arg, out);
      return;
    }
    default:
      return;
  }
}

export function collectWidgetRefUsages(ast: ExprNode): readonly WidgetRefUsage[] {
  const out: WidgetRefUsage[] = [];
  collectUsagesInternal(ast, out);
  return Object.freeze(out);
}
