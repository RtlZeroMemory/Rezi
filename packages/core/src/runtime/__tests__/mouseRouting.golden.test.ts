import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import type { VNode } from "../../index.js";
import { hitTestFocusable } from "../../layout/hitTest.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import { type FocusState, applyPendingFocusChange, requestPendingFocusChange } from "../focus.js";
import { type RoutedAction, routeMouse } from "../router.js";

type ExpectedStep = Readonly<{
  focusedId: string | null;
  pressedId: string | null;
  emittedKinds: readonly ("engine" | "action")[];
  action?: RoutedAction;
}>;

type FixtureStep = Readonly<{
  event: ZrevEvent;
  hitTestTargetId: string | null;
  expected: ExpectedStep;
}>;

type MouseRoutingCase = Readonly<{
  name: string;
  enabledById: Readonly<Record<string, boolean>>;
  initialFocusedId: string | null;
  initialPressedId: string | null;
  steps: readonly FixtureStep[];
}>;

type MouseRoutingFixture = Readonly<{ schemaVersion: 1; cases: readonly MouseRoutingCase[] }>;

async function loadFixture(): Promise<MouseRoutingFixture> {
  const bytes = await readFixture("routing/mouse_routing.json");
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as MouseRoutingFixture;
}

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

type OverlapExpectedStep = Readonly<{
  hitTestTargetId: string | null;
  focusedId: string | null;
  pressedId: string | null;
  emittedKinds: readonly ("engine" | "action")[];
  action?: RoutedAction;
}>;

type OverlapFixtureStep = Readonly<{
  event: ZrevEvent;
  expected: OverlapExpectedStep;
}>;

type MouseRoutingOverlapCase = Readonly<{
  name: string;
  tree: FixtureVNode;
  layoutRects: Record<string, FixtureRect>;
  enabledById: Readonly<Record<string, boolean>>;
  initialFocusedId: string | null;
  initialPressedId: string | null;
  steps: readonly OverlapFixtureStep[];
}>;

type MouseRoutingOverlapFixture = Readonly<{
  schemaVersion: 1;
  cases: readonly MouseRoutingOverlapCase[];
}>;

async function loadOverlapFixture(): Promise<MouseRoutingOverlapFixture> {
  const bytes = await readFixture("routing/mouse_routing_overlap.json");
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as MouseRoutingOverlapFixture;
}

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

function stepEmittedKinds(action: RoutedAction | undefined): ("engine" | "action")[] {
  const kinds: ("engine" | "action")[] = ["engine"];
  if (action) kinds.push("action");
  return kinds;
}

describe("routing (locked) - MOUSE golden fixtures", () => {
  test("mouse_routing.json", async () => {
    const f = await loadFixture();
    assert.equal(f.schemaVersion, 1);

    for (const c of f.cases) {
      let focusState: FocusState = Object.freeze({ focusedId: c.initialFocusedId });
      let pressedId: string | null = c.initialPressedId;
      const enabledById = new Map<string, boolean>(Object.entries(c.enabledById));

      for (const s of c.steps) {
        const res = routeMouse(s.event, {
          pressedId,
          hitTestTargetId: s.hitTestTargetId,
          enabledById,
        });

        const emittedKinds = stepEmittedKinds(res.action);
        assert.deepEqual(emittedKinds, s.expected.emittedKinds, `${c.name}: emittedKinds`);

        if (s.expected.action) assert.deepEqual(res.action, s.expected.action, `${c.name}: action`);
        else assert.equal(res.action, undefined, `${c.name}: action`);

        if (res.nextPressedId !== undefined) pressedId = res.nextPressedId;

        if (res.nextFocusedId !== undefined) {
          focusState = requestPendingFocusChange(focusState, res.nextFocusedId);
        }
        focusState = applyPendingFocusChange(focusState);

        assert.equal(focusState.focusedId, s.expected.focusedId, `${c.name}: focusedId`);
        assert.equal(pressedId, s.expected.pressedId, `${c.name}: pressedId`);
      }
    }
  });

  test("mouse_routing_overlap.json", async () => {
    const f = await loadOverlapFixture();
    assert.equal(f.schemaVersion, 1);

    for (const c of f.cases) {
      const vnode = toVNode(c.tree);
      const layoutTree = buildLayoutTree(c.tree, vnode, c.layoutRects);
      let focusState: FocusState = Object.freeze({ focusedId: c.initialFocusedId });
      let pressedId: string | null = c.initialPressedId;
      const enabledById = new Map<string, boolean>(Object.entries(c.enabledById));

      for (const s of c.steps) {
        const hitTestTargetId =
          s.event.kind === "mouse"
            ? hitTestFocusable(vnode, layoutTree, s.event.x, s.event.y)
            : null;
        assert.equal(hitTestTargetId, s.expected.hitTestTargetId, `${c.name}: hitTestTargetId`);

        const res = routeMouse(s.event, {
          pressedId,
          hitTestTargetId,
          enabledById,
        });

        const emittedKinds = stepEmittedKinds(res.action);
        assert.deepEqual(emittedKinds, s.expected.emittedKinds, `${c.name}: emittedKinds`);

        if (s.expected.action) assert.deepEqual(res.action, s.expected.action, `${c.name}: action`);
        else assert.equal(res.action, undefined, `${c.name}: action`);

        if (res.nextPressedId !== undefined) pressedId = res.nextPressedId;

        if (res.nextFocusedId !== undefined) {
          focusState = requestPendingFocusChange(focusState, res.nextFocusedId);
        }
        focusState = applyPendingFocusChange(focusState);

        assert.equal(focusState.focusedId, s.expected.focusedId, `${c.name}: focusedId`);
        assert.equal(pressedId, s.expected.pressedId, `${c.name}: pressedId`);
      }
    }
  });
});
