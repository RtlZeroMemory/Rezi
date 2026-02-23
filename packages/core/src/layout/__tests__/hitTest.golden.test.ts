import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { hitTestFocusable } from "../hitTest.js";
import type { LayoutTree } from "../layout.js";
import type { Rect } from "../types.js";

type FixtureRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type FixtureVNode =
  | Readonly<{ ref: string; kind: "text"; text: string; props?: unknown }>
  | Readonly<{ ref: string; kind: "spacer"; props?: unknown }>
  | Readonly<{ ref: string; kind: "button"; props: unknown }>
  | Readonly<{
      ref: string;
      kind: "row" | "column" | "box";
      props?: unknown;
      children?: readonly FixtureVNode[];
    }>;

type HitPoint = Readonly<{ x: number; y: number; expectedId: string | null }>;

type HitTestCase = Readonly<{
  name: string;
  tree: FixtureVNode;
  layoutRects: Record<string, FixtureRect>;
  points: readonly HitPoint[];
}>;

type HitTestFixture = Readonly<{ schemaVersion: 1; cases: readonly HitTestCase[] }>;

function toVNode(node: FixtureVNode): VNode {
  const props = (node as { props?: unknown }).props ?? {};
  switch (node.kind) {
    case "text":
      return { kind: "text", text: node.text, props: props as never };
    case "spacer":
      return { kind: "spacer", props: props as never };
    case "button":
      return { kind: "button", props: node.props as never };
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

function buildLayoutTree(
  node: FixtureVNode,
  vnode: VNode,
  rects: Record<string, FixtureRect>,
): LayoutTree {
  const rect = rects[node.ref];
  assert.ok(rect !== undefined, `missing layoutRects entry for ref=${node.ref}`);

  const fChildren = (node as { children?: readonly FixtureVNode[] }).children ?? [];
  const vChildren = (vnode as { children?: readonly VNode[] }).children ?? [];
  assert.equal(
    vChildren.length,
    fChildren.length,
    `fixture/vnode child mismatch for ref=${node.ref}`,
  );

  const children: LayoutTree[] = [];
  for (let i = 0; i < fChildren.length; i++) {
    const fc = fChildren[i];
    const vc = vChildren[i];
    if (!fc || !vc) continue;
    children.push(buildLayoutTree(fc, vc, rects));
  }

  return { vnode, rect: rect as Rect, children: Object.freeze(children) };
}

async function loadFixture(): Promise<HitTestFixture> {
  const bytes = await readFixture("layout/hit_test_cases.json");
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as HitTestFixture;
}

async function loadFixtureByPath(relPath: string): Promise<HitTestFixture> {
  const bytes = await readFixture(relPath);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as HitTestFixture;
}

describe("hitTestFocusable (locked) - golden fixtures", () => {
  test("hit_test_cases.json", async () => {
    const f = await loadFixture();
    assert.equal(f.schemaVersion, 1);

    for (const c of f.cases) {
      const vnode = toVNode(c.tree);
      const layoutTree = buildLayoutTree(c.tree, vnode, c.layoutRects);

      for (const p of c.points) {
        const winner = hitTestFocusable(vnode, layoutTree, p.x, p.y);
        assert.equal(winner, p.expectedId, `${c.name}: (${p.x},${p.y})`);
      }
    }
  });

  test("hit_test_ties.json", async () => {
    const f = await loadFixtureByPath("layout/hit_test_ties.json");
    assert.equal(f.schemaVersion, 1);

    for (const c of f.cases) {
      const vnode = toVNode(c.tree);
      const layoutTree = buildLayoutTree(c.tree, vnode, c.layoutRects);

      for (const p of c.points) {
        const winner = hitTestFocusable(vnode, layoutTree, p.x, p.y);
        assert.equal(winner, p.expectedId, `${c.name}: (${p.x},${p.y})`);
      }
    }
  });

  test("link with id is hit-testable", () => {
    const link = {
      kind: "link",
      props: { id: "docs-link", url: "https://rezitui.dev" },
    } as unknown as VNode;
    const root = {
      kind: "column",
      props: {},
      children: Object.freeze([link]),
    } as unknown as VNode;
    const layoutTree: LayoutTree = {
      vnode: root,
      rect: { x: 0, y: 0, w: 20, h: 1 },
      children: Object.freeze([
        {
          vnode: link,
          rect: { x: 0, y: 0, w: 20, h: 1 },
          children: Object.freeze([]),
        },
      ]),
    };

    assert.equal(hitTestFocusable(root, layoutTree, 0, 0), "docs-link");
  });

  test("disabled link is not hit-testable", () => {
    const link = {
      kind: "link",
      props: { id: "docs-link", url: "https://rezitui.dev", disabled: true },
    } as unknown as VNode;
    const root = {
      kind: "column",
      props: {},
      children: Object.freeze([link]),
    } as unknown as VNode;
    const layoutTree: LayoutTree = {
      vnode: root,
      rect: { x: 0, y: 0, w: 20, h: 1 },
      children: Object.freeze([
        {
          vnode: link,
          rect: { x: 0, y: 0, w: 20, h: 1 },
          children: Object.freeze([]),
        },
      ]),
    };

    assert.equal(hitTestFocusable(root, layoutTree, 0, 0), null);
  });
});
