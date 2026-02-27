import { assert, describe, test } from "@rezi-ui/testkit";
import { updateLayoutStabilitySignatures } from "../../app/widgetRenderer/submitFramePipeline.js";
import type { VNode } from "../../index.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";
import { layout, measure } from "../layout.js";

type TrackedText = Readonly<{
  vnode: VNode;
  reads: () => number;
}>;

type CountingRuntimeFactory = Readonly<{
  make: (
    instanceId: InstanceId,
    vnode: VNode,
    children?: readonly RuntimeInstance[],
  ) => RuntimeInstance;
  reads: () => number;
  reset: () => void;
}>;

type TrackedNumberArray = Readonly<{
  values: readonly number[];
  reads: () => number;
}>;

function textNode(text: string, props: Record<string, unknown> = {}): VNode {
  return { kind: "text", text, props } as unknown as VNode;
}

function rowNode(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "row",
    props,
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function columnNode(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "column",
    props,
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

const NOOP_RESIZE = (): void => {};

function splitPaneNode(
  children: readonly VNode[],
  sizes: readonly number[],
  props: Record<string, unknown> = {},
): VNode {
  return {
    kind: "splitPane",
    props: {
      id: "split-pane-perf",
      direction: "horizontal",
      sizes,
      onResize: NOOP_RESIZE,
      ...props,
    },
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function runtimeNode(
  instanceId: InstanceId,
  vnode: VNode,
  children: readonly RuntimeInstance[] = [],
): RuntimeInstance {
  return {
    instanceId,
    vnode,
    children: Object.freeze([...children]),
    dirty: false,
    selfDirty: false,
    renderPacketKey: 0,
    renderPacket: null,
  };
}

function createTrackedText(value: string): TrackedText {
  let readCount = 0;
  const node = { kind: "text", props: {} } as {
    kind: "text";
    props: Record<string, unknown>;
    text?: string;
  };
  Object.defineProperty(node, "text", {
    configurable: true,
    enumerable: true,
    get: () => {
      readCount++;
      return value;
    },
  });
  return Object.freeze({
    vnode: node as unknown as VNode,
    reads: () => readCount,
  });
}

function totalTrackedReads(tracked: readonly TrackedText[]): number {
  let total = 0;
  for (const item of tracked) {
    total += item.reads();
  }
  return total;
}

function buildWideTrackedColumn(
  count: number,
): Readonly<{ root: VNode; leaves: readonly TrackedText[] }> {
  const leaves: TrackedText[] = [];
  for (let i = 0; i < count; i++) {
    leaves.push(createTrackedText(`leaf-${String(i)}`));
  }
  return Object.freeze({
    root: columnNode(leaves.map((leaf) => leaf.vnode)),
    leaves: Object.freeze(leaves),
  });
}

function createCountingRuntimeFactory(): CountingRuntimeFactory {
  let childPropertyReads = 0;
  return Object.freeze({
    make: (
      instanceId: InstanceId,
      vnode: VNode,
      children: readonly RuntimeInstance[] = [],
    ): RuntimeInstance => {
      const frozenChildren = Object.freeze([...children]);
      const node = {
        instanceId,
        vnode,
        dirty: false,
        selfDirty: false,
        renderPacketKey: 0,
        renderPacket: null,
      } as {
        instanceId: InstanceId;
        vnode: VNode;
        dirty: boolean;
        selfDirty: boolean;
        renderPacketKey: number;
        renderPacket: null;
        children?: readonly RuntimeInstance[];
      };
      Object.defineProperty(node, "children", {
        configurable: true,
        enumerable: true,
        get: () => {
          childPropertyReads++;
          return frozenChildren;
        },
      });
      return node as RuntimeInstance;
    },
    reads: () => childPropertyReads,
    reset: () => {
      childPropertyReads = 0;
    },
  });
}

function buildWideRuntimeRow(leafCount: number, factory: CountingRuntimeFactory): RuntimeInstance {
  const leaves: RuntimeInstance[] = [];
  for (let i = 0; i < leafCount; i++) {
    leaves.push(factory.make(i + 2, textNode(`leaf-${String(i)}`)));
  }
  return factory.make(1, rowNode(leaves.map((leaf) => leaf.vnode)), leaves);
}

function updateSignatures(root: RuntimeInstance, prevById: Map<InstanceId, number>): boolean {
  const nextById = new Map<InstanceId, number>();
  const stack: RuntimeInstance[] = [];
  return updateLayoutStabilitySignatures(root, prevById, nextById, stack);
}

function signatureGateLayout(
  root: RuntimeInstance,
  prevById: Map<InstanceId, number>,
  onLayout: () => void,
): void {
  if (updateSignatures(root, prevById)) {
    onLayout();
  }
}

function createTrackedNumberArray(length: number, value: number): TrackedNumberArray {
  let reads = 0;
  const values = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    Object.defineProperty(values, i, {
      configurable: true,
      enumerable: true,
      get: () => {
        reads++;
        return value;
      },
    });
  }
  return Object.freeze({
    values: Object.freeze(values) as readonly number[],
    reads: () => reads,
  });
}

function buildDeepColumn(depth: number): VNode {
  let node: VNode = textNode("leaf");
  for (let i = 0; i < depth; i++) {
    node = columnNode([node]);
  }
  return node;
}

function buildTextChildren(count: number): readonly VNode[] {
  const out: VNode[] = [];
  for (let i = 0; i < count; i++) {
    out.push(textNode(`panel-${String(i)}`));
  }
  return Object.freeze(out);
}

describe("layout perf invariants (deterministic counters)", () => {
  test("layout text traversal for wide columns is exactly 2N reads", () => {
    const leafCount = 12;
    const tree = buildWideTrackedColumn(leafCount);
    const result = layout(tree.root, 0, 0, 120, leafCount + 2, "column");
    assert.equal(result.ok, true);
    assert.equal(totalTrackedReads(tree.leaves), leafCount * 2);
  });

  test("layout text traversal scales linearly with deterministic node counts", () => {
    const small = buildWideTrackedColumn(12);
    const medium = buildWideTrackedColumn(24);
    const large = buildWideTrackedColumn(48);

    const smallRes = layout(small.root, 0, 0, 120, 64, "column");
    const mediumRes = layout(medium.root, 0, 0, 120, 64, "column");
    const largeRes = layout(large.root, 0, 0, 120, 64, "column");

    assert.equal(smallRes.ok, true);
    assert.equal(mediumRes.ok, true);
    assert.equal(largeRes.ok, true);

    const readsSmall = totalTrackedReads(small.leaves);
    const readsMedium = totalTrackedReads(medium.leaves);
    const readsLarge = totalTrackedReads(large.leaves);

    assert.deepEqual([readsSmall, readsMedium, readsLarge], [24, 48, 96]);
    assert.deepEqual([readsMedium - readsSmall, readsLarge - readsMedium], [24, 48]);
  });

  test("signature traversal for wide rows is exactly 2N+3 children reads", () => {
    const leafCount = 12;
    const prev = new Map<InstanceId, number>();
    const factory = createCountingRuntimeFactory();
    const root = buildWideRuntimeRow(leafCount, factory);

    const changed = updateSignatures(root, prev);
    assert.equal(changed, true);
    assert.equal(factory.reads(), leafCount * 2 + 3);
    assert.equal(prev.size, leafCount + 1);
  });

  test("signature traversal counter scales linearly with node count", () => {
    const prevSmall = new Map<InstanceId, number>();
    const prevLarge = new Map<InstanceId, number>();

    const factorySmall = createCountingRuntimeFactory();
    const factoryLarge = createCountingRuntimeFactory();

    const rootSmall = buildWideRuntimeRow(10, factorySmall);
    const rootLarge = buildWideRuntimeRow(30, factoryLarge);

    assert.equal(updateSignatures(rootSmall, prevSmall), true);
    assert.equal(updateSignatures(rootLarge, prevLarge), true);

    const readsSmall = factorySmall.reads();
    const readsLarge = factoryLarge.reads();

    assert.deepEqual([readsSmall, readsLarge], [23, 63]);
    assert.equal(readsLarge - readsSmall, (30 - 10) * 2);
  });

  test("signature gate invokes layout first pass and skips unchanged pass", () => {
    const prev = new Map<InstanceId, number>();
    let layoutCalls = 0;

    const childA0 = runtimeNode(2, textNode("stable"));
    const root0 = runtimeNode(1, rowNode([childA0.vnode]), [childA0]);
    signatureGateLayout(root0, prev, () => {
      layoutCalls++;
    });

    const childA1 = runtimeNode(2, textNode("stable"));
    const root1 = runtimeNode(1, rowNode([childA1.vnode]), [childA1]);
    signatureGateLayout(root1, prev, () => {
      layoutCalls++;
    });

    assert.equal(layoutCalls, 1);
    assert.equal(prev.size, 2);
  });

  test("signature gate skips layout for unconstrained text width changes", () => {
    const prev = new Map<InstanceId, number>();
    let layoutCalls = 0;

    const childA0 = runtimeNode(2, textNode("stable"));
    const root0 = runtimeNode(1, rowNode([childA0.vnode]), [childA0]);
    signatureGateLayout(root0, prev, () => {
      layoutCalls++;
    });

    const childA1 = runtimeNode(2, textNode("stable-updated"));
    const root1 = runtimeNode(1, rowNode([childA1.vnode]), [childA1]);
    signatureGateLayout(root1, prev, () => {
      layoutCalls++;
    });

    assert.equal(layoutCalls, 1);
    assert.equal(prev.size, 2);
  });

  test("signature gate invokes layout for constrained text width changes", () => {
    const prev = new Map<InstanceId, number>();
    let layoutCalls = 0;

    const childA0 = runtimeNode(2, textNode("stable", { maxWidth: 32 }));
    const root0 = runtimeNode(1, rowNode([childA0.vnode]), [childA0]);
    signatureGateLayout(root0, prev, () => {
      layoutCalls++;
    });

    const childA1 = runtimeNode(2, textNode("stable-updated", { maxWidth: 32 }));
    const root1 = runtimeNode(1, rowNode([childA1.vnode]), [childA1]);
    signatureGateLayout(root1, prev, () => {
      layoutCalls++;
    });

    assert.equal(layoutCalls, 2);
    assert.equal(prev.size, 2);
  });

  test("unsupported signature kinds force relayout and clear signature map", () => {
    const prev = new Map<InstanceId, number>();
    let layoutCalls = 0;

    const supported = runtimeNode(1, textNode("ok"));
    signatureGateLayout(supported, prev, () => {
      layoutCalls++;
    });
    assert.equal(layoutCalls, 1);
    assert.equal(prev.size, 1);

    const unsupported = runtimeNode(1, {
      kind: "select",
      props: { id: "s", value: "", options: Object.freeze([]) },
    } as unknown as VNode);
    signatureGateLayout(unsupported, prev, () => {
      layoutCalls++;
    });
    assert.equal(layoutCalls, 2);
    assert.equal(prev.size, 0);

    signatureGateLayout(unsupported, prev, () => {
      layoutCalls++;
    });
    assert.equal(layoutCalls, 3);
    assert.equal(prev.size, 0);
  });

  test("single-leaf replacement remeasures only changed path with shared cache", () => {
    const cache = new WeakMap<VNode, unknown>();

    const leftA = createTrackedText("left-a");
    const leftB = createTrackedText("left-b");
    const rightA = createTrackedText("right-a");
    const rightB = createTrackedText("right-b");

    const rightBranch = columnNode([rightA.vnode, rightB.vnode], { width: 20 });
    const leftBranch0 = columnNode([leftA.vnode, leftB.vnode], { width: 20 });
    const root0 = rowNode([leftBranch0, rightBranch], { width: 40, height: 5 });

    const res0 = layout(root0, 0, 0, 40, 5, "column", cache);
    assert.equal(res0.ok, true);
    assert.deepEqual([leftA.reads(), leftB.reads(), rightA.reads(), rightB.reads()], [2, 2, 2, 2]);

    const leftBChanged = createTrackedText("left-b-updated");
    const leftBranch1 = columnNode([leftA.vnode, leftBChanged.vnode], { width: 20 });
    const root1 = rowNode([leftBranch1, rightBranch], { width: 40, height: 5 });

    const res1 = layout(root1, 0, 0, 40, 5, "column", cache);
    assert.equal(res1.ok, true);
    assert.deepEqual(
      [leftA.reads(), leftB.reads(), rightA.reads(), rightB.reads(), leftBChanged.reads()],
      [2, 2, 2, 2, 2],
    );
  });

  test("without shared cache unchanged leaves remeasure after single-leaf replacement", () => {
    const leftA = createTrackedText("left-a");
    const leftB = createTrackedText("left-b");
    const rightA = createTrackedText("right-a");
    const rightB = createTrackedText("right-b");

    const rightBranch = columnNode([rightA.vnode, rightB.vnode], { width: 20 });
    const leftBranch0 = columnNode([leftA.vnode, leftB.vnode], { width: 20 });
    const root0 = rowNode([leftBranch0, rightBranch], { width: 40, height: 5 });

    const res0 = layout(root0, 0, 0, 40, 5, "column");
    assert.equal(res0.ok, true);
    assert.deepEqual([leftA.reads(), leftB.reads(), rightA.reads(), rightB.reads()], [2, 2, 2, 2]);

    const leftBChanged = createTrackedText("left-b-updated");
    const leftBranch1 = columnNode([leftA.vnode, leftBChanged.vnode], { width: 20 });
    const root1 = rowNode([leftBranch1, rightBranch], { width: 40, height: 5 });

    const res1 = layout(root1, 0, 0, 40, 5, "column");
    assert.equal(res1.ok, true);
    assert.deepEqual(
      [leftA.reads(), leftB.reads(), rightA.reads(), rightB.reads(), leftBChanged.reads()],
      [4, 2, 4, 4, 2],
    );
  });

  test("splitPane layout reads sizes once per panel and honors absolute widths", () => {
    const panelCount = 8;
    const sizes = createTrackedNumberArray(panelCount, 10);
    const split = splitPaneNode(buildTextChildren(panelCount), sizes.values, {
      sizeMode: "absolute",
      dividerSize: 0,
    });

    const laidOut = layout(split, 0, 0, 80, 4, "column");
    assert.equal(laidOut.ok, true);
    if (!laidOut.ok) return;

    assert.equal(sizes.reads(), panelCount);
    assert.deepEqual(
      laidOut.value.children.map((child, index) => child.rect.x - index * 10),
      Object.freeze(new Array<number>(panelCount).fill(0)),
    );
  });

  test("splitPane layout size-read count grows linearly with panel count", () => {
    const smallPanelCount = 4;
    const largePanelCount = 12;
    const smallSizes = createTrackedNumberArray(smallPanelCount, 10);
    const largeSizes = createTrackedNumberArray(largePanelCount, 10);

    const small = splitPaneNode(buildTextChildren(smallPanelCount), smallSizes.values, {
      sizeMode: "absolute",
      dividerSize: 0,
    });
    const large = splitPaneNode(buildTextChildren(largePanelCount), largeSizes.values, {
      sizeMode: "absolute",
      dividerSize: 0,
    });

    assert.equal(layout(small, 0, 0, 40, 4, "column").ok, true);
    assert.equal(layout(large, 0, 0, 120, 4, "column").ok, true);
    assert.deepEqual([smallSizes.reads(), largeSizes.reads()], [smallPanelCount, largePanelCount]);
  });

  test("splitPane layout min/max reads scale deterministically with panel count", () => {
    const panelCount = 10;
    const sizes = createTrackedNumberArray(panelCount, 10);
    const minSizes = createTrackedNumberArray(panelCount, 0);
    const maxSizes = createTrackedNumberArray(panelCount, 20);
    const split = splitPaneNode(buildTextChildren(panelCount), sizes.values, {
      sizeMode: "absolute",
      dividerSize: 0,
      minSizes: minSizes.values,
      maxSizes: maxSizes.values,
    });

    const laidOut = layout(split, 0, 0, 100, 4, "column");
    assert.equal(laidOut.ok, true);
    assert.deepEqual([sizes.reads(), minSizes.reads(), maxSizes.reads()], [10, 10, 10]);
  });

  test("measure handles 128-level nesting without overflow", () => {
    const deep = buildDeepColumn(128);
    const measured = measure(deep, 80, 300, "column");
    assert.equal(measured.ok, true);
    if (!measured.ok) return;
    assert.deepEqual(measured.value, { w: 4, h: 1 });
  });

  test("layout handles 192-level nesting without overflow", () => {
    const deep = buildDeepColumn(192);
    const laidOut = layout(deep, 0, 0, 80, 300, "column");
    assert.equal(laidOut.ok, true);
    if (!laidOut.ok) return;
    assert.deepEqual(laidOut.value.rect, { x: 0, y: 0, w: 4, h: 1 });
  });
});
