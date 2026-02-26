import { assert, describe, test } from "@rezi-ui/testkit";
import type { Viewport, WidgetRenderPlan } from "../../app/widgetRenderer.js";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { DrawlistBuildResult, DrawlistBuilder } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { ZrevEvent } from "../../events.js";
import type { TextStyle, VNode } from "../../index.js";
import { ui } from "../../index.js";
import { ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";

type RecordedOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{
      kind: "blitRect";
      srcX: number;
      srcY: number;
      w: number;
      h: number;
      dstX: number;
      dstY: number;
    }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

class RecordingBuilder implements DrawlistBuilder {
  private ops: RecordedOp[] = [];
  private lastBuiltOps: readonly RecordedOp[] = Object.freeze([]);

  getLastBuiltOps(): readonly RecordedOp[] {
    return this.lastBuiltOps;
  }

  clear(): void {
    this.ops.push({ kind: "clear" });
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    this.ops.push({ kind: "clearTo", cols, rows, ...(style ? { style } : {}) });
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    this.ops.push({ kind: "fillRect", x, y, w, h, ...(style ? { style } : {}) });
  }

  blitRect(srcX: number, srcY: number, w: number, h: number, dstX: number, dstY: number): void {
    this.ops.push({ kind: "blitRect", srcX, srcY, w, h, dstX, dstY });
  }

  drawText(x: number, y: number, text: string, style?: TextStyle): void {
    this.ops.push({ kind: "drawText", x, y, text, ...(style ? { style } : {}) });
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this.ops.push({ kind: "pushClip", x, y, w, h });
  }

  popClip(): void {
    this.ops.push({ kind: "popClip" });
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

  build(): DrawlistBuildResult {
    this.lastBuiltOps = this.ops.slice();
    return { ok: true, bytes: new Uint8Array([this.ops.length & 0xff]) };
  }

  buildInto(_dst: Uint8Array): DrawlistBuildResult {
    return this.build();
  }

  reset(): void {
    this.ops = [];
  }
}

type Framebuffer = Readonly<{
  cols: number;
  rows: number;
  chars: string[];
  styles: string[];
}>;

const FULL_PLAN: WidgetRenderPlan = Object.freeze({
  commit: true,
  layout: true,
  checkLayoutStability: true,
});
const PARTIAL_COMMIT_PLAN: WidgetRenderPlan = Object.freeze({
  commit: true,
  layout: false,
  checkLayoutStability: true,
});
const PARTIAL_COMMIT_NO_STABILITY_PLAN: WidgetRenderPlan = Object.freeze({
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

function colorKey(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "object") {
    const rgb = value as { r?: unknown; g?: unknown; b?: unknown };
    if (
      typeof rgb.r === "number" &&
      typeof rgb.g === "number" &&
      typeof rgb.b === "number" &&
      Number.isFinite(rgb.r) &&
      Number.isFinite(rgb.g) &&
      Number.isFinite(rgb.b)
    ) {
      return `rgb:${String(rgb.r)},${String(rgb.g)},${String(rgb.b)}`;
    }
  }
  return "?";
}

function styleKey(style: TextStyle | undefined): string {
  if (!style) return "";
  return [
    style.bold ? "b1" : "b0",
    style.dim ? "d1" : "d0",
    style.italic ? "i1" : "i0",
    style.underline ? "u1" : "u0",
    style.inverse ? "v1" : "v0",
    style.strikethrough ? "s1" : "s0",
    style.overline ? "o1" : "o0",
    style.blink ? "k1" : "k0",
    `fg:${colorKey(style.fg)}`,
    `bg:${colorKey(style.bg)}`,
  ].join("|");
}

function createFramebuffer(viewport: Viewport): Framebuffer {
  const total = viewport.cols * viewport.rows;
  return {
    cols: viewport.cols,
    rows: viewport.rows,
    chars: new Array(total).fill(" "),
    styles: new Array(total).fill(""),
  };
}

function cloneFramebuffer(framebuffer: Framebuffer): Framebuffer {
  return {
    cols: framebuffer.cols,
    rows: framebuffer.rows,
    chars: framebuffer.chars.slice(),
    styles: framebuffer.styles.slice(),
  };
}

function applyOps(framebuffer: Framebuffer, ops: readonly RecordedOp[]): Framebuffer {
  const out = cloneFramebuffer(framebuffer);
  const clipStack: Array<Readonly<{ x: number; y: number; w: number; h: number }>> = [];
  const inViewport = (x: number, y: number) => x >= 0 && x < out.cols && y >= 0 && y < out.rows;
  const inClip = (x: number, y: number) => {
    for (const clip of clipStack) {
      if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
    }
    return true;
  };
  const writeCell = (x: number, y: number, ch: string, style: string) => {
    if (!inViewport(x, y) || !inClip(x, y)) return;
    const idx = y * out.cols + x;
    out.chars[idx] = ch;
    out.styles[idx] = style;
  };
  const fillViewport = (cols: number, rows: number, style: string) => {
    const w = Math.min(cols, out.cols);
    const h = Math.min(rows, out.rows);
    for (let y = 0; y < h; y++) {
      const base = y * out.cols;
      for (let x = 0; x < w; x++) {
        out.chars[base + x] = " ";
        out.styles[base + x] = style;
      }
    }
  };

  for (const op of ops) {
    switch (op.kind) {
      case "clear":
        fillViewport(out.cols, out.rows, "");
        break;
      case "clearTo":
        fillViewport(op.cols, op.rows, styleKey(op.style));
        break;
      case "fillRect": {
        const key = styleKey(op.style);
        for (let y = op.y; y < op.y + op.h; y++) {
          for (let x = op.x; x < op.x + op.w; x++) {
            writeCell(x, y, " ", key);
          }
        }
        break;
      }
      case "blitRect": {
        const copiedChars: string[] = [];
        const copiedStyles: string[] = [];
        for (let y = 0; y < op.h; y++) {
          for (let x = 0; x < op.w; x++) {
            const srcX = op.srcX + x;
            const srcY = op.srcY + y;
            if (inViewport(srcX, srcY)) {
              const srcIdx = srcY * out.cols + srcX;
              copiedChars.push(out.chars[srcIdx] ?? " ");
              copiedStyles.push(out.styles[srcIdx] ?? "");
            } else {
              copiedChars.push(" ");
              copiedStyles.push("");
            }
          }
        }
        let copiedIdx = 0;
        for (let y = 0; y < op.h; y++) {
          for (let x = 0; x < op.w; x++) {
            writeCell(
              op.dstX + x,
              op.dstY + y,
              copiedChars[copiedIdx] ?? " ",
              copiedStyles[copiedIdx] ?? "",
            );
            copiedIdx++;
          }
        }
        break;
      }
      case "drawText": {
        const key = styleKey(op.style);
        for (let i = 0; i < op.text.length; i++) {
          writeCell(op.x + i, op.y, op.text[i] ?? " ", key);
        }
        break;
      }
      case "pushClip":
        clipStack.push({ x: op.x, y: op.y, w: op.w, h: op.h });
        break;
      case "popClip":
        if (clipStack.length > 0) clipStack.pop();
        break;
      default:
        break;
    }
  }

  return out;
}

function assertFramebuffersEqual(actual: Framebuffer, expected: Framebuffer): void {
  assert.equal(actual.cols, expected.cols);
  assert.equal(actual.rows, expected.rows);
  assert.equal(actual.chars.length, expected.chars.length);
  assert.equal(actual.styles.length, expected.styles.length);
  for (let i = 0; i < actual.chars.length; i++) {
    assert.equal(actual.chars[i], expected.chars[i], `char mismatch at ${String(i)}`);
    assert.equal(actual.styles[i], expected.styles[i], `style mismatch at ${String(i)}`);
  }
}

function submitOps<S>(
  renderer: WidgetRenderer<S>,
  builder: RecordingBuilder,
  viewFn: (snapshot: Readonly<S>) => VNode,
  snapshot: Readonly<S>,
  viewport: Viewport,
  plan: WidgetRenderPlan,
): readonly RecordedOp[] {
  const res = renderer.submitFrame(viewFn, snapshot, viewport, defaultTheme, noRenderHooks(), plan);
  assert.equal(res.ok, true);
  return builder.getLastBuiltOps();
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

type ScenarioResult = Readonly<{
  fullOps: readonly RecordedOp[];
  partialOps: readonly RecordedOp[];
  fullFrame: Framebuffer;
  partialFrame: Framebuffer;
}>;

type SequenceScenarioResult = Readonly<{
  fullFrame: Framebuffer;
  partialFrame: Framebuffer;
  fullOpsByFrame: readonly (readonly RecordedOp[])[];
  partialOpsByFrame: readonly (readonly RecordedOp[])[];
}>;

function runCommitScenario<S>(
  viewFn: (snapshot: Readonly<S>) => VNode,
  initialSnapshot: Readonly<S>,
  nextSnapshot: Readonly<S>,
  viewport: Viewport,
  partialPlan: WidgetRenderPlan = PARTIAL_COMMIT_PLAN,
): ScenarioResult {
  const fullBuilder = new RecordingBuilder();
  const partialBuilder = new RecordingBuilder();
  const fullRenderer = new WidgetRenderer<S>({
    backend: createNoopBackend(),
    builder: fullBuilder,
  });
  const partialRenderer = new WidgetRenderer<S>({
    backend: createNoopBackend(),
    builder: partialBuilder,
  });

  const blank = createFramebuffer(viewport);
  const fullBootstrap = submitOps(
    fullRenderer,
    fullBuilder,
    viewFn,
    initialSnapshot,
    viewport,
    FULL_PLAN,
  );
  const partialBootstrap = submitOps(
    partialRenderer,
    partialBuilder,
    viewFn,
    initialSnapshot,
    viewport,
    FULL_PLAN,
  );
  const fullBootstrapFrame = applyOps(blank, fullBootstrap);
  const partialBootstrapFrame = applyOps(blank, partialBootstrap);
  assertFramebuffersEqual(fullBootstrapFrame, partialBootstrapFrame);

  const fullOps = submitOps(fullRenderer, fullBuilder, viewFn, nextSnapshot, viewport, FULL_PLAN);
  const partialOps = submitOps(
    partialRenderer,
    partialBuilder,
    viewFn,
    nextSnapshot,
    viewport,
    partialPlan,
  );
  const fullFrame = applyOps(fullBootstrapFrame, fullOps);
  const partialFrame = applyOps(partialBootstrapFrame, partialOps);
  return { fullOps, partialOps, fullFrame, partialFrame };
}

function runEventScenario<S>(
  viewFn: (snapshot: Readonly<S>) => VNode,
  snapshot: Readonly<S>,
  viewport: Viewport,
  events: readonly ZrevEvent[],
): ScenarioResult {
  const fullBuilder = new RecordingBuilder();
  const partialBuilder = new RecordingBuilder();
  const fullRenderer = new WidgetRenderer<S>({
    backend: createNoopBackend(),
    builder: fullBuilder,
  });
  const partialRenderer = new WidgetRenderer<S>({
    backend: createNoopBackend(),
    builder: partialBuilder,
  });

  const blank = createFramebuffer(viewport);
  const fullBootstrap = submitOps(fullRenderer, fullBuilder, viewFn, snapshot, viewport, FULL_PLAN);
  const partialBootstrap = submitOps(
    partialRenderer,
    partialBuilder,
    viewFn,
    snapshot,
    viewport,
    FULL_PLAN,
  );
  const fullBootstrapFrame = applyOps(blank, fullBootstrap);
  const partialBootstrapFrame = applyOps(blank, partialBootstrap);
  assertFramebuffersEqual(fullBootstrapFrame, partialBootstrapFrame);

  let sawNeedsRender = false;
  for (const event of events) {
    const fullOutcome = fullRenderer.routeEngineEvent(event);
    const partialOutcome = partialRenderer.routeEngineEvent(event);
    assert.equal(fullOutcome.needsRender, partialOutcome.needsRender);
    sawNeedsRender = sawNeedsRender || fullOutcome.needsRender;
  }
  assert.equal(sawNeedsRender, true, "expected routed events to require render");

  const fullOps = submitOps(fullRenderer, fullBuilder, viewFn, snapshot, viewport, FULL_PLAN);
  const partialOps = submitOps(
    partialRenderer,
    partialBuilder,
    viewFn,
    snapshot,
    viewport,
    PARTIAL_RENDER_ONLY_PLAN,
  );
  const fullFrame = applyOps(fullBootstrapFrame, fullOps);
  const partialFrame = applyOps(partialBootstrapFrame, partialOps);
  return { fullOps, partialOps, fullFrame, partialFrame };
}

function runCommitSequenceScenario<S>(
  viewFn: (snapshot: Readonly<S>) => VNode,
  initialSnapshot: Readonly<S>,
  updates: readonly Readonly<S>[],
  viewport: Viewport,
  partialPlan: WidgetRenderPlan,
): SequenceScenarioResult {
  const fullBuilder = new RecordingBuilder();
  const partialBuilder = new RecordingBuilder();
  const fullRenderer = new WidgetRenderer<S>({
    backend: createNoopBackend(),
    builder: fullBuilder,
  });
  const partialRenderer = new WidgetRenderer<S>({
    backend: createNoopBackend(),
    builder: partialBuilder,
  });

  const blank = createFramebuffer(viewport);
  let fullFrame = applyOps(
    blank,
    submitOps(fullRenderer, fullBuilder, viewFn, initialSnapshot, viewport, FULL_PLAN),
  );
  let partialFrame = applyOps(
    blank,
    submitOps(partialRenderer, partialBuilder, viewFn, initialSnapshot, viewport, FULL_PLAN),
  );
  assertFramebuffersEqual(fullFrame, partialFrame);

  const fullOpsByFrame: Array<readonly RecordedOp[]> = [];
  const partialOpsByFrame: Array<readonly RecordedOp[]> = [];

  for (const nextSnapshot of updates) {
    const fullOps = submitOps(fullRenderer, fullBuilder, viewFn, nextSnapshot, viewport, FULL_PLAN);
    const partialOps = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      nextSnapshot,
      viewport,
      partialPlan,
    );
    fullFrame = applyOps(fullFrame, fullOps);
    partialFrame = applyOps(partialFrame, partialOps);
    fullOpsByFrame.push(fullOps);
    partialOpsByFrame.push(partialOps);
  }

  return Object.freeze({
    fullFrame,
    partialFrame,
    fullOpsByFrame: Object.freeze(fullOpsByFrame),
    partialOpsByFrame: Object.freeze(partialOpsByFrame),
  });
}

type EditSnapshot = Readonly<{ editIndex: number }>;
function denseListView(snapshot: Readonly<EditSnapshot>, count: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < count; i++) {
    const label =
      i === snapshot.editIndex
        ? `edit-${String(i).padStart(3, "0")}`
        : `item-${String(i).padStart(3, "0")}`;
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(label),
        ui.text("payload"),
        ui.text(`line-${String(i).padStart(3, "0")}`),
      ]),
    );
  }
  return ui.column({ p: 1, gap: 0 }, rows);
}

function focusListView(buttonCount: number): VNode {
  const buttons: VNode[] = [];
  for (let i = 0; i < buttonCount; i++) {
    buttons.push(ui.button({ id: `btn-${String(i)}`, label: `Button ${String(i)}` }));
  }
  return ui.column({ p: 1, gap: 0 }, buttons);
}

function virtualListView(itemCount: number): VNode {
  const items = Array.from({ length: itemCount }, (_, i) => `row-${String(i).padStart(3, "0")}`);
  return ui.column({ p: 0 }, [
    ui.text("VirtualList"),
    ui.virtualList({
      id: "logs",
      items,
      itemHeight: 1,
      renderItem: (item, index, focused) =>
        ui.text(`${focused ? ">" : " "} ${String(index).padStart(3, "0")} ${item}`),
    }),
  ]);
}

function buildLogsEntries(count: number): readonly {
  id: string;
  timestamp: number;
  level: "info";
  source: string;
  message: string;
}[] {
  const out = new Array<{
    id: string;
    timestamp: number;
    level: "info";
    source: string;
    message: string;
  }>(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      id: `log-${String(i)}`,
      timestamp: i * 1000,
      level: "info",
      source: "bench",
      message: `entry ${String(i).padStart(4, "0")} lorem ipsum`,
    };
  }
  return Object.freeze(out);
}

function logsConsoleView(
  entries: readonly {
    id: string;
    timestamp: number;
    level: "info";
    source: string;
    message: string;
  }[],
  scrollTop: number,
  onScroll: (next: number) => void,
): VNode {
  return ui.logsConsole({
    id: "logs",
    entries,
    scrollTop,
    onScroll,
  });
}

function logsConsoleViewWithOverlay(
  entries: readonly {
    id: string;
    timestamp: number;
    level: "info";
    source: string;
    message: string;
  }[],
  scrollTop: number,
  onScroll: (next: number) => void,
): VNode {
  return ui.box({ border: "none", width: "full", height: "full" }, [
    ui.logsConsole({
      id: "logs",
      entries,
      scrollTop,
      onScroll,
    }),
    ui.box(
      {
        border: "none",
        width: 7,
        height: 1,
        position: "absolute",
        top: 3,
        left: 4,
      },
      [ui.text("OVERLAY")],
    ),
  ]);
}

type LayoutSnapshot = Readonly<{ wide: boolean }>;
function layoutSensitiveView(snapshot: Readonly<LayoutSnapshot>): VNode {
  return ui.row({ gap: 1 }, [
    ui.text(snapshot.wide ? "WIDE-LABEL" : "N........"),
    ui.button({ id: "save", label: "Save" }),
    ui.button({ id: "cancel", label: "Cancel" }),
  ]);
}

type OrderSnapshot = Readonly<{ reverse: boolean }>;
function keyedOrderView(snapshot: Readonly<OrderSnapshot>): VNode {
  const values = snapshot.reverse ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
  return ui.row(
    { gap: 1 },
    values.map((value) => ui.text(`item-${String(value)}`, { key: `k-${String(value)}` })),
  );
}

function keyedColumnOrderView(snapshot: Readonly<OrderSnapshot>): VNode {
  const values = snapshot.reverse ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
  return ui.column(
    { p: 1, gap: 0 },
    values.map((value) => ui.text(`item-${String(value)}`, { key: `kc-${String(value)}` })),
  );
}

function nestedClipView(snapshot: Readonly<EditSnapshot>): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < 160; i++) {
    const label =
      i === snapshot.editIndex
        ? `edit-${String(i).padStart(3, "0")}`
        : `item-${String(i).padStart(3, "0")}`;
    rows.push(ui.text(label));
  }
  return ui.box({ border: "single", overflow: "scroll", p: 1 }, [
    ui.box({ border: "single", overflow: "scroll", p: 1 }, [ui.column({ gap: 0 }, rows)]),
  ]);
}

describe("renderer partial dirty-subtree correctness", () => {
  const viewport: Viewport = Object.freeze({ cols: 120, rows: 40 });

  for (const editIndex of [0, 1, 2, 7, 15, 31, 63, 95, 127, 159, 191, 223]) {
    test(`single text change @${String(editIndex)} matches full framebuffer`, () => {
      const scenario = runCommitScenario<EditSnapshot>(
        (snapshot) => denseListView(snapshot, 240),
        Object.freeze({ editIndex: -1 }),
        Object.freeze({ editIndex }),
        viewport,
      );
      assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
    });
  }

  for (const tabCount of [1, 2, 3, 4, 5, 7]) {
    test(`focus change (${String(tabCount)} tab presses) matches full framebuffer`, () => {
      const events: ZrevEvent[] = [];
      for (let i = 0; i < tabCount; i++) {
        events.push(tabEvent(100 + i));
      }
      const scenario = runEventScenario(
        () => focusListView(180),
        Object.freeze({}),
        viewport,
        events,
      );
      assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
    });
  }

  const wheelSequences: readonly (readonly number[])[] = Object.freeze([
    Object.freeze([1]),
    Object.freeze([2]),
    Object.freeze([1, -1]),
    Object.freeze([1, 1, -1, 2]),
  ]);
  for (let i = 0; i < wheelSequences.length; i++) {
    const seq = wheelSequences[i] ?? [];
    test(`virtualList scroll sequence ${String(i + 1)} matches full framebuffer`, () => {
      const events: ZrevEvent[] = [];
      for (let j = 0; j < seq.length; j++) {
        const wheelY = seq[j] ?? 0;
        events.push(wheelEvent(200 + j, 2, 3, wheelY));
      }
      const scenario = runEventScenario(
        () => virtualListView(320),
        Object.freeze({}),
        viewport,
        events,
      );
      assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
    });
  }

  test("layout change commit path still matches full framebuffer", () => {
    const scenario = runCommitScenario<LayoutSnapshot>(
      layoutSensitiveView,
      Object.freeze({ wide: false }),
      Object.freeze({ wide: true }),
      viewport,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
  });

  test("keyed reorder commit path still matches full framebuffer", () => {
    const scenario = runCommitScenario<OrderSnapshot>(
      keyedOrderView,
      Object.freeze({ reverse: false }),
      Object.freeze({ reverse: true }),
      viewport,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
  });

  test("keyed column reorder with layout-stability check disabled matches full framebuffer", () => {
    const scenario = runCommitScenario<OrderSnapshot>(
      keyedColumnOrderView,
      Object.freeze({ reverse: false }),
      Object.freeze({ reverse: true }),
      viewport,
      PARTIAL_COMMIT_NO_STABILITY_PLAN,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
  });

  test("no-change render-only pass still matches full framebuffer", () => {
    const scenario = runCommitScenario<EditSnapshot>(
      (snapshot) => denseListView(snapshot, 180),
      Object.freeze({ editIndex: -1 }),
      Object.freeze({ editIndex: -1 }),
      viewport,
      PARTIAL_RENDER_ONLY_PLAN,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
  });

  test("ancestor clips remain balanced when clean siblings are skipped", () => {
    const scenario = runCommitScenario<EditSnapshot>(
      nestedClipView,
      Object.freeze({ editIndex: -1 }),
      Object.freeze({ editIndex: 120 }),
      viewport,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);

    let pushCount = 0;
    let popCount = 0;
    for (const op of scenario.partialOps) {
      if (op.kind === "pushClip") pushCount++;
      if (op.kind === "popClip") popCount++;
    }
    assert.equal(pushCount > 0, true, "expected incremental frame to emit clips");
    assert.equal(pushCount, popCount, "pushClip/popClip must be balanced");
  });

  test("logsConsole scroll 1 row/frame matches full framebuffer and emits blit", () => {
    const entries = buildLogsEntries(320);
    const onScroll = (_next: number) => {};
    const updates = Object.freeze(
      Array.from({ length: 10 }, (_, i) => Object.freeze({ scrollTop: i + 1 })),
    );
    const scenario = runCommitSequenceScenario<{ scrollTop: number }>(
      (snapshot) => logsConsoleView(entries, snapshot.scrollTop, onScroll),
      Object.freeze({ scrollTop: 0 }),
      updates,
      viewport,
      PARTIAL_COMMIT_NO_STABILITY_PLAN,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);

    let blitFrames = 0;
    for (const ops of scenario.partialOpsByFrame) {
      if (ops.some((op) => op.kind === "blitRect")) blitFrames++;
    }
    assert.equal(blitFrames > 0, true);
  });

  test("logsConsole multi-row scroll matches full framebuffer", () => {
    const entries = buildLogsEntries(320);
    const onScroll = (_next: number) => {};
    const updates = Object.freeze([
      Object.freeze({ scrollTop: 3 }),
      Object.freeze({ scrollTop: 6 }),
      Object.freeze({ scrollTop: 9 }),
      Object.freeze({ scrollTop: 12 }),
    ]);
    const scenario = runCommitSequenceScenario<{ scrollTop: number }>(
      (snapshot) => logsConsoleView(entries, snapshot.scrollTop, onScroll),
      Object.freeze({ scrollTop: 0 }),
      updates,
      viewport,
      PARTIAL_COMMIT_NO_STABILITY_PLAN,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
  });

  test("logsConsole alternating scroll directions matches full framebuffer", () => {
    const entries = buildLogsEntries(320);
    const onScroll = (_next: number) => {};
    const updates = Object.freeze([
      Object.freeze({ scrollTop: 6 }),
      Object.freeze({ scrollTop: 4 }),
      Object.freeze({ scrollTop: 7 }),
      Object.freeze({ scrollTop: 5 }),
      Object.freeze({ scrollTop: 8 }),
      Object.freeze({ scrollTop: 6 }),
    ]);
    const scenario = runCommitSequenceScenario<{ scrollTop: number }>(
      (snapshot) => logsConsoleView(entries, snapshot.scrollTop, onScroll),
      Object.freeze({ scrollTop: 2 }),
      updates,
      viewport,
      PARTIAL_COMMIT_NO_STABILITY_PLAN,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
  });

  test("logsConsole with overlapping absolute sibling skips blit and matches full framebuffer", () => {
    const entries = buildLogsEntries(320);
    const onScroll = (_next: number) => {};
    const updates = Object.freeze([
      Object.freeze({ scrollTop: 1 }),
      Object.freeze({ scrollTop: 2 }),
      Object.freeze({ scrollTop: 3 }),
      Object.freeze({ scrollTop: 4 }),
    ]);
    const scenario = runCommitSequenceScenario<{ scrollTop: number }>(
      (snapshot) => logsConsoleViewWithOverlay(entries, snapshot.scrollTop, onScroll),
      Object.freeze({ scrollTop: 0 }),
      updates,
      viewport,
      PARTIAL_COMMIT_NO_STABILITY_PLAN,
    );
    assertFramebuffersEqual(scenario.partialFrame, scenario.fullFrame);
    for (const ops of scenario.partialOpsByFrame) {
      assert.equal(
        ops.some((op) => op.kind === "blitRect"),
        false,
      );
    }
  });
});
