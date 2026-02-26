import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { App, DrawlistBuildResult, DrawlistBuilder, TextStyle, VNode } from "../../index.js";
import { createTheme, ui } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { darkTheme } from "../presets.js";
import type { Theme } from "../theme.js";

type EncodedEvent = NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>[number];

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function pushEvents(backend: StubBackend, events: readonly EncodedEvent[]): void {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
}

async function bootstrap<S>(app: App<S>, backend: StubBackend): Promise<void> {
  await app.start();
  pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 50, rows: 12 }]);
  await flushMicrotasks(12);
  assert.equal(backend.requestedFrames.length, 1, "bootstrap frame submitted");
}

async function resolveNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(8);
}

function themeWithPrimary(r: number, g: number, b: number): Theme {
  return createTheme({
    colors: {
      primary: ((r << 16) | (g << 8) | b),
    },
  });
}

class RecordingBuilder implements DrawlistBuilder {
  readonly textOps: Array<Readonly<{ text: string; style?: TextStyle }>> = [];

  clear(): void {}
  clearTo(_cols: number, _rows: number, _style?: TextStyle): void {}
  fillRect(_x: number, _y: number, _w: number, _h: number, _style?: TextStyle): void {}
  drawText(_x: number, _y: number, text: string, style?: TextStyle): void {
    this.textOps.push(style ? { text, style } : { text });
  }
  pushClip(_x: number, _y: number, _w: number, _h: number): void {}
  popClip(): void {}
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
    return { ok: true, bytes: new Uint8Array() };
  }
  reset(): void {}
}

function renderTextOps(
  vnode: VNode,
  theme: Theme,
): readonly Readonly<{ text: string; style?: TextStyle }>[] {
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return [];

  const layoutRes = layout(committed.value.root.vnode, 0, 0, 60, 12, "column");
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return [];

  const builder = new RecordingBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport: { cols: 60, rows: 12 },
    focusState: Object.freeze({ focusedId: null }),
    builder,
    theme,
  });
  return builder.textOps;
}

function fgByText(
  ops: readonly Readonly<{ text: string; style?: TextStyle }>[],
  text: string,
): unknown {
  for (const op of ops) {
    if (op.text.includes(text)) return op.style?.fg;
  }
  return undefined;
}

describe("theme runtime switching", () => {
  test("switch submits a render frame with changed drawlist bytes", async () => {
    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: 0,
      theme: themeWithPrimary(200, 20, 20),
    });

    app.view(() => ui.divider({ label: "THEME", color: "primary" }));

    await bootstrap(app, backend);
    const firstFrame = backend.requestedFrames[0]?.slice();
    assert.ok(firstFrame);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(20, 220, 20));
    await flushMicrotasks(10);

    const secondFrame = backend.requestedFrames[1]?.slice();
    assert.ok(secondFrame);
    assert.equal(backend.requestedFrames.length, 2, "theme switch frame submitted");
    assert.equal(bytesEqual(firstFrame, secondFrame), false, "frame bytes changed with theme");
  });

  test("focused widget is preserved across theme switch", async () => {
    const backend = new StubBackend();
    const presses: string[] = [];
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.column({}, [ui.button({ id: "a", label: "A" }), ui.button({ id: "b", label: "B" })]),
    );
    app.onEvent((ev) => {
      if (ev.kind === "action" && ev.action === "press") {
        presses.push(ev.id);
      }
    });

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 10, key: 3, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);
    pushEvents(backend, [{ kind: "key", timeMs: 11, key: 3, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(30, 170, 240));
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 12, key: 2, action: "down" }]);
    await flushMicrotasks(10);

    assert.deepEqual(presses, ["b"]);
  });

  test("virtualList scroll/selection state survives theme switch", async () => {
    const backend = new StubBackend();
    const selected: string[] = [];
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.virtualList({
        id: "v",
        items: Array.from({ length: 100 }, (_v, i) => `item-${String(i)}`),
        itemHeight: 1,
        renderItem: (item) => ui.text(item),
        onSelect: (item, index) => selected.push(`${item}:${String(index)}`),
      }),
    );

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 10, key: 3, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);
    pushEvents(backend, [{ kind: "key", timeMs: 11, key: 13, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(40, 120, 210));
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 12, key: 2, action: "down" }]);
    await flushMicrotasks(10);

    assert.deepEqual(selected, ["item-99:99"]);
  });

  test("table scroll/focus state survives theme switch", async () => {
    const backend = new StubBackend();
    const pressed: string[] = [];
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.table({
        id: "t",
        columns: [{ key: "id", header: "ID", flex: 1 }],
        data: Array.from({ length: 100 }, (_v, i) => ({ id: `r${String(i)}` })),
        getRowKey: (row) => row.id,
        onRowPress: (row, index) => pressed.push(`${row.id}:${String(index)}`),
      }),
    );

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 10, key: 3, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);
    pushEvents(backend, [{ kind: "key", timeMs: 11, key: 13, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(200, 120, 40));
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 12, key: 2, action: "down" }]);
    await flushMicrotasks(10);

    assert.deepEqual(pressed, ["r99:99"]);
  });

  test("input value/cursor state survives theme switch", async () => {
    const backend = new StubBackend();
    const edits: string[] = [];
    const app = createApp({
      backend,
      initialState: { value: "" },
    });

    app.view((s) => ui.input({ id: "name", value: s.value }));
    app.onEvent((ev) => {
      if (ev.kind !== "action" || ev.id !== "name" || ev.action !== "input") return;
      edits.push(`${ev.value}:${String(ev.cursor)}`);
      app.update((prev) => ({ ...prev, value: ev.value }));
    });

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "key", timeMs: 10, key: 3, action: "down" }]);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);
    pushEvents(backend, [{ kind: "text", timeMs: 11, codepoint: 65 }]); // A
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(170, 50, 200));
    await flushMicrotasks(10);
    await resolveNextFrame(backend);

    pushEvents(backend, [{ kind: "text", timeMs: 12, codepoint: 66 }]); // B
    await flushMicrotasks(10);

    assert.deepEqual(edits, ["A:1", "AB:2"]);
  });

  test("rapid repeated theme switches remain safe and coalesce under backpressure", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.divider({ label: "RAPID", color: "primary" }));

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(200, 40, 40));
    await flushMicrotasks(10);
    assert.equal(backend.requestedFrames.length, 2, "first switch submits frame");

    app.setTheme(themeWithPrimary(40, 200, 40));
    app.setTheme(themeWithPrimary(40, 40, 220));
    await flushMicrotasks(10);
    assert.equal(backend.requestedFrames.length, 2, "extra switches coalesced while in-flight");

    const inFlightFrame = backend.requestedFrames[1]?.slice();
    assert.ok(inFlightFrame);
    await resolveNextFrame(backend);
    assert.equal(backend.requestedFrames.length, 3, "latest theme submitted after settle");

    const latestFrame = backend.requestedFrames[2]?.slice();
    assert.ok(latestFrame);
    assert.equal(bytesEqual(inFlightFrame, latestFrame), false, "latest switch updates output");
  });

  test("setTheme no-ops for identical Theme object identity", async () => {
    const backend = new StubBackend();
    const sharedTheme = themeWithPrimary(180, 30, 30);
    const app = createApp({
      backend,
      initialState: 0,
      theme: sharedTheme,
    });

    app.view(() => ui.divider({ label: "SAME", color: "primary" }));

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    app.setTheme(sharedTheme);
    await flushMicrotasks(10);

    assert.equal(backend.requestedFrames.length, 1, "same theme identity is a no-op");
  });

  test("setTheme no-ops for identical ThemeDefinition identity", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.divider({ label: "DEF", color: "primary" }));

    await bootstrap(app, backend);
    await resolveNextFrame(backend);

    app.setTheme(darkTheme);
    await flushMicrotasks(10);
    await resolveNextFrame(backend);
    assert.equal(backend.requestedFrames.length, 2, "first definition switch renders");

    app.setTheme(darkTheme);
    await flushMicrotasks(10);
    assert.equal(backend.requestedFrames.length, 2, "same definition identity is a no-op");
  });
});

describe("theme scoped container overrides", () => {
  const RED = Object.freeze(((210 << 16) | (40 << 8) | 40));
  const GREEN = Object.freeze(((40 << 16) | (190 << 8) | 80));
  const BLUE = Object.freeze(((40 << 16) | (100 << 8) | 210));
  const CYAN = Object.freeze(((20 << 16) | (180 << 8) | 200));
  const baseTheme = createTheme({
    colors: {
      primary: RED,
      info: CYAN,
    },
  });

  test("box scoped override applies to subtree and restores parent theme", () => {
    const vnode = ui.column({}, [
      ui.divider({ label: "ROOT", color: "primary" }),
      ui.box({ border: "none", theme: { colors: { primary: GREEN } } }, [
        ui.divider({ label: "INNER", color: "primary" }),
      ]),
      ui.divider({ label: "AFTER", color: "primary" }),
    ]);

    const ops = renderTextOps(vnode, baseTheme);
    assert.deepEqual(fgByText(ops, "ROOT"), RED);
    assert.deepEqual(fgByText(ops, "INNER"), GREEN);
    assert.deepEqual(fgByText(ops, "AFTER"), RED);
  });

  test("nested container overrides compose and restore parent scopes", () => {
    const vnode = ui.column({}, [
      ui.divider({ label: "ROOT", color: "primary" }),
      ui.column({ theme: { colors: { primary: BLUE } } }, [
        ui.divider({ label: "ROW", color: "primary" }),
        ui.box({ border: "none", theme: { colors: { primary: GREEN } } }, [
          ui.divider({ label: "BOX", color: "primary" }),
        ]),
        ui.divider({ label: "ROW_AFTER", color: "primary" }),
      ]),
      ui.divider({ label: "ROOT_AFTER", color: "primary" }),
    ]);

    const ops = renderTextOps(vnode, baseTheme);
    assert.deepEqual(fgByText(ops, "ROOT"), RED);
    assert.deepEqual(fgByText(ops, "ROW"), BLUE);
    assert.deepEqual(fgByText(ops, "BOX"), GREEN);
    assert.deepEqual(fgByText(ops, "ROW_AFTER"), BLUE);
    assert.deepEqual(fgByText(ops, "ROOT_AFTER"), RED);
  });

  test("partial overrides inherit unspecified parent theme values", () => {
    const vnode = ui.box({ border: "none", theme: { colors: { primary: GREEN } } }, [
      ui.divider({ label: "PRIMARY", color: "primary" }),
      ui.divider({ label: "INFO", color: "info" }),
    ]);

    const ops = renderTextOps(vnode, baseTheme);
    assert.deepEqual(fgByText(ops, "PRIMARY"), GREEN);
    assert.deepEqual(fgByText(ops, "INFO"), CYAN);
  });

  test("token-style accent.primary override maps to legacy primary and restores parent", () => {
    const vnode = ui.column({}, [
      ui.divider({ label: "ROOT", color: "primary" }),
      ui.column({ theme: { colors: { accent: { primary: BLUE } } } }, [
        ui.divider({ label: "TOKEN_PRIMARY", color: "primary" }),
        ui.divider({ label: "TOKEN_PATH", color: "accent.primary" }),
      ]),
      ui.divider({ label: "AFTER", color: "primary" }),
    ]);

    const ops = renderTextOps(vnode, baseTheme);
    assert.deepEqual(fgByText(ops, "ROOT"), RED);
    assert.deepEqual(fgByText(ops, "TOKEN_PRIMARY"), BLUE);
    assert.deepEqual(fgByText(ops, "TOKEN_PATH"), BLUE);
    assert.deepEqual(fgByText(ops, "AFTER"), RED);
  });
});
