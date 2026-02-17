import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type {
  DrawlistBuildResult,
  DrawlistBuilderV1,
  DrawlistBuilderV2,
} from "../../drawlist/index.js";
import type { CursorState } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { TextStyle, VNode } from "../../index.js";
import { ui } from "../../index.js";
import { ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { Viewport } from "../widgetRenderer.js";
import { type WidgetRenderPlan, WidgetRenderer } from "../widgetRenderer.js";

type RecordedOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>
  | Readonly<{ kind: "setCursor"; state: CursorState }>
  | Readonly<{ kind: "hideCursor" }>;

class RecordingBuilder implements DrawlistBuilderV1 {
  protected ops: RecordedOp[] = [];
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
    // Force renderers down the drawText fallback path for deterministic tests.
    return null;
  }

  drawTextRun(_x: number, _y: number, _blobIndex: number): void {}

  build(): DrawlistBuildResult {
    this.lastBuiltOps = this.ops.slice();
    return { ok: true, bytes: new Uint8Array([this.ops.length & 0xff]) };
  }

  reset(): void {
    this.ops = [];
  }
}

class RecordingBuilderV2 extends RecordingBuilder implements DrawlistBuilderV2 {
  setCursor(state: CursorState): void {
    this.ops.push({ kind: "setCursor", state });
  }

  hideCursor(): void {
    this.ops.push({ kind: "hideCursor" });
  }
}

type Framebuffer = Readonly<{
  cols: number;
  rows: number;
  chars: string[];
  styles: string[];
}>;

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Unit tests use submitFrame directly.
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
      Number.isFinite(rgb.r) &&
      typeof rgb.g === "number" &&
      Number.isFinite(rgb.g) &&
      typeof rgb.b === "number" &&
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
    assert.equal(actual.chars[i], expected.chars[i], `char mismatch at cell ${String(i)}`);
    assert.equal(actual.styles[i], expected.styles[i], `style mismatch at cell ${String(i)}`);
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

const CONTENT_LIST_SIZE = 500;

function contentUpdateTree(selected: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < CONTENT_LIST_SIZE; i++) {
    const isSelected = i === selected;
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(isSelected ? ">" : " ", { style: { bold: isSelected } }),
        ui.text(`${String(i).padStart(3, " ")}.`, { style: { dim: !isSelected } }),
        ui.text(`entry-${i}.log`, { style: { bold: isSelected, inverse: isSelected } }),
        ui.text(`${(i * 1024 + 512).toLocaleString()} B`, { style: { dim: true } }),
      ]),
    );
  }
  return ui.column({ p: 0 }, [
    ui.row({ gap: 2 }, [
      ui.text("Files", { style: { bold: true } }),
      ui.text(`${CONTENT_LIST_SIZE} items`),
      ui.text(`Selected: ${selected}`, { style: { dim: true } }),
    ]),
    ui.divider(),
    ...rows,
  ]);
}

describe("WidgetRenderer incremental drawlist emission", () => {
  test("content-update frame matches full render from same prior framebuffer", () => {
    const viewport: Viewport = { cols: 120, rows: 540 };
    const backend = createNoopBackend();

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<{ selected: number }>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });
    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<{ selected: number }>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const planBootstrap = { commit: true, layout: true, checkLayoutStability: true } as const;
    const planUpdate = { commit: true, layout: false, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      (s) => contentUpdateTree(s.selected),
      { selected: 10 },
      viewport,
      planBootstrap,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    const opsBExpected = submitOps(
      fullRenderer,
      fullBuilder,
      (s) => contentUpdateTree(s.selected),
      { selected: 11 },
      viewport,
      planBootstrap,
    );
    const framebufferBExpected = applyOps(createFramebuffer(viewport), opsBExpected);

    const opsBPartial = submitOps(
      partialRenderer,
      partialBuilder,
      (s) => contentUpdateTree(s.selected),
      { selected: 11 },
      viewport,
      planUpdate,
    );
    const framebufferBPartial = applyOps(framebufferA, opsBPartial);

    assertFramebuffersEqual(framebufferBPartial, framebufferBExpected);
    assert.equal(
      opsBPartial.some((op) => op.kind === "clearTo"),
      false,
    );

    const viewportArea = viewport.cols * viewport.rows;
    let damagedArea = 0;
    for (const op of opsBPartial) {
      if (op.kind === "fillRect") damagedArea += op.w * op.h;
    }
    assert.equal(damagedArea < Math.floor(viewportArea * 0.2), true);
  });

  test("focus change without commit is equivalent to full frame", () => {
    const viewport: Viewport = { cols: 50, rows: 10 };
    const backend = createNoopBackend();
    const viewFn = () =>
      ui.column({}, [
        ui.button({ id: "a", label: "Alpha" }),
        ui.button({ id: "b", label: "Beta" }),
      ]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<void>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });
    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<void>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const initialPlan = { commit: true, layout: true, checkLayoutStability: true } as const;
    const partialPlan = { commit: false, layout: false, checkLayoutStability: false } as const;
    const forcedFullPlan = { commit: false, layout: true, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      undefined,
      viewport,
      initialPlan,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    partialRenderer.routeEngineEvent({
      kind: "key",
      timeMs: 0,
      key: ZR_KEY_TAB,
      mods: 0,
      action: "down",
    });
    const opsFocusedPartial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      undefined,
      viewport,
      partialPlan,
    );
    const framebufferFocusedPartial = applyOps(framebufferA, opsFocusedPartial);

    submitOps(fullRenderer, fullBuilder, viewFn, undefined, viewport, initialPlan);
    fullRenderer.routeEngineEvent({
      kind: "key",
      timeMs: 0,
      key: ZR_KEY_TAB,
      mods: 0,
      action: "down",
    });
    const opsFocusedFull = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      undefined,
      viewport,
      forcedFullPlan,
    );
    const framebufferFocusedExpected = applyOps(createFramebuffer(viewport), opsFocusedFull);

    assertFramebuffersEqual(framebufferFocusedPartial, framebufferFocusedExpected);
    if (!opsFocusedPartial.some((op) => op.kind === "clearTo")) {
      assert.equal(
        opsFocusedPartial.some((op) => op.kind === "fillRect"),
        true,
      );
    }
  });

  test("spinner tick updates correctly in partial mode", () => {
    const viewport: Viewport = { cols: 40, rows: 8 };
    const backend = createNoopBackend();
    const viewFn = () => ui.column({}, [ui.spinner({ variant: "line", label: "Loading" })]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<void>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });
    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<void>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const initialPlan = { commit: true, layout: true, checkLayoutStability: true } as const;
    const partialTickPlan = { commit: false, layout: false, checkLayoutStability: false } as const;
    const forcedFullTickPlan = {
      commit: false,
      layout: true,
      checkLayoutStability: false,
    } as const;

    const opsTick0 = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      undefined,
      viewport,
      initialPlan,
    );
    const framebufferTick0 = applyOps(createFramebuffer(viewport), opsTick0);
    const opsTick1Partial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      undefined,
      viewport,
      partialTickPlan,
    );
    const framebufferTick1Partial = applyOps(framebufferTick0, opsTick1Partial);

    submitOps(fullRenderer, fullBuilder, viewFn, undefined, viewport, initialPlan);
    const opsTick1Expected = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      undefined,
      viewport,
      forcedFullTickPlan,
    );
    const framebufferTick1Expected = applyOps(createFramebuffer(viewport), opsTick1Expected);

    assertFramebuffersEqual(framebufferTick1Partial, framebufferTick1Expected);
    assert.equal(
      opsTick1Partial.some((op) => op.kind === "clearTo"),
      false,
    );
  });

  test("shadowed box redraws on shadow-only damage intersections", () => {
    const viewport: Viewport = { cols: 40, rows: 10 };
    const backend = createNoopBackend();

    const viewFn = (s: Readonly<{ label: string }>) =>
      ui.layers([
        ui.column({}, [
          ui.spacer({ size: 2 }),
          ui.row({}, [ui.spacer({ size: 10 }), ui.text(s.label)]),
        ]),
        ui.box({ width: 10, height: 4, border: "single", shadow: true }, [ui.text("panel")]),
      ]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<{ label: string }>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });

    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<{ label: string }>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const planBootstrap = { commit: true, layout: true, checkLayoutStability: true } as const;
    const planUpdate = { commit: true, layout: false, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { label: "alpha" },
      viewport,
      planBootstrap,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    const opsExpected = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      { label: "omega" },
      viewport,
      planBootstrap,
    );
    const framebufferExpected = applyOps(createFramebuffer(viewport), opsExpected);

    const opsPartial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { label: "omega" },
      viewport,
      planUpdate,
    );
    const framebufferPartial = applyOps(framebufferA, opsPartial);

    assertFramebuffersEqual(framebufferPartial, framebufferExpected);
    assert.equal(
      opsPartial.some((op) => op.kind === "clearTo"),
      false,
    );
  });

  test("shadow toggle on layout-skipped commit matches full render", () => {
    const viewport: Viewport = { cols: 40, rows: 10 };
    const backend = createNoopBackend();

    const viewFn = (s: Readonly<{ shadow: boolean }>) =>
      ui.layers([
        ui.column({}, [
          ui.spacer({ size: 1 }),
          ui.row({}, [ui.spacer({ size: 10 }), ui.text("X")]),
        ]),
        ui.box({ width: 10, height: 3, border: "single", shadow: s.shadow }, [ui.text("box")]),
      ]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<{ shadow: boolean }>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });

    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<{ shadow: boolean }>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const planBootstrap = { commit: true, layout: true, checkLayoutStability: true } as const;
    const planUpdate = { commit: true, layout: false, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { shadow: false },
      viewport,
      planBootstrap,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    const opsExpected = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      { shadow: true },
      viewport,
      planBootstrap,
    );
    const framebufferExpected = applyOps(createFramebuffer(viewport), opsExpected);

    const opsPartial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { shadow: true },
      viewport,
      planUpdate,
    );
    const framebufferPartial = applyOps(framebufferA, opsPartial);

    assertFramebuffersEqual(framebufferPartial, framebufferExpected);
    assert.equal(
      opsPartial.some((op) => op.kind === "clearTo"),
      false,
    );
  });

  test("strikethrough-only style change in commit path matches full render", () => {
    const viewport: Viewport = { cols: 32, rows: 6 };
    const backend = createNoopBackend();

    const viewFn = (s: Readonly<{ strike: boolean }>) =>
      ui.column({}, [
        ui.text("Header"),
        ui.text("strike-target", { style: { strikethrough: s.strike } }),
        ui.text("Footer"),
      ]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<{ strike: boolean }>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });

    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<{ strike: boolean }>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const planBootstrap = { commit: true, layout: true, checkLayoutStability: true } as const;
    const planUpdate = { commit: true, layout: false, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { strike: false },
      viewport,
      planBootstrap,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    const opsExpected = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      { strike: true },
      viewport,
      planBootstrap,
    );
    const framebufferExpected = applyOps(createFramebuffer(viewport), opsExpected);

    const opsPartial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { strike: true },
      viewport,
      planUpdate,
    );
    const framebufferPartial = applyOps(framebufferA, opsPartial);

    assertFramebuffersEqual(framebufferPartial, framebufferExpected);
    assert.equal(
      opsPartial.some((op) => op.kind === "clearTo"),
      false,
    );
    assert.equal(
      opsPartial.some(
        (op) =>
          op.kind === "drawText" &&
          op.text === "strike-target" &&
          (op.style?.strikethrough ?? false) === true,
      ),
      true,
    );
  });

  test("overline-only style change in commit path matches full render", () => {
    const viewport: Viewport = { cols: 32, rows: 6 };
    const backend = createNoopBackend();

    const viewFn = (s: Readonly<{ overline: boolean }>) =>
      ui.column({}, [
        ui.text("Header"),
        ui.text("overline-target", { style: { overline: s.overline } }),
        ui.text("Footer"),
      ]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<{ overline: boolean }>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });

    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<{ overline: boolean }>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const planBootstrap = { commit: true, layout: true, checkLayoutStability: true } as const;
    const planUpdate = { commit: true, layout: false, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { overline: false },
      viewport,
      planBootstrap,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    const opsExpected = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      { overline: true },
      viewport,
      planBootstrap,
    );
    const framebufferExpected = applyOps(createFramebuffer(viewport), opsExpected);

    const opsPartial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { overline: true },
      viewport,
      planUpdate,
    );
    const framebufferPartial = applyOps(framebufferA, opsPartial);

    assertFramebuffersEqual(framebufferPartial, framebufferExpected);
    assert.equal(
      opsPartial.some((op) => op.kind === "clearTo"),
      false,
    );
    assert.equal(
      opsPartial.some(
        (op) =>
          op.kind === "drawText" &&
          op.text === "overline-target" &&
          (op.style?.overline ?? false) === true,
      ),
      true,
    );
  });

  test("blink-only style change in commit path matches full render", () => {
    const viewport: Viewport = { cols: 32, rows: 6 };
    const backend = createNoopBackend();

    const viewFn = (s: Readonly<{ blink: boolean }>) =>
      ui.column({}, [
        ui.text("Header"),
        ui.text("blink-target", { style: { blink: s.blink } }),
        ui.text("Footer"),
      ]);

    const partialBuilder = new RecordingBuilder();
    const partialRenderer = new WidgetRenderer<{ blink: boolean }>({
      backend,
      builder: partialBuilder,
      requestRender: () => {},
    });

    const fullBuilder = new RecordingBuilder();
    const fullRenderer = new WidgetRenderer<{ blink: boolean }>({
      backend,
      builder: fullBuilder,
      requestRender: () => {},
    });

    const planBootstrap = { commit: true, layout: true, checkLayoutStability: true } as const;
    const planUpdate = { commit: true, layout: false, checkLayoutStability: false } as const;

    const opsA = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { blink: false },
      viewport,
      planBootstrap,
    );
    const framebufferA = applyOps(createFramebuffer(viewport), opsA);

    const opsExpected = submitOps(
      fullRenderer,
      fullBuilder,
      viewFn,
      { blink: true },
      viewport,
      planBootstrap,
    );
    const framebufferExpected = applyOps(createFramebuffer(viewport), opsExpected);

    const opsPartial = submitOps(
      partialRenderer,
      partialBuilder,
      viewFn,
      { blink: true },
      viewport,
      planUpdate,
    );
    const framebufferPartial = applyOps(framebufferA, opsPartial);

    assertFramebuffersEqual(framebufferPartial, framebufferExpected);
    assert.equal(
      opsPartial.some((op) => op.kind === "clearTo"),
      false,
    );
    assert.equal(
      opsPartial.some(
        (op) =>
          op.kind === "drawText" &&
          op.text === "blink-target" &&
          (op.style?.blink ?? false) === true,
      ),
      true,
    );
  });

  test("incremental v2 cursor is emitted even when focused input is outside damage rect", () => {
    const viewport: Viewport = { cols: 40, rows: 8 };
    const backend = createNoopBackend();
    const builder = new RecordingBuilderV2();
    const renderer = new WidgetRenderer<void>({
      backend,
      builder,
      useV2Cursor: true,
      requestRender: () => {},
    });
    const viewFn = () =>
      ui.column({}, [ui.input({ id: "q", value: "hello" }), ui.spinner({ variant: "line" })]);

    submitOps(renderer, builder, viewFn, undefined, viewport, {
      commit: true,
      layout: true,
      checkLayoutStability: true,
    });

    renderer.routeEngineEvent({
      kind: "key",
      timeMs: 0,
      key: ZR_KEY_TAB,
      mods: 0,
      action: "down",
    });
    submitOps(renderer, builder, viewFn, undefined, viewport, {
      commit: false,
      layout: false,
      checkLayoutStability: false,
    });

    const opsTick = submitOps(renderer, builder, viewFn, undefined, viewport, {
      commit: false,
      layout: false,
      checkLayoutStability: false,
    });
    assert.equal(
      opsTick.some((op) => op.kind === "clearTo"),
      false,
    );
    assert.equal(
      opsTick.some((op) => op.kind === "hideCursor"),
      false,
    );
    const setCursorOp = opsTick.find((op) => op.kind === "setCursor");
    assert.equal(setCursorOp !== undefined, true);
    if (setCursorOp && setCursorOp.kind === "setCursor") {
      assert.equal(setCursorOp.state.visible, true);
      assert.equal(setCursorOp.state.x, 6);
      assert.equal(setCursorOp.state.y, 0);
    }
  });

  test("metadata collection is re-enabled when routing widgets are introduced", () => {
    const viewport: Viewport = { cols: 60, rows: 10 };
    const backend = createNoopBackend();
    const builder = new RecordingBuilder();
    const renderer = new WidgetRenderer<{ showButton: boolean }>({
      backend,
      builder,
      requestRender: () => {},
    });

    const viewFn = (s: Readonly<{ showButton: boolean }>) =>
      ui.column(
        {},
        s.showButton
          ? [ui.text("Header"), ui.button({ id: "btn", label: "Press" })]
          : [ui.text("Header")],
      );

    submitOps(renderer, builder, viewFn, { showButton: false }, viewport, {
      commit: true,
      layout: true,
      checkLayoutStability: true,
    });
    submitOps(renderer, builder, viewFn, { showButton: true }, viewport, {
      commit: true,
      layout: false,
      checkLayoutStability: true,
    });

    const route = renderer.routeEngineEvent({
      kind: "key",
      timeMs: 1,
      key: ZR_KEY_TAB,
      mods: 0,
      action: "down",
    });
    assert.equal(route.needsRender, true);
    assert.equal(renderer.getFocusedId(), "btn");
  });

  test("doLayout=true path falls back to full clear", () => {
    const viewport: Viewport = { cols: 40, rows: 8 };
    const backend = createNoopBackend();
    const builder = new RecordingBuilder();
    const renderer = new WidgetRenderer<{ selected: number }>({
      backend,
      builder,
      requestRender: () => {},
    });

    submitOps(renderer, builder, (s) => contentUpdateTree(s.selected), { selected: 0 }, viewport, {
      commit: true,
      layout: true,
      checkLayoutStability: true,
    });
    const secondOps = submitOps(
      renderer,
      builder,
      (s) => contentUpdateTree(s.selected),
      { selected: 1 },
      viewport,
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(
      secondOps.some((op) => op.kind === "clearTo"),
      true,
    );
  });
});
