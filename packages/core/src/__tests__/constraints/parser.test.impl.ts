import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { expr } from "../../constraints/expr.js";
import {
  ConstraintSyntaxError,
  collectWidgetRefUsages,
  detectIntrinsicRefs,
  detectSiblingAggregation,
  extractRefs,
  parse,
} from "../../constraints/parser.js";

function mustThrowSyntax(source: string): ConstraintSyntaxError {
  let captured: unknown;
  try {
    parse(source);
  } catch (error: unknown) {
    captured = error;
  }
  if (!(captured instanceof ConstraintSyntaxError)) {
    throw new Error(`expected syntax error for "${source}"`);
  }
  return captured;
}

describe("constraint parser", () => {
  test("parses arithmetic precedence and unary", () => {
    const ast = parse("3 * 4 + 5");
    if (ast.kind !== "binary") throw new Error("expected binary expression");
    assert.equal(ast.kind, "binary");
    assert.equal(ast.op, "+");
    if (ast.left.kind !== "binary") throw new Error("expected binary lhs");
    if (ast.right.kind !== "number") throw new Error("expected numeric rhs");
    assert.equal(ast.left.kind, "binary");
    assert.equal(ast.left.op, "*");
    assert.equal(ast.right.kind, "number");
    assert.equal(ast.right.value, 5);

    const grouped = parse("(1 + 2) * 3");
    if (grouped.kind !== "binary") throw new Error("expected grouped binary");
    if (grouped.left.kind !== "binary") throw new Error("expected grouped lhs binary");
    assert.equal(grouped.kind, "binary");
    assert.equal(grouped.op, "*");
    assert.equal(grouped.left.kind, "binary");
    assert.equal(grouped.left.op, "+");

    const unary = parse("-5");
    if (unary.kind !== "unary") throw new Error("expected unary");
    if (unary.operand.kind !== "number") throw new Error("expected unary number");
    assert.equal(unary.kind, "unary");
    assert.equal(unary.operand.kind, "number");
    assert.equal(unary.operand.value, 5);
  });

  test("parses references across all scopes", () => {
    const parentRef = parse("parent.w");
    assert.deepEqual(parentRef, {
      kind: "ref",
      scope: { kind: "parent" },
      prop: "w",
    });

    const viewportRef = parse("viewport.h");
    assert.deepEqual(viewportRef, {
      kind: "ref",
      scope: { kind: "viewport" },
      prop: "h",
    });

    const intrinsicRef = parse("intrinsic.min_h");
    assert.deepEqual(intrinsicRef, {
      kind: "ref",
      scope: { kind: "intrinsic" },
      prop: "min_h",
    });

    const siblingRef = parse("#sidebar.min_w");
    assert.deepEqual(siblingRef, {
      kind: "ref",
      scope: { kind: "widget", id: "sidebar" },
      prop: "min_w",
    });
  });

  test("parses function calls and steps() syntax", () => {
    const clampCall = parse("clamp(0, parent.w, 100)");
    if (clampCall.kind !== "call") throw new Error("expected call");
    assert.equal(clampCall.kind, "call");
    assert.equal(clampCall.name, "clamp");
    assert.equal(clampCall.args.length, 3);

    const stepsCall = parse("steps(viewport.w, 80: 10, 120: 20, 160: 30)");
    if (stepsCall.kind !== "call") throw new Error("expected steps call");
    assert.equal(stepsCall.kind, "call");
    assert.equal(stepsCall.name, "steps");
    assert.equal(stepsCall.args.length, 7);
    assert.equal(stepsCall.args[0]?.kind, "ref");
    assert.equal(stepsCall.args[1]?.kind, "number");
    assert.equal((stepsCall.args[1] as { value: number }).value, 80);
    assert.equal(stepsCall.args[2]?.kind, "number");
    assert.equal((stepsCall.args[2] as { value: number }).value, 10);
  });

  test("parses ternary and comparison expressions", () => {
    const ast = parse("viewport.w >= 100 ? parent.w * 0.3 : 0");
    if (ast.kind !== "ternary") throw new Error("expected ternary");
    if (ast.condition.kind !== "compare") throw new Error("expected compare condition");
    assert.equal(ast.kind, "ternary");
    assert.equal(ast.condition.kind, "compare");
    assert.equal(ast.condition.op, ">=");
    assert.equal(ast.then.kind, "binary");
    assert.equal(ast.else.kind, "number");
  });

  test("handles whitespace and unicode-compatible widget IDs", () => {
    const ast = parse("  #my-widget.w + #status_bar.h + #工具栏.w ");
    assert.equal(ast.kind, "binary");
    const refs = extractRefs(ast);
    assert.deepEqual([...refs].sort(), ["my-widget", "status_bar", "工具栏"]);
  });

  test("detects refs/intrinsic/aggregation usage", () => {
    const ast = parse("max_sibling(#item.min_w) + #detail.w + intrinsic.h");
    const refs = extractRefs(ast);
    assert.deepEqual([...refs].sort(), ["detail", "item"]);
    assert.equal(detectIntrinsicRefs(ast), true);
    assert.equal(detectSiblingAggregation(ast), true);

    const usages = collectWidgetRefUsages(ast);
    assert.equal(usages.length, 2);
    const direct = usages.find((u) => !u.viaAggregation);
    const aggregated = usages.find((u) => u.viaAggregation);
    assert.equal(direct?.id, "detail");
    assert.equal(aggregated?.id, "item");
    assert.equal(aggregated?.aggregation, "max_sibling");
  });

  test("expr() returns branded parse-once object with deep-frozen AST", () => {
    const compiled = expr("#a.w + #b.h + intrinsic.h + sum_sibling(#items.w)");
    assert.equal(compiled.__brand, "ConstraintExpr");
    assert.equal(compiled.source, "#a.w + #b.h + intrinsic.h + sum_sibling(#items.w)");
    assert.deepEqual([...compiled.refs].sort(), ["a", "b", "items"]);
    assert.equal(compiled.hasIntrinsic, true);
    assert.equal(compiled.hasSiblingAggregation, true);
    assert.equal(Object.isFrozen(compiled), true);
    assert.equal(Object.isFrozen(compiled.ast), true);
  });

  test("throws syntax errors with position/caret details", () => {
    const empty = mustThrowSyntax("");
    assert.match(empty.message, /Unexpected end of input/);
    assert.match(empty.message, /at position 0/);
    assert.match(empty.message, /\^/);

    const trailingOp = mustThrowSyntax("1 + ");
    assert.match(trailingOp.message, /Unexpected end of input/);

    const unclosed = mustThrowSyntax("clamp(20, )");
    assert.match(unclosed.message, /Unexpected token "\)"/);

    const badScope = mustThrowSyntax("unknown.w");
    assert.match(badScope.message, /Unknown scope "unknown"/);

    const badProp = mustThrowSyntax("parent.depth");
    assert.match(badProp.message, /Unknown property "depth"/);

    const badSteps = mustThrowSyntax("steps(viewport.w, 80, 10)");
    assert.match(badSteps.message, /Expected ":" in steps\(\) threshold:value pair/);
  });

  test("rejects unknown function names at parse() and expr() entrypoints", () => {
    const unknown = mustThrowSyntax("clmp(10, parent.w, 20)");
    assert.match(unknown.message, /Unknown function "clmp"/);
    assert.match(unknown.message, /expr\("clmp\(10, parent\.w, 20\)"\)/);
    assert.match(unknown.message, /\^/);

    assert.throws(
      () => expr("clmp(10, parent.w, 20)"),
      (error: unknown) =>
        error instanceof ConstraintSyntaxError &&
        /Unknown function "clmp"/.test(error.message) &&
        /expr\("clmp\(10, parent\.w, 20\)"\)/.test(error.message),
    );
  });
});
