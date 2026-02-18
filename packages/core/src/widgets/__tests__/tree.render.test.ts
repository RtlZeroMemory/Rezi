import { assert, describe, test } from "@rezi-ui/testkit";
import { TREE_CHARS, getExpandIndicator, getTreeLinePrefix } from "../tree.js";
import type { FlattenedNode } from "../tree.js";

type Node = { id: string };

function flatNode(overrides: Partial<FlattenedNode<Node>>): FlattenedNode<Node> {
  return {
    node: { id: overrides.key ?? "n" },
    depth: overrides.depth ?? 0,
    siblingIndex: overrides.siblingIndex ?? 0,
    siblingCount: overrides.siblingCount ?? 1,
    key: overrides.key ?? "n",
    parentKey: overrides.parentKey ?? null,
    hasChildren: overrides.hasChildren ?? false,
    ancestorIsLast: overrides.ancestorIsLast ?? [],
  };
}

describe("tree.render - prefix/indicator rendering", () => {
  test("root prefix is empty", () => {
    assert.equal(getTreeLinePrefix(flatNode({ depth: 0 }), true, 3), "");
  });

  test("depth-1 non-last uses branch glyph", () => {
    const prefix = getTreeLinePrefix(
      flatNode({ depth: 1, siblingIndex: 0, siblingCount: 2 }),
      true,
      3,
    );
    assert.equal(prefix, TREE_CHARS.branch);
  });

  test("depth-1 last uses last-branch glyph", () => {
    const prefix = getTreeLinePrefix(
      flatNode({ depth: 1, siblingIndex: 1, siblingCount: 2 }),
      true,
      3,
    );
    assert.equal(prefix, TREE_CHARS.lastBranch);
  });

  test("showLines=false uses simple indentation", () => {
    const prefix = getTreeLinePrefix(flatNode({ depth: 3 }), false, 2);
    assert.equal(prefix, "      ");
  });

  test("nested prefix keeps continuing ancestor lines", () => {
    const prefix = getTreeLinePrefix(
      flatNode({
        depth: 3,
        siblingIndex: 0,
        siblingCount: 2,
        ancestorIsLast: [false, false, false],
      }),
      true,
      3,
    );
    assert.ok(prefix.startsWith("|  |  "));
  });

  test("nested prefix omits finished ancestor lines", () => {
    const prefix = getTreeLinePrefix(
      flatNode({ depth: 3, siblingIndex: 1, siblingCount: 2, ancestorIsLast: [true, true, true] }),
      true,
      3,
    );
    assert.ok(prefix.startsWith("      "));
  });

  test("custom indentation width remains deterministic", () => {
    const a = getTreeLinePrefix(flatNode({ depth: 2 }), false, 2);
    const b = getTreeLinePrefix(flatNode({ depth: 2 }), false, 4);
    assert.equal(a.length, 4);
    assert.equal(b.length, 8);
  });

  test("indicator for expanded branch", () => {
    assert.equal(getExpandIndicator(true, true, false), "▼");
  });

  test("indicator for collapsed branch", () => {
    assert.equal(getExpandIndicator(true, false, false), "▶");
  });

  test("indicator for leaf and loading", () => {
    assert.equal(getExpandIndicator(false, false, false), " ");
    assert.equal(getExpandIndicator(true, false, true), "◌");
  });
});
