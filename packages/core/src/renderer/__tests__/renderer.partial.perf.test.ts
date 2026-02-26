import { assert, describe, test } from "@rezi-ui/testkit";
import type { Viewport, WidgetRenderPlan } from "../../app/widgetRenderer.js";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { DrawlistBuildResult, DrawlistBuilder } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { ZrevEvent } from "../../events.js";
import type { VNode } from "../../index.js";
import { ui } from "../../index.js";
import { ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";

class CountingBuilder implements DrawlistBuilder {
  private opCount = 0;
  private lastBuiltCount = 0;

  getLastBuiltOpCount(): number {
    return this.lastBuiltCount;
  }

  clear(): void {
    this.opCount++;
  }

  clearTo(_cols: number, _rows: number): void {
    this.opCount++;
  }

  fillRect(_x: number, _y: number, _w: number, _h: number): void {
    this.opCount++;
  }

  drawText(_x: number, _y: number, _text: string): void {
    this.opCount++;
  }

  pushClip(_x: number, _y: number, _w: number, _h: number): void {
    this.opCount++;
  }

  popClip(): void {
    this.opCount++;
  }

  addBlob(_bytes: Uint8Array): number | null {
    return null;
  }

  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    return null;
  }

  drawTextRun(_x: number, _y: number, _blobIndex: number): void {}

  setCursor(..._args: Parameters<DrawlistBuilder["setCursor"]>): void {}

  hideCursor(): void {}

  setLink(..._args: Parameters<DrawlistBuilder["setLink"]>): void {}

  drawCanvas(..._args: Parameters<DrawlistBuilder["drawCanvas"]>): void {}

  drawImage(..._args: Parameters<DrawlistBuilder["drawImage"]>): void {}

  buildInto(_dst: Uint8Array): DrawlistBuildResult {
    return this.build();
  }

  build(): DrawlistBuildResult {
    this.lastBuiltCount = this.opCount;
    return { ok: true, bytes: new Uint8Array([this.opCount & 0xff]) };
  }

  reset(): void {
    this.opCount = 0;
  }
}

const FULL_PLAN: WidgetRenderPlan = Object.freeze({
  commit: true,
  layout: true,
  checkLayoutStability: true,
});
const PARTIAL_COMMIT_PLAN: WidgetRenderPlan = Object.freeze({
  commit: true,
  layout: false,
  checkLayoutStability: false,
});
const PARTIAL_RENDER_ONLY_PLAN: WidgetRenderPlan = Object.freeze({
  commit: false,
  layout: false,
  checkLayoutStability: false,
});

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // submitFrame tests do not use backend polling.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function submitAndCount<S>(
  renderer: WidgetRenderer<S>,
  builder: CountingBuilder,
  viewFn: (snapshot: Readonly<S>) => VNode,
  snapshot: Readonly<S>,
  viewport: Viewport,
  plan: WidgetRenderPlan,
): number {
  const res = renderer.submitFrame(viewFn, snapshot, viewport, defaultTheme, noRenderHooks(), plan);
  assert.equal(res.ok, true);
  return builder.getLastBuiltOpCount();
}

function tabEvent(timeMs: number): ZrevEvent {
  return {
    kind: "key",
    timeMs,
    key: ZR_KEY_TAB,
    action: "down",
    mods: 0,
  };
}

function wheelEvent(timeMs: number, x: number, y: number, wheelY: number): ZrevEvent {
  return {
    kind: "mouse",
    timeMs,
    x,
    y,
    mouseKind: 5,
    mods: 0,
    buttons: 0,
    wheelX: 0,
    wheelY,
  };
}

function denseListView(editIndex: number, rows: number): VNode {
  const children: VNode[] = [];
  for (let i = 0; i < rows; i++) {
    const label =
      i === editIndex ? `edit-${String(i).padStart(4, "0")}` : `item-${String(i).padStart(4, "0")}`;
    children.push(
      ui.row({ gap: 1 }, [
        ui.text(label),
        ui.text("payload"),
        ui.text(`line-${String(i).padStart(4, "0")}`),
        ui.text("meta"),
      ]),
    );
  }
  return ui.column({ p: 1, gap: 0 }, children);
}

function focusButtonsView(buttonCount: number): VNode {
  const children: VNode[] = [];
  for (let i = 0; i < buttonCount; i++) {
    children.push(ui.button({ id: `btn-${String(i)}`, label: `Button ${String(i)}` }));
  }
  return ui.column({ p: 1, gap: 0 }, children);
}

function virtualListView(itemCount: number): VNode {
  const items = Array.from({ length: itemCount }, (_, i) => `row-${String(i).padStart(4, "0")}`);
  return ui.column({ p: 0 }, [
    ui.text("VirtualList"),
    ui.virtualList({
      id: "list",
      items,
      itemHeight: 1,
      renderItem: (item, index, focused) =>
        ui.text(`${focused ? ">" : " "} ${String(index).padStart(4, "0")} ${item}`),
    }),
  ]);
}

function reductionRatio(fullCount: number, partialCount: number): number {
  if (fullCount <= 0) return 0;
  return (fullCount - partialCount) / fullCount;
}

function measureCommitReduction(
  viewport: Viewport,
  rows: number,
  fromIndex: number,
  toIndex: number,
): Readonly<{ full: number; partial: number; reduction: number }> {
  const fullBuilder = new CountingBuilder();
  const partialBuilder = new CountingBuilder();
  const fullRenderer = new WidgetRenderer<{ editIndex: number }>({
    backend: createNoopBackend(),
    builder: fullBuilder,
  });
  const partialRenderer = new WidgetRenderer<{ editIndex: number }>({
    backend: createNoopBackend(),
    builder: partialBuilder,
  });
  const viewFn = (snapshot: Readonly<{ editIndex: number }>) =>
    denseListView(snapshot.editIndex, rows);

  const initial = Object.freeze({ editIndex: fromIndex });
  submitAndCount(fullRenderer, fullBuilder, viewFn, initial, viewport, FULL_PLAN);
  submitAndCount(partialRenderer, partialBuilder, viewFn, initial, viewport, FULL_PLAN);

  const next = Object.freeze({ editIndex: toIndex });
  const full = submitAndCount(fullRenderer, fullBuilder, viewFn, next, viewport, FULL_PLAN);
  const partial = submitAndCount(
    partialRenderer,
    partialBuilder,
    viewFn,
    next,
    viewport,
    PARTIAL_COMMIT_PLAN,
  );
  return Object.freeze({
    full,
    partial,
    reduction: reductionRatio(full, partial),
  });
}

function measureFocusReduction(
  viewport: Viewport,
  buttonCount: number,
  tabCount: number,
): Readonly<{ full: number; partial: number; reduction: number }> {
  const fullBuilder = new CountingBuilder();
  const partialBuilder = new CountingBuilder();
  const fullRenderer = new WidgetRenderer<void>({
    backend: createNoopBackend(),
    builder: fullBuilder,
  });
  const partialRenderer = new WidgetRenderer<void>({
    backend: createNoopBackend(),
    builder: partialBuilder,
  });
  const viewFn = () => focusButtonsView(buttonCount);

  submitAndCount(fullRenderer, fullBuilder, viewFn, undefined, viewport, FULL_PLAN);
  submitAndCount(partialRenderer, partialBuilder, viewFn, undefined, viewport, FULL_PLAN);

  for (let i = 0; i < tabCount; i++) {
    const ev = tabEvent(100 + i);
    const fullRoute = fullRenderer.routeEngineEvent(ev);
    const partialRoute = partialRenderer.routeEngineEvent(ev);
    assert.equal(fullRoute.needsRender, partialRoute.needsRender);
  }

  const full = submitAndCount(fullRenderer, fullBuilder, viewFn, undefined, viewport, FULL_PLAN);
  const partial = submitAndCount(
    partialRenderer,
    partialBuilder,
    viewFn,
    undefined,
    viewport,
    PARTIAL_RENDER_ONLY_PLAN,
  );
  return Object.freeze({
    full,
    partial,
    reduction: reductionRatio(full, partial),
  });
}

function measureScrollReduction(
  viewport: Viewport,
  itemCount: number,
  wheelSequence: readonly number[],
): Readonly<{ full: number; partial: number; reduction: number }> {
  const fullBuilder = new CountingBuilder();
  const partialBuilder = new CountingBuilder();
  const fullRenderer = new WidgetRenderer<void>({
    backend: createNoopBackend(),
    builder: fullBuilder,
  });
  const partialRenderer = new WidgetRenderer<void>({
    backend: createNoopBackend(),
    builder: partialBuilder,
  });
  const viewFn = () => virtualListView(itemCount);

  submitAndCount(fullRenderer, fullBuilder, viewFn, undefined, viewport, FULL_PLAN);
  submitAndCount(partialRenderer, partialBuilder, viewFn, undefined, viewport, FULL_PLAN);

  for (let i = 0; i < wheelSequence.length; i++) {
    const wheelY = wheelSequence[i] ?? 0;
    const ev = wheelEvent(200 + i, 2, 3, wheelY);
    const fullRoute = fullRenderer.routeEngineEvent(ev);
    const partialRoute = partialRenderer.routeEngineEvent(ev);
    assert.equal(fullRoute.needsRender, partialRoute.needsRender);
  }

  const full = submitAndCount(fullRenderer, fullBuilder, viewFn, undefined, viewport, FULL_PLAN);
  const partial = submitAndCount(
    partialRenderer,
    partialBuilder,
    viewFn,
    undefined,
    viewport,
    PARTIAL_RENDER_ONLY_PLAN,
  );
  return Object.freeze({
    full,
    partial,
    reduction: reductionRatio(full, partial),
  });
}

function assertStrongReduction(
  result: Readonly<{ full: number; partial: number; reduction: number }>,
): void {
  assert.equal(result.full > 0, true, "full command count must be positive");
  assert.equal(result.partial < result.full, true, "partial must emit fewer commands");
  assert.equal(
    result.reduction >= 0.8,
    true,
    `expected >=80% reduction, got ${String(result.reduction)}`,
  );
}

describe("renderer partial rendering perf invariants", () => {
  const viewport: Viewport = Object.freeze({ cols: 120, rows: 42 });

  const commitCases = Object.freeze([
    Object.freeze({ rows: 160, from: -1, to: 4 }),
    Object.freeze({ rows: 240, from: -1, to: 8 }),
    Object.freeze({ rows: 320, from: -1, to: 12 }),
    Object.freeze({ rows: 480, from: -1, to: 16 }),
    Object.freeze({ rows: 640, from: -1, to: 20 }),
    Object.freeze({ rows: 640, from: -1, to: 0 }),
    Object.freeze({ rows: 640, from: -1, to: 24 }),
  ]);

  for (let i = 0; i < commitCases.length; i++) {
    const c = commitCases[i];
    if (!c) continue;
    test(`single-node text edit reduction case ${String(i + 1)} (${String(c.rows)} rows)`, () => {
      const result = measureCommitReduction(viewport, c.rows, c.from, c.to);
      assertStrongReduction(result);
    });
  }

  const focusCases = Object.freeze([
    Object.freeze({ buttonCount: 200, tabs: 1 }),
    Object.freeze({ buttonCount: 300, tabs: 1 }),
    Object.freeze({ buttonCount: 420, tabs: 1 }),
    Object.freeze({ buttonCount: 540, tabs: 2 }),
  ]);

  for (let i = 0; i < focusCases.length; i++) {
    const c = focusCases[i];
    if (!c) continue;
    test(`focus-change reduction case ${String(i + 1)} (${String(c.buttonCount)} buttons)`, () => {
      const result = measureFocusReduction(viewport, c.buttonCount, c.tabs);
      assertStrongReduction(result);
    });
  }
});
