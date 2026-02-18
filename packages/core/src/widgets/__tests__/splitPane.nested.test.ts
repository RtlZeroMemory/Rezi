import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { layout } from "../../layout/layout.js";

function leafPanel(id: string): VNode {
  return {
    kind: "splitPane",
    props: {
      id: `leaf-${id}`,
      direction: "horizontal",
      sizes: [],
      onResize: () => undefined,
    },
    children: Object.freeze([]),
  } as unknown as VNode;
}

function splitPane(
  direction: "horizontal" | "vertical",
  sizes: readonly number[],
  children: readonly VNode[],
  extras: Record<string, unknown> = {},
): VNode {
  return {
    kind: "splitPane",
    props: {
      id: "sp",
      direction,
      sizes,
      onResize: () => undefined,
      ...extras,
    },
    children: Object.freeze(children),
  } as unknown as VNode;
}

function mustLayout(vnode: VNode, width: number, height: number) {
  const result = layout(vnode, 0, 0, width, height, "column");
  if (!result.ok) {
    assert.fail(`layout failed: ${result.fatal.code}: ${result.fatal.detail}`);
  }
  return result.value;
}

describe("splitPane.nested - nested orientation and reflow", () => {
  test("horizontal split lays out three panes left-to-right", () => {
    const root = splitPane(
      "horizontal",
      [20, 30, 50],
      [leafPanel("A"), leafPanel("B"), leafPanel("C")],
    );
    const tree = mustLayout(root, 100, 20);

    const a = tree.children[0];
    const b = tree.children[1];
    const c = tree.children[2];
    assert.ok(a && b && c);
    if (!a || !b || !c) return;

    assert.equal(a.rect.x, 0);
    assert.equal(a.rect.w, 20);
    assert.equal(b.rect.x, 21);
    assert.equal(b.rect.w, 29);
    assert.equal(c.rect.x, 51);
    assert.equal(c.rect.w, 49);
  });

  test("vertical split lays out panes top-to-bottom", () => {
    const root = splitPane("vertical", [50, 50], [leafPanel("A"), leafPanel("B")]);
    const tree = mustLayout(root, 40, 10);

    const a = tree.children[0];
    const b = tree.children[1];
    assert.ok(a && b);
    if (!a || !b) return;

    assert.equal(a.rect.y, 0);
    assert.equal(a.rect.h, 5);
    assert.equal(b.rect.y, 6);
    assert.equal(b.rect.h, 4);
  });

  test("nested horizontal inside vertical receives constrained rect", () => {
    const inner = splitPane("horizontal", [60, 40], [leafPanel("L"), leafPanel("R")]);
    const root = splitPane("vertical", [40, 60], [leafPanel("top"), inner]);

    const tree = mustLayout(root, 120, 30);
    const innerTree = tree.children[1];
    assert.ok(innerTree);
    if (!innerTree) return;

    assert.equal(innerTree.rect.y > 0, true);
    assert.equal(innerTree.rect.w, 120);
    assert.equal(innerTree.children.length, 2);
  });

  test("outer resize drives deterministic inner reflow", () => {
    const inner = splitPane("horizontal", [50, 50], [leafPanel("L"), leafPanel("R")]);
    const root = splitPane("horizontal", [50, 50], [inner, leafPanel("right")]);

    const wide = mustLayout(root, 120, 20);
    const narrow = mustLayout(root, 60, 20);

    const wideInner = wide.children[0];
    const narrowInner = narrow.children[0];
    assert.ok(wideInner && narrowInner);
    if (!wideInner || !narrowInner) return;

    assert.equal(wideInner.rect.w > narrowInner.rect.w, true);
    assert.equal(wideInner.children.length, narrowInner.children.length);
  });

  test("nested 3+ panes remain contiguous without gaps", () => {
    const inner = splitPane(
      "vertical",
      [25, 25, 50],
      [leafPanel("1"), leafPanel("2"), leafPanel("3")],
    );
    const root = splitPane("horizontal", [30, 70], [leafPanel("left"), inner]);
    const tree = mustLayout(root, 90, 40);

    const innerTree = tree.children[1];
    assert.ok(innerTree);
    if (!innerTree) return;

    const first = innerTree.children[0];
    const second = innerTree.children[1];
    const third = innerTree.children[2];
    assert.ok(first && second && third);
    if (!first || !second || !third) return;

    assert.equal(second.rect.y, first.rect.y + first.rect.h + 1);
    assert.equal(third.rect.y, second.rect.y + second.rect.h + 1);
  });

  test("sizeMode absolute preserves explicit panel cell sizes", () => {
    const root = splitPane(
      "horizontal",
      [10, 20, 30],
      [leafPanel("A"), leafPanel("B"), leafPanel("C")],
      { sizeMode: "absolute" },
    );

    const tree = mustLayout(root, 80, 10);
    const a = tree.children[0];
    const b = tree.children[1];
    const c = tree.children[2];
    assert.ok(a && b && c);
    if (!a || !b || !c) return;

    assert.equal(a.rect.w, 16);
    assert.equal(b.rect.w, 26);
    assert.equal(c.rect.w, 36);
  });

  test("nested split with collapsed child keeps parent bounds valid", () => {
    const inner = splitPane("horizontal", [50, 50], [leafPanel("L"), leafPanel("R")], {
      collapsible: true,
      collapsed: [0],
    });
    const root = splitPane("vertical", [50, 50], [inner, leafPanel("tail")]);

    const tree = mustLayout(root, 100, 20);
    const innerTree = tree.children[0];
    assert.ok(innerTree);
    if (!innerTree) return;

    const left = innerTree.children[0];
    const right = innerTree.children[1];
    assert.ok(left && right);
    if (!left || !right) return;

    assert.equal(left.rect.w, 0);
    assert.equal(right.rect.x > left.rect.x, true);
  });

  test("single child splitPane consumes full available rect", () => {
    const root = splitPane("horizontal", [100], [leafPanel("only")]);
    const tree = mustLayout(root, 77, 9);
    const only = tree.children[0];
    assert.ok(only);
    if (!only) return;

    assert.equal(only.rect.w, 77);
    assert.equal(only.rect.h, 9);
  });

  test("zero children splitPane produces empty children array", () => {
    const root = splitPane("vertical", [], []);
    const tree = mustLayout(root, 40, 12);
    assert.equal(tree.children.length, 0);
    assert.equal(tree.rect.w, 40);
    assert.equal(tree.rect.h, 12);
  });

  test("nested orientation swap preserves deterministic coordinates", () => {
    const inner = splitPane("vertical", [60, 40], [leafPanel("U"), leafPanel("D")]);
    const root = splitPane("horizontal", [40, 60], [leafPanel("L"), inner]);

    const tree = mustLayout(root, 100, 50);
    const left = tree.children[0];
    const innerTree = tree.children[1];
    assert.ok(left && innerTree);
    if (!left || !innerTree) return;

    assert.equal(innerTree.rect.x, left.rect.w + 1);
    assert.equal(innerTree.rect.h, 50);
  });
});
