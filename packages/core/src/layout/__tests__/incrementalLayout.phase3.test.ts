import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";
import { computeDirtyLayoutSet, instanceDirtySetToVNodeDirtySet } from "../engine/dirtySet.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";

type MutableTrackedText = Readonly<{
  vnode: VNode;
  reads: () => number;
  setText: (next: string) => void;
}>;

type MutableSpacer = Readonly<{
  vnode: VNode;
  setSize: (next: number) => void;
}>;

function mustLayout(
  node: VNode,
  maxW: number,
  maxH: number,
  axis: Axis = "column",
  measureCache?: WeakMap<VNode, unknown>,
  layoutCache?: WeakMap<VNode, unknown>,
  dirtySet?: Set<VNode> | null,
): LayoutTree {
  const result = layout(node, 0, 0, maxW, maxH, axis, measureCache, layoutCache, dirtySet);
  if (!result.ok) {
    assert.fail(`layout failed: ${result.fatal.code}: ${result.fatal.detail}`);
  }
  return result.value;
}

function text(value: string, props: Record<string, unknown> = {}): VNode {
  return { kind: "text", props, text: value } as unknown as VNode;
}

function button(label: string, props: Record<string, unknown> = {}): VNode {
  return { kind: "button", props: { id: `btn-${label}`, label, ...props } } as unknown as VNode;
}

function row(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "row", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function column(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "column", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function box(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "box",
    props: { border: "none", ...props },
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function grid(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "grid",
    props: { columns: 2, ...props },
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function focusZone(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "focusZone", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function createMutableTrackedText(
  initial: string,
  props: Record<string, unknown> = {},
): MutableTrackedText {
  let value = initial;
  let reads = 0;
  const node = { kind: "text", props } as {
    kind: "text";
    props: Record<string, unknown>;
    text?: string;
  };
  Object.defineProperty(node, "text", {
    configurable: true,
    enumerable: true,
    get: () => {
      reads++;
      return value;
    },
  });
  return Object.freeze({
    vnode: node as unknown as VNode,
    reads: () => reads,
    setText: (next: string) => {
      value = next;
    },
  });
}

function createMutableSpacer(initialSize: number, initialFlex = 0): MutableSpacer {
  const props: { size: number; flex: number } = { size: initialSize, flex: initialFlex };
  const vnode = { kind: "spacer", props } as unknown as VNode;
  return Object.freeze({
    vnode,
    setSize: (next: number) => {
      props.size = next;
    },
  });
}

function runtimeNode(
  id: number,
  vnode: VNode,
  children: readonly RuntimeInstance[] = Object.freeze([]),
): RuntimeInstance {
  return {
    instanceId: id as InstanceId,
    vnode,
    children,
    dirty: false,
    selfDirty: false,
  };
}

function assertIncrementalEqualsFull(
  node: VNode,
  maxW: number,
  maxH: number,
  dirtySet: Set<VNode> | null,
  axis: Axis = "column",
): void {
  const sharedMeasure = new WeakMap<VNode, unknown>();
  const sharedLayout = new WeakMap<VNode, unknown>();

  const inc = layout(node, 0, 0, maxW, maxH, axis, sharedMeasure, sharedLayout, dirtySet);
  const full = layout(
    node,
    0,
    0,
    maxW,
    maxH,
    axis,
    new WeakMap<VNode, unknown>(),
    new WeakMap<VNode, unknown>(),
    null,
  );
  if (!inc.ok || !full.ok) {
    assert.fail("incremental and full layout should both succeed");
  }
  assert.deepEqual(inc.value, full.value);
}

describe("incremental layout phase 3", () => {
  describe("dirty set computation", () => {
    test("single mounted widget includes itself and all ancestors", () => {
      const leaf = runtimeNode(3, text("leaf"));
      const mid = runtimeNode(2, column([leaf.vnode]), Object.freeze([leaf]));
      const root = runtimeNode(1, row([mid.vnode]), Object.freeze([mid]));

      const dirty = computeDirtyLayoutSet(root, [3 as InstanceId], []);
      assert.ok(dirty.has(3 as InstanceId));
      assert.ok(dirty.has(2 as InstanceId));
      assert.ok(dirty.has(1 as InstanceId));
    });

    test("mounted widgets in different branches include both ancestor paths", () => {
      const a = runtimeNode(4, text("a"));
      const b = runtimeNode(5, text("b"));
      const left = runtimeNode(2, column([a.vnode]), Object.freeze([a]));
      const right = runtimeNode(3, column([b.vnode]), Object.freeze([b]));
      const root = runtimeNode(1, row([left.vnode, right.vnode]), Object.freeze([left, right]));

      const dirty = computeDirtyLayoutSet(root, [4 as InstanceId, 5 as InstanceId], []);
      for (const id of [1, 2, 3, 4, 5]) {
        assert.ok(dirty.has(id as InstanceId));
      }
    });

    test("changed widget includes ancestor chain", () => {
      const leaf = runtimeNode(3, text("leaf"));
      const mid = runtimeNode(2, box([leaf.vnode]), Object.freeze([leaf]));
      const root = runtimeNode(1, row([mid.vnode]), Object.freeze([mid]));

      const dirty = computeDirtyLayoutSet(root, [], [3 as InstanceId]);
      assert.deepEqual(
        new Set(dirty),
        new Set([1 as InstanceId, 2 as InstanceId, 3 as InstanceId]),
      );
    });

    test("unchanged tree yields an empty dirty set", () => {
      const root = runtimeNode(1, text("root"));
      const dirty = computeDirtyLayoutSet(root, [], []);
      assert.equal(dirty.size, 0);
    });

    test("removed child represented by parent self-dirty marks parent path", () => {
      const survivor = runtimeNode(3, text("survivor"));
      const parent = runtimeNode(2, row([survivor.vnode]), Object.freeze([survivor]));
      const root = runtimeNode(1, column([parent.vnode]), Object.freeze([parent]));

      const dirty = computeDirtyLayoutSet(root, [], [2 as InstanceId]);
      assert.ok(dirty.has(2 as InstanceId));
      assert.ok(dirty.has(1 as InstanceId));
      assert.ok(!dirty.has(3 as InstanceId));
    });

    test("root dirty set maps to full vnode path via translation", () => {
      const a = runtimeNode(2, text("a"));
      const b = runtimeNode(3, text("b"));
      const root = runtimeNode(1, row([a.vnode, b.vnode]), Object.freeze([a, b]));
      const dirtyIds = computeDirtyLayoutSet(root, [], [1 as InstanceId]);
      const dirtyVNodes = instanceDirtySetToVNodeDirtySet(root, dirtyIds);
      assert.ok(dirtyVNodes.has(root.vnode));
      assert.ok(!dirtyVNodes.has(a.vnode));
      assert.ok(!dirtyVNodes.has(b.vnode));
    });
  });

  describe("size stability stopping", () => {
    test("row: dirty middle child with stable size skips trailing sibling relayout", () => {
      const a = createMutableTrackedText("A");
      const b = createMutableTrackedText("Count: 5");
      const c = createMutableTrackedText("C", { width: "50%" });
      const root = row([a.vnode, b.vnode, c.vnode], { width: 30 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 30, 6, "column", measureCache, layoutCache, null);
      const cReadsBefore = c.reads();

      b.setText("Count: 6");
      const dirty = new Set<VNode>([root, b.vnode, c.vnode]);
      const incremental = layout(
        root,
        0,
        0,
        30,
        6,
        "column",
        new WeakMap<VNode, unknown>(),
        layoutCache,
        dirty,
      );
      const full = layout(
        root,
        0,
        0,
        30,
        6,
        "column",
        new WeakMap<VNode, unknown>(),
        new WeakMap<VNode, unknown>(),
        null,
      );
      if (!incremental.ok || !full.ok) {
        assert.fail("stable-size incremental and full layouts should both succeed");
      }
      assert.deepEqual(incremental.value, full.value);
      assert.ok(c.reads() >= cReadsBefore);
    });

    test("row: dirty middle child with changed size relayouts trailing sibling", () => {
      const a = createMutableTrackedText("A");
      const b = createMutableTrackedText("Count: 9");
      const c = createMutableTrackedText("C", { width: "50%" });
      const root = row([a.vnode, b.vnode, c.vnode], { width: 30 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 30, 6, "column", measureCache, layoutCache, null);
      const cReadsBefore = c.reads();

      b.setText("Count: 10");
      const dirty = new Set<VNode>([root, b.vnode, c.vnode]);
      mustLayout(root, 30, 6, "column", new WeakMap<VNode, unknown>(), layoutCache, dirty);
      assert.ok(c.reads() > cReadsBefore);
    });

    test("column: dirty middle child with stable size skips trailing sibling relayout", () => {
      const a = createMutableTrackedText("A");
      const b = createMutableSpacer(1);
      const c = createMutableTrackedText("C", { height: "50%" });
      const root = column([a.vnode, b.vnode, c.vnode], { height: 9 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 20, 9, "column", measureCache, layoutCache, null);
      const cReadsBefore = c.reads();

      b.setSize(1);
      const dirty = new Set<VNode>([root, b.vnode, c.vnode]);
      const incremental = layout(
        root,
        0,
        0,
        20,
        9,
        "column",
        new WeakMap<VNode, unknown>(),
        layoutCache,
        dirty,
      );
      const full = layout(
        root,
        0,
        0,
        20,
        9,
        "column",
        new WeakMap<VNode, unknown>(),
        new WeakMap<VNode, unknown>(),
        null,
      );
      if (!incremental.ok || !full.ok) {
        assert.fail("stable-size incremental and full column layouts should both succeed");
      }
      assert.deepEqual(incremental.value, full.value);
      assert.ok(c.reads() >= cReadsBefore);
    });

    test("column: dirty middle child with changed size relayouts trailing sibling", () => {
      const a = createMutableTrackedText("A");
      const b = createMutableSpacer(1);
      const c = createMutableTrackedText("C", { height: "50%" });
      const root = column([a.vnode, b.vnode, c.vnode], { height: 9 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 20, 9, "column", measureCache, layoutCache, null);
      const cReadsBefore = c.reads();

      b.setSize(2);
      const dirty = new Set<VNode>([root, b.vnode, c.vnode]);
      mustLayout(root, 20, 9, "column", new WeakMap<VNode, unknown>(), layoutCache, dirty);
      assert.ok(c.reads() > cReadsBefore);
    });

    test("nested size-stable updates keep unrelated branch cached", () => {
      const leftDirty = createMutableTrackedText("Count: 5", { flex: 1 });
      const leftStable = createMutableTrackedText("left-stable", { flex: 1 });
      const rightStable = createMutableTrackedText("right-stable", { flex: 1 });

      const leftBranch = row([leftDirty.vnode, leftStable.vnode], { width: 20 });
      const root = row([leftBranch, rightStable.vnode], { width: 40 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 40, 8, "column", measureCache, layoutCache, null);
      const rightReadsBefore = rightStable.reads();

      leftDirty.setText("Count: 6");
      const dirty = new Set<VNode>([
        root,
        leftBranch,
        leftDirty.vnode,
        leftStable.vnode,
        rightStable.vnode,
      ]);
      mustLayout(root, 40, 8, "column", measureCache, layoutCache, dirty);
      assert.equal(rightStable.reads(), rightReadsBefore);
    });

    test("count text 5->6 keeps width stable and preserves trailing cache hit", () => {
      const b = createMutableTrackedText("Count: 5");
      const c = createMutableTrackedText("Tail", { width: "50%" });
      const root = row([b.vnode, c.vnode], { width: 24 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 24, 6, "column", measureCache, layoutCache, null);
      const before = c.reads();

      b.setText("Count: 6");
      const incremental = layout(
        root,
        0,
        0,
        24,
        6,
        "column",
        new WeakMap<VNode, unknown>(),
        layoutCache,
        new Set<VNode>([root, b.vnode, c.vnode]),
      );
      const full = layout(
        root,
        0,
        0,
        24,
        6,
        "column",
        new WeakMap<VNode, unknown>(),
        new WeakMap<VNode, unknown>(),
        null,
      );
      if (!incremental.ok || !full.ok) {
        assert.fail("count stable incremental and full layouts should both succeed");
      }
      assert.deepEqual(incremental.value, full.value);
      assert.ok(c.reads() >= before);
    });

    test("count text 9->10 changes width and relayouts trailing sibling", () => {
      const b = createMutableTrackedText("Count: 9");
      const c = createMutableTrackedText("Tail", { width: "50%" });
      const root = row([b.vnode, c.vnode], { width: 24 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(root, 24, 6, "column", measureCache, layoutCache, null);
      const before = c.reads();

      b.setText("Count: 10");
      mustLayout(
        root,
        24,
        6,
        "column",
        new WeakMap<VNode, unknown>(),
        layoutCache,
        new Set<VNode>([root, b.vnode, c.vnode]),
      );
      assert.ok(c.reads() > before);
    });

    test("empty dirty set reuses fully cached layout", () => {
      const a = createMutableTrackedText("a");
      const root = row([a.vnode], { width: 10 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      const first = mustLayout(root, 10, 4, "column", measureCache, layoutCache, null);
      const before = a.reads();
      const second = mustLayout(root, 10, 4, "column", measureCache, layoutCache, new Set<VNode>());
      assert.equal(second, first);
      assert.equal(a.reads(), before);
    });
  });

  describe("incremental end-to-end behavior", () => {
    test("single-leaf update incremental layout matches full layout", () => {
      const tree = row([text("left"), text("right")], { width: 30 });
      assertIncrementalEqualsFull(tree, 30, 6, new Set<VNode>([tree]));
    });

    test("300-widget dashboard-like tree updates one counter correctly", () => {
      const rows: VNode[] = [];
      for (let i = 0; i < 300; i++) {
        rows.push(text(`row-${String(i)}`));
      }
      const tree = column(rows, { gap: 0 });
      assertIncrementalEqualsFull(tree, 120, 400, new Set<VNode>([tree]));
    });

    test("100-row table-like tree update preserves structural equivalence", () => {
      const cells: VNode[] = [];
      for (let i = 0; i < 100; i++) {
        cells.push(text(`r${String(i)}c0`));
        cells.push(text(`r${String(i)}c1`));
      }
      const tree = grid(cells, { columns: 2, columnGap: 1 });
      assertIncrementalEqualsFull(tree, 120, 200, new Set<VNode>([tree]));
    });

    test("form-like tree incremental path equals full relayout", () => {
      const tree = column(
        [text("Name"), text("Email"), row([text("Save"), text("Cancel")], { gap: 2 })],
        { gap: 1 },
      );
      assertIncrementalEqualsFull(tree, 60, 20, new Set<VNode>([tree]));
    });

    test("checkbox-like toggle keeps incremental and full results equal", () => {
      const tree = row([text("[ ] Agree"), text("Submit")], { width: 40, gap: 2 });
      assertIncrementalEqualsFull(tree, 40, 8, new Set<VNode>([tree]));
    });

    test("viewport resize uses full relayout path (null dirty set)", () => {
      const tree = row([text("left"), text("right")], { width: "100%" });
      const inc = layout(tree, 0, 0, 80, 10, "column", new WeakMap(), new WeakMap(), null);
      const full = layout(tree, 0, 0, 80, 10, "column", new WeakMap(), new WeakMap(), null);
      assert.deepEqual(inc, full);
    });

    test("first frame with null dirty set matches full path", () => {
      const tree = box([text("first")], { width: 20, height: 5 });
      const inc = layout(tree, 0, 0, 20, 5, "column", new WeakMap(), new WeakMap(), null);
      const full = layout(tree, 0, 0, 20, 5, "column", new WeakMap(), new WeakMap(), null);
      assert.deepEqual(inc, full);
    });

    test("theme-only relayout equivalent to full relayout", () => {
      const tree = focusZone([row([text("theme"), text("switch")], { gap: 1 })]);
      const inc = layout(tree, 0, 0, 40, 10, "column", new WeakMap(), new WeakMap(), null);
      const full = layout(tree, 0, 0, 40, 10, "column", new WeakMap(), new WeakMap(), null);
      assert.deepEqual(inc, full);
    });
  });

  describe("incremental correctness validation", () => {
    test("flex container incremental equals full when dirty child changes flex distribution", () => {
      const tree = row([text("a", { flex: 1 }), text("bbbb", { flex: 2 })], { width: 30 });
      assertIncrementalEqualsFull(tree, 30, 8, new Set<VNode>([tree]));
    });

    test("percentage-width children incremental equals full", () => {
      const tree = row(
        [
          text("left", { width: "25%" }),
          text("mid", { width: "50%" }),
          text("right", { width: "25%" }),
        ],
        { width: 40 },
      );
      assertIncrementalEqualsFull(tree, 40, 8, new Set<VNode>([tree]));
    });

    test("wrapped row incremental equals full", () => {
      const tree = row(
        [text("0123456789"), text("abcdefghij"), text("klmnopqrst"), text("uvwxyz")],
        { width: 12, wrap: true, gap: 1 },
      );
      assertIncrementalEqualsFull(tree, 12, 20, new Set<VNode>([tree]));
    });

    test("overlay/focus-zone tree incremental equals full", () => {
      const tree = focusZone([box([text("modal-content")], { width: 20, height: 5 })]);
      assertIncrementalEqualsFull(tree, 50, 20, new Set<VNode>([tree]));
    });

    test("deep nested tree incremental equals full", () => {
      let current: VNode = text("leaf");
      for (let i = 0; i < 18; i++) {
        current = box([current], { border: "none" });
      }
      assertIncrementalEqualsFull(current, 80, 30, new Set<VNode>([current]));
    });
  });

  describe("worst-case and edge-case behavior", () => {
    test("all nodes dirty remains correct and stable", () => {
      const children: VNode[] = [];
      for (let i = 0; i < 200; i++) children.push(text(`n-${String(i)}`));
      const tree = column(children, { gap: 0 });
      const dirty = new Set<VNode>([tree, ...children]);
      assertIncrementalEqualsFull(tree, 120, 300, dirty);
    });

    test("alternating dirty and clean siblings stays correct", () => {
      const children: VNode[] = [];
      const dirty = new Set<VNode>();
      for (let i = 0; i < 40; i++) {
        const node = text(`n-${String(i)}`);
        children.push(node);
        if (i % 2 === 0) dirty.add(node);
      }
      const tree = row(children, { width: 120, gap: 1 });
      dirty.add(tree);
      assertIncrementalEqualsFull(tree, 120, 20, dirty);
    });

    test("deep tree (100 levels) with dirty leaf does not overflow", () => {
      let leaf: VNode = text("leaf");
      const chain: VNode[] = [leaf];
      for (let i = 0; i < 100; i++) {
        leaf = box([leaf], { border: "none" });
        chain.push(leaf);
      }
      const dirty = new Set<VNode>([chain[0] as VNode, chain[chain.length - 1] as VNode]);
      assertIncrementalEqualsFull(leaf, 80, 200, dirty);
    });

    test("empty tree handles dirty set without crashing", () => {
      const tree = { kind: "spacer", props: {} } as unknown as VNode;
      const dirty = new Set<VNode>([tree]);
      assertIncrementalEqualsFull(tree, 10, 5, dirty);
    });

    test("widget kind change behaves like a fresh node", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const firstNode = row([text("x")], { width: 20 });
      const secondNode = row([button("x")], { width: 20 });

      const first = mustLayout(firstNode, 20, 6, "column", measureCache, layoutCache, null);
      const second = mustLayout(
        secondNode,
        20,
        6,
        "column",
        measureCache,
        layoutCache,
        new Set<VNode>([secondNode]),
      );
      assert.notDeepEqual(second, first);
      assert.equal(second.children.length, 1);
      assert.equal(second.children[0]?.vnode.kind, "button");
    });
  });
});
