import { assert, createRng, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { ui } from "../../widgets/ui.js";

const ITERATIONS = 1024;
const AXES = ["row", "column"] as const;
const BOX_BORDERS = [
  "none",
  "single",
  "double",
  "rounded",
  "heavy",
  "dashed",
  "heavy-dashed",
] as const;

type Axis = (typeof AXES)[number];
type Rng = ReturnType<typeof createRng>;
type TreeProfile = Readonly<{
  minNodes: number;
  maxNodes: number;
  maxDepth: number;
  maxChildren: number;
  leafChance: number;
  boxChance: number;
  viewportCols: readonly [number, number];
  viewportRows: readonly [number, number];
  rootAxis: Axis | "random";
}>;

function hexSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16).padStart(8, "0")}`;
}

function failCtx(seed: number, iter: number): string {
  return `seed=${hexSeed(seed)} iter=${String(iter)}`;
}

function describeErr(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function randomInt(rng: Rng, min: number, max: number): number {
  return min + (rng.u32() % (max - min + 1));
}

function chance(rng: Rng, percent: number): boolean {
  return rng.u32() % 100 < percent;
}

function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[rng.u32() % values.length] as T;
}

function randomText(rng: Rng): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789 -_:/";
  const len = 1 + (rng.u32() % 24);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[rng.u32() % alphabet.length] ?? "x";
  }
  return out;
}

function randomLeaf(rng: Rng): VNode {
  if ((rng.u32() & 3) !== 0) {
    return ui.text(randomText(rng));
  }

  const useFlex = chance(rng, 50);
  return ui.spacer({
    size: 1 + (rng.u32() % 4),
    ...(useFlex ? { flex: 1 + (rng.u32() % 3) } : {}),
  });
}

function randomStackProps(rng: Rng): Readonly<{
  gap?: number;
  p?: number;
  wrap?: boolean;
}> {
  return {
    ...(chance(rng, 65) ? { gap: rng.u32() % 3 } : {}),
    ...(chance(rng, 35) ? { p: rng.u32() % 3 } : {}),
    ...(chance(rng, 15) ? { wrap: chance(rng, 50) } : {}),
  };
}

function randomBoxProps(rng: Rng): Readonly<{
  border?: (typeof BOX_BORDERS)[number];
  p?: number;
  title?: string;
  titleAlign?: "left" | "center" | "right";
}> {
  const withTitle = chance(rng, 20);
  return {
    ...(chance(rng, 85) ? { border: pick(rng, BOX_BORDERS) } : {}),
    ...(chance(rng, 40) ? { p: rng.u32() % 3 } : {}),
    ...(withTitle ? { title: randomText(rng).slice(0, 10) } : {}),
    ...(withTitle && chance(rng, 50)
      ? { titleAlign: pick(rng, ["left", "center", "right"] as const) }
      : {}),
  };
}

function randomTree(rng: Rng, profile: TreeProfile): VNode {
  const budget = { left: randomInt(rng, profile.minNodes, profile.maxNodes) };

  function nextNode(depth: number): VNode {
    if (budget.left <= 0) return randomLeaf(rng);
    budget.left--;

    const canBranch = depth < profile.maxDepth && budget.left > 0;
    if (!canBranch || chance(rng, profile.leafChance)) return randomLeaf(rng);

    const maxChildren = Math.max(1, Math.min(profile.maxChildren, budget.left));
    const childCount = 1 + (rng.u32() % maxChildren);
    const children: VNode[] = [];
    for (let i = 0; i < childCount && budget.left > 0; i++) {
      children.push(nextNode(depth + 1));
    }
    if (children.length === 0) children.push(randomLeaf(rng));

    const kindRoll = rng.u32() % 100;
    if (kindRoll < profile.boxChance) {
      return ui.box(randomBoxProps(rng), children);
    }
    if ((kindRoll & 1) === 0) {
      return ui.row(randomStackProps(rng), children);
    }
    return ui.column(randomStackProps(rng), children);
  }

  const rootChildren = [nextNode(1), nextNode(1)];
  const rootKind = rng.u32() % 3;
  if (rootKind === 0) return ui.box(randomBoxProps(rng), rootChildren);
  if (rootKind === 1) return ui.row(randomStackProps(rng), rootChildren);
  return ui.column(randomStackProps(rng), rootChildren);
}

function runTreeFuzz(seed: number, profile: TreeProfile): void {
  const rng = createRng(seed);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const axis: Axis = profile.rootAxis === "random" ? pick(rng, AXES) : profile.rootAxis;
    const cols = randomInt(rng, profile.viewportCols[0], profile.viewportCols[1]);
    const rows = randomInt(rng, profile.viewportRows[0], profile.viewportRows[1]);
    const vnode = randomTree(rng, profile);
    const ctx = failCtx(seed, iter);

    try {
      const commitRes = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
      if (!commitRes.ok) {
        assert.fail(`commit failed (${ctx}): ${commitRes.fatal.code}: ${commitRes.fatal.detail}`);
        continue;
      }

      const layoutRes = layout(commitRes.value.root.vnode, 0, 0, cols, rows, axis);
      if (!layoutRes.ok) {
        assert.fail(`layout failed (${ctx}): ${layoutRes.fatal.code}: ${layoutRes.fatal.detail}`);
        continue;
      }

      const builder = createDrawlistBuilderV1();
      renderToDrawlist({
        tree: commitRes.value.root,
        layout: layoutRes.value,
        viewport: { cols, rows },
        focusState: Object.freeze({ focusedId: null }),
        builder,
      });

      const built = builder.build();
      if (!built.ok) {
        assert.fail(`drawlist build failed (${ctx}): ${built.error.code}: ${built.error.detail}`);
      }
    } catch (err: unknown) {
      assert.fail(`pipeline threw (${ctx}): ${describeErr(err)}`);
    }
  }
}

describe("seeded random vnode tree fuzz (commit/layout/render)", () => {
  test("balanced trees (1024 iters, seed 0x7a11c001)", () => {
    runTreeFuzz(0x7a11_c001, {
      minNodes: 12,
      maxNodes: 64,
      maxDepth: 6,
      maxChildren: 5,
      leafChance: 38,
      boxChance: 28,
      viewportCols: [40, 120],
      viewportRows: [10, 40],
      rootAxis: "random",
    });
  });

  test("deep nesting bias (1024 iters, seed 0x7a11c002)", () => {
    runTreeFuzz(0x7a11_c002, {
      minNodes: 16,
      maxNodes: 72,
      maxDepth: 11,
      maxChildren: 3,
      leafChance: 24,
      boxChance: 36,
      viewportCols: [30, 100],
      viewportRows: [8, 32],
      rootAxis: "column",
    });
  });

  test("wide sibling fanout (1024 iters, seed 0x7a11c003)", () => {
    runTreeFuzz(0x7a11_c003, {
      minNodes: 20,
      maxNodes: 90,
      maxDepth: 5,
      maxChildren: 8,
      leafChance: 44,
      boxChance: 20,
      viewportCols: [60, 160],
      viewportRows: [10, 36],
      rootAxis: "row",
    });
  });

  test("box-heavy container mix (1024 iters, seed 0x7a11c004)", () => {
    runTreeFuzz(0x7a11_c004, {
      minNodes: 10,
      maxNodes: 56,
      maxDepth: 8,
      maxChildren: 4,
      leafChance: 34,
      boxChance: 58,
      viewportCols: [36, 110],
      viewportRows: [8, 30],
      rootAxis: "random",
    });
  });

  test("text-dense leaves (1024 iters, seed 0x7a11c005)", () => {
    runTreeFuzz(0x7a11_c005, {
      minNodes: 14,
      maxNodes: 68,
      maxDepth: 7,
      maxChildren: 6,
      leafChance: 52,
      boxChance: 24,
      viewportCols: [48, 120],
      viewportRows: [12, 28],
      rootAxis: "column",
    });
  });

  test("small viewport pressure (1024 iters, seed 0x7a11c006)", () => {
    runTreeFuzz(0x7a11_c006, {
      minNodes: 8,
      maxNodes: 48,
      maxDepth: 7,
      maxChildren: 5,
      leafChance: 40,
      boxChance: 30,
      viewportCols: [12, 48],
      viewportRows: [4, 16],
      rootAxis: "random",
    });
  });
});
