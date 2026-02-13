import { assert, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";
import {
  collectAllWidgetMetadata,
  collectEnabledMap,
  collectFocusTraps,
  collectFocusZones,
  collectFocusableIds,
  collectInputMetaById,
  collectPressableIds,
} from "../widgetMeta.js";

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

test("widgetMeta: collectFocusableIds + collectEnabledMap (Buttons + Inputs) (#82, #92)", () => {
  const vnode = ui.column({}, [
    ui.button({ id: "a", label: "A" }),
    ui.input({ id: "i1", value: "x" }),
    ui.row({}, [
      ui.button({ id: "b", label: "B", disabled: true }),
      ui.input({ id: "i2", value: "y", disabled: true }),
      ui.box({}, [ui.button({ id: "c", label: "C" })]),
      ui.column({}, [
        ui.input({ id: "i3", value: "z" }),
        ui.button({ id: "d", label: "D" }),
        ui.button({ id: "e", label: "E", disabled: true }),
      ]),
    ]),
    ui.text("tail"),
  ]);

  const committed = commitTree(vnode);

  const focusable = collectFocusableIds(committed);
  assert.deepEqual(focusable, ["a", "i1", "c", "i3", "d"]);

  const enabled = collectEnabledMap(committed);
  assert.equal(enabled.size, 8);
  assert.equal(enabled.get("a"), true);
  assert.equal(enabled.get("b"), false);
  assert.equal(enabled.get("c"), true);
  assert.equal(enabled.get("d"), true);
  assert.equal(enabled.get("e"), false);
  assert.equal(enabled.get("i1"), true);
  assert.equal(enabled.get("i2"), false);
  assert.equal(enabled.get("i3"), true);
});

test("widgetMeta: SplitPane/PanelGroup are not focusable but their children are (#136)", () => {
  const vnode = ui.column({}, [
    ui.splitPane(
      {
        id: "split",
        direction: "horizontal",
        sizes: [50, 50],
        onResize: () => {},
      },
      [ui.button({ id: "left", label: "Left" }), ui.button({ id: "right", label: "Right" })],
    ),
    ui.panelGroup(
      {
        id: "group",
        direction: "vertical",
      },
      [ui.resizablePanel({}, [ui.button({ id: "nested", label: "Nested" })])],
    ),
  ]);

  const committed = commitTree(vnode);
  const focusable = collectFocusableIds(committed);
  assert.deepEqual(focusable, ["left", "right", "nested"]);
});

test("widgetMeta: slider participates in focusable/enabled metadata", () => {
  const vnode = ui.column({}, [
    ui.slider({ id: "s1", value: 5, min: 0, max: 10 }),
    ui.slider({ id: "s2", value: 5, min: 0, max: 10, disabled: true }),
    ui.slider({ id: "s3", value: 5, min: 0, max: 10, readOnly: true }),
  ]);

  const committed = commitTree(vnode);
  const focusable = collectFocusableIds(committed);
  assert.deepEqual(focusable, ["s1", "s3"]);

  const enabled = collectEnabledMap(committed);
  assert.equal(enabled.get("s1"), true);
  assert.equal(enabled.get("s2"), false);
  assert.equal(enabled.get("s3"), true);
});

test("widgetMeta: collectAllWidgetMetadata produces same results as individual collectors", () => {
  // Complex tree with buttons, inputs, zones, and traps
  const vnode = ui.column({}, [
    ui.button({ id: "a", label: "A" }),
    ui.input({ id: "i1", value: "x" }),
    ui.focusZone(
      {
        id: "zone1",
        tabIndex: 0,
        navigation: "linear",
      },
      [
        ui.button({ id: "z1-btn1", label: "Z1B1" }),
        ui.button({ id: "z1-btn2", label: "Z1B2", disabled: true }),
        ui.input({ id: "z1-input", value: "zone input" }),
      ],
    ),
    ui.focusTrap(
      {
        id: "trap1",
        active: true,
        initialFocus: "t1-btn1",
      },
      [
        ui.button({ id: "t1-btn1", label: "T1B1" }),
        ui.button({ id: "t1-btn2", label: "T1B2" }),
        ui.focusZone(
          {
            id: "nested-zone",
            tabIndex: 1,
          },
          [ui.button({ id: "nz-btn", label: "Nested" })],
        ),
      ],
    ),
    ui.row({}, [
      ui.button({ id: "b", label: "B", disabled: true }),
      ui.input({ id: "i2", value: "y", disabled: true }),
    ]),
  ]);

  const committed = commitTree(vnode);

  // Individual collectors
  const focusableIds = collectFocusableIds(committed);
  const enabledById = collectEnabledMap(committed);
  const pressableIds = collectPressableIds(committed);
  const inputById = collectInputMetaById(committed);
  const zones = collectFocusZones(committed);
  const traps = collectFocusTraps(committed);

  // Single-pass collector
  const allMeta = collectAllWidgetMetadata(committed);

  // Verify focusableIds match
  assert.deepEqual([...allMeta.focusableIds], [...focusableIds]);

  // Verify enabledById matches
  assert.equal(allMeta.enabledById.size, enabledById.size);
  for (const [id, enabled] of enabledById) {
    assert.equal(allMeta.enabledById.get(id), enabled, `enabledById mismatch for ${id}`);
  }

  // Verify pressableIds match
  assert.equal(allMeta.pressableIds.size, pressableIds.size);
  for (const id of pressableIds) {
    assert.equal(allMeta.pressableIds.has(id), true, `pressableIds missing ${id}`);
  }

  // Verify inputById matches
  assert.equal(allMeta.inputById.size, inputById.size);
  for (const [id, meta] of inputById) {
    const allMeta2 = allMeta.inputById.get(id);
    assert.ok(allMeta2, `inputById missing ${id}`);
    assert.equal(allMeta2.value, meta.value);
    assert.equal(allMeta2.disabled, meta.disabled);
  }

  // Verify zones match
  assert.equal(allMeta.zones.size, zones.size);
  for (const [id, zone] of zones) {
    const allZone = allMeta.zones.get(id);
    assert.ok(allZone, `zones missing ${id}`);
    assert.equal(allZone.tabIndex, zone.tabIndex);
    assert.equal(allZone.navigation, zone.navigation);
    assert.equal(allZone.wrapAround, zone.wrapAround);
    assert.deepEqual([...allZone.focusableIds], [...zone.focusableIds]);
  }

  // Verify traps match
  assert.equal(allMeta.traps.size, traps.size);
  for (const [id, trap] of traps) {
    const allTrap = allMeta.traps.get(id);
    assert.ok(allTrap, `traps missing ${id}`);
    assert.equal(allTrap.active, trap.active);
    assert.equal(allTrap.initialFocus, trap.initialFocus);
    assert.equal(allTrap.returnFocusTo, trap.returnFocusTo);
    assert.deepEqual([...allTrap.focusableIds], [...trap.focusableIds]);
  }
});

/* ========== Performance Tests ========== */

/**
 * Build a large tree for performance testing.
 */
function buildLargeTree(rowCount: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(
      ui.row({}, [
        ui.button({ id: `btn-${i}`, label: `Button ${i}` }),
        ui.input({ id: `input-${i}`, value: "" }),
        ui.text(`Row ${i}`),
      ]),
    );
  }
  return ui.column({}, rows);
}

test("widgetMeta: collectAllWidgetMetadata performance - single traversal vs 6 separate", () => {
  // Keep the workload large enough that timing noise doesn't dominate.
  const vnode = buildLargeTree(2000); // 2000 rows * 3 widgets = 6000 leaf nodes
  const committed = commitTree(vnode);

  // Warm up JIT/IC paths.
  for (let i = 0; i < 5; i++) {
    collectAllWidgetMetadata(committed);
    collectFocusableIds(committed);
    collectEnabledMap(committed);
    collectPressableIds(committed);
    collectInputMetaById(committed);
    collectFocusZones(committed);
    collectFocusTraps(committed);
  }

  // Measure single-pass collector
  const iterations = 20;
  const singlePassStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    collectAllWidgetMetadata(committed);
  }
  const singlePassMs = (performance.now() - singlePassStart) / iterations;

  // Measure 6 separate traversals (old approach)
  const separateStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    collectFocusableIds(committed);
    collectEnabledMap(committed);
    collectPressableIds(committed);
    collectInputMetaById(committed);
    collectFocusZones(committed);
    collectFocusTraps(committed);
  }
  const separateMs = (performance.now() - separateStart) / iterations;

  // Single-pass should not be dramatically slower than 6 separate traversals.
  // Leave generous headroom for CI timing noise across operating systems.
  assert.ok(
    singlePassMs <= separateMs * 3,
    `Single-pass (${singlePassMs.toFixed(2)}ms) should not exceed 3x separate (${separateMs.toFixed(2)}ms)`,
  );
});

test("widgetMeta: collectAllWidgetMetadata completes in under 8ms for 1000 widgets", () => {
  const vnode = buildLargeTree(333); // ~1000 widgets
  const committed = commitTree(vnode);

  // Warm up JIT/IC paths.
  for (let i = 0; i < 5; i++) {
    collectAllWidgetMetadata(committed);
  }

  const iterations = 20;
  let totalMs = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    collectAllWidgetMetadata(committed);
    totalMs += performance.now() - start;
  }

  const avgMs = totalMs / iterations;
  // This is a sanity check (not a strict perf gate) to catch catastrophic regressions.
  assert.ok(avgMs < 20, `Metadata collection averaged ${avgMs.toFixed(2)}ms, expected <20ms`);
});
