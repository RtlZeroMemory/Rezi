import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { layout } from "../layout.js";
import type { Axis, Rect } from "../types.js";

type FixtureRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type FixtureVNode =
  | Readonly<{ ref: string; kind: "text"; text: string; props?: unknown }>
  | Readonly<{ ref: string; kind: "spacer"; props?: unknown }>
  | Readonly<{ ref: string; kind: "button"; props: unknown }>
  | Readonly<{ ref: string; kind: "input"; props: unknown }>
  | Readonly<{
      ref: string;
      kind: "row" | "column" | "box";
      props?: unknown;
      children?: readonly FixtureVNode[];
    }>;

type LayoutCaseOk = Readonly<{
  name: string;
  axis: Axis;
  viewport: FixtureRect;
  tree: FixtureVNode;
  expect: Readonly<{ rects: Record<string, FixtureRect> }>;
}>;

type LayoutCaseFail = Readonly<{
  name: string;
  axis: Axis;
  viewport: FixtureRect;
  tree: FixtureVNode;
  expectFatal: Readonly<{ code: "ZRUI_INVALID_PROPS"; detail: string }>;
}>;

type LayoutFixture = Readonly<{
  schemaVersion: 1;
  cases: readonly (LayoutCaseOk | LayoutCaseFail)[];
}>;

function toVNode(node: FixtureVNode): VNode {
  const props = (node as { props?: unknown }).props ?? {};
  switch (node.kind) {
    case "text":
      return { kind: "text", text: node.text, props: props as never };
    case "spacer":
      return { kind: "spacer", props: props as never };
    case "button":
      return { kind: "button", props: node.props as never };
    case "input":
      return { kind: "input", props: node.props as never };
    case "row":
    case "column":
    case "box":
      return {
        kind: node.kind,
        props: props as never,
        children: Object.freeze((node.children ?? []).map(toVNode)),
      };
  }
}

type LayoutTree = Readonly<{
  rect: Rect;
  children: readonly LayoutTree[];
}>;

function projectLayoutTree(t: unknown): LayoutTree {
  const node = t as { rect: Rect; children: readonly unknown[] };
  return { rect: node.rect, children: node.children.map(projectLayoutTree) };
}

function assertRectsMatch(
  fNode: FixtureVNode,
  lNode: LayoutTree,
  rects: Record<string, FixtureRect>,
): void {
  assert.ok(lNode.rect.w >= 0, `width must be non-negative for ref=${fNode.ref}`);
  assert.ok(lNode.rect.h >= 0, `height must be non-negative for ref=${fNode.ref}`);

  const expected = rects[fNode.ref];
  assert.ok(expected !== undefined, `missing expected rect for ref=${fNode.ref}`);
  assert.deepEqual(lNode.rect, expected, `rect mismatch for ref=${fNode.ref}`);

  const fChildren = (fNode as { children?: readonly FixtureVNode[] }).children ?? [];
  assert.equal(
    lNode.children.length,
    fChildren.length,
    `child count mismatch for ref=${fNode.ref}`,
  );

  for (let i = 0; i < fChildren.length; i++) {
    const fc = fChildren[i];
    const lc = lNode.children[i];
    if (!fc || !lc) continue;
    assertRectsMatch(fc, lc, rects);
  }
}

async function loadFixture(): Promise<LayoutFixture> {
  const bytes = await readFixture("layout/layout_cases.json");
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as LayoutFixture;
}

describe("layout (deterministic) - golden fixtures", () => {
  test("layout_cases.json", async () => {
    const f = await loadFixture();
    assert.equal(f.schemaVersion, 1);

    for (const c of f.cases) {
      const vnode = toVNode(c.tree);
      const res = layout(vnode, c.viewport.x, c.viewport.y, c.viewport.w, c.viewport.h, c.axis);

      if ("expectFatal" in c) {
        assert.equal(res.ok, false, `${c.name}: expected fatal`);
        if (res.ok) continue;
        assert.deepEqual(res.fatal, c.expectFatal, `${c.name}: fatal mismatch`);
        continue;
      }

      assert.equal(res.ok, true, `${c.name}: expected ok`);
      if (!res.ok) continue;
      const projected = projectLayoutTree(res.value);
      assertRectsMatch(c.tree, projected, c.expect.rects);
    }
  });
});
