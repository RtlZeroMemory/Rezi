import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { ConstraintExpr } from "../../constraints/types.js";
import { expr, ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";

function noRenderHooks(): Readonly<{ enterRender: () => void; exitRender: () => void }> {
  return Object.freeze({ enterRender: () => {}, exitRender: () => {} });
}

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise(() => {
        // WidgetRenderer unit tests do not consume backend event polling.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function malformedUnknownCallExpr(): ConstraintExpr {
  const source = "clmp(10, parent.w, 20)";
  return Object.freeze({
    __brand: "ConstraintExpr" as const,
    source,
    ast: Object.freeze({
      kind: "call" as const,
      name: "clmp",
      args: Object.freeze([
        Object.freeze({ kind: "number" as const, value: 10 }),
        Object.freeze({
          kind: "ref" as const,
          scope: Object.freeze({ kind: "parent" as const }),
          prop: "w" as const,
        }),
        Object.freeze({ kind: "number" as const, value: 20 }),
      ]),
    }),
    refs: Object.freeze(new Set<string>()),
    hasIntrinsic: false,
    hasSiblingAggregation: false,
  });
}

describe("constraint integration", () => {
  test("resolves sibling/parent expressions before layout sizing", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.row({ id: "root", width: "full", gap: 0 }, [
      ui.column({ id: "sidebar", width: expr("20") }, [ui.text("sidebar")]),
      ui.column({ id: "editor", width: expr("parent.w - #sidebar.w") }, [ui.text("editor")]),
    ]);

    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, true);
    const rectById = renderer.getRectByIdIndex();
    assert.equal(rectById.get("sidebar")?.w, 20);
    assert.equal(rectById.get("editor")?.w, 60);
  });

  test("applies LayoutConstraints on grid widgets in stack layout", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.row({ id: "root", width: "full", gap: 0 }, [
      ui.grid({ id: "grid", columns: 1, width: expr("parent.w * 0.5") }, [ui.text("g")]),
      ui.column({ id: "rest", width: expr("parent.w - #grid.w") }, [ui.text("r")]),
    ]);

    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, true);
    const rectById = renderer.getRectByIdIndex();
    assert.equal(rectById.get("grid")?.w, 40);
    assert.equal(rectById.get("rest")?.w, 40);
  });

  test("rejects grid.columns expr() in alpha with deterministic invalid-props fatal", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.grid(
      {
        id: "grid",
        // Intentional alpha contract lock: columns is number|string only.
        columns: expr("max(1, floor(parent.w / 22))") as unknown as never,
      },
      [ui.text("g")],
    );

    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, false);
    if (submit.ok) return;
    assert.equal(submit.code, "ZRUI_INVALID_PROPS");
    assert.equal(
      submit.detail,
      "grid.columns must be a positive int32 or a non-empty track string",
    );
  });

  test("treats display-hidden siblings as zero in sibling size references", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.row({ id: "root", width: "full", gap: 0 }, [
      ui.column(
        {
          id: "sidebar",
          width: expr("20"),
          display: expr("0"),
        },
        [ui.text("sidebar")],
      ),
      ui.column({ id: "editor", width: expr("parent.w - #sidebar.w") }, [ui.text("editor")]),
    ]);

    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, true);
    const rectById = renderer.getRectByIdIndex();
    assert.equal(rectById.get("sidebar")?.w, 0);
    assert.equal(rectById.get("editor")?.w, 80);
  });

  test("keeps intrinsic self-reference widths stable across identical frames", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const view = () =>
      ui.column({ id: "root", width: "full" }, [
        ui.box({ id: "b", width: expr("intrinsic.w + 2") }, [ui.text("abc")]),
      ]);

    const observed: number[] = [];
    for (let i = 0; i < 5; i++) {
      const submit = renderer.submitFrame(
        view,
        undefined,
        { cols: 80, rows: 20 },
        defaultTheme,
        noRenderHooks(),
        { commit: true, layout: true, checkLayoutStability: true },
      );
      assert.equal(submit.ok, true);
      observed.push(renderer.getRectByIdIndex().get("b")?.w ?? -1);
    }

    assert.equal(observed.length, 5);
    const first = observed[0];
    if (first === undefined) throw new Error("expected at least one observed width");
    assert.equal(first > 0, true);
    assert.equal(
      observed.every((w) => w === first),
      true,
    );
  });

  test("avoids forced relayout on commit for non-layout-sensitive constraint graphs", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
      collectRuntimeBreadcrumbs: true,
    });

    let label = "editor-a";
    const view = () =>
      ui.row({ id: "root", width: "full", gap: 0 }, [
        ui.column({ id: "sidebar", width: expr("20") }, [ui.text("sidebar")]),
        ui.column({ id: "editor", width: expr("parent.w - #sidebar.w") }, [ui.text(label)]),
      ]);

    const first = renderer.submitFrame(
      view,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(first.ok, true);
    assert.equal(renderer.getRuntimeBreadcrumbSnapshot()?.frame.layout, true);
    const firstGraph = (renderer as unknown as { _constraintGraph?: unknown })._constraintGraph;

    label = "editor-b-updated";
    const second = renderer.submitFrame(
      view,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: false, checkLayoutStability: true },
    );
    assert.equal(second.ok, true);
    assert.equal(renderer.getRuntimeBreadcrumbSnapshot()?.frame.layout, false);
    const secondGraph = (renderer as unknown as { _constraintGraph?: unknown })._constraintGraph;
    assert.equal(secondGraph, firstGraph);
  });

  test("fails deterministically on legacy percentage constraints", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.column({ id: "legacy", width: "50%" as unknown as never }, [ui.text("x")]);
    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, false);
    if (submit.ok) return;
    assert.equal(submit.code, "ZRUI_INVALID_PROPS");
    assert.match(submit.detail, /percentage strings are removed/i);
  });

  test("propagates circular-constraint fatals through submitFrame", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.row({ width: "full", gap: 0 }, [
      ui.column({ id: "a", width: expr("#b.w") }, [ui.text("a")]),
      ui.column({ id: "b", width: expr("#a.w") }, [ui.text("b")]),
    ]);

    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, false);
    if (submit.ok) return;
    assert.equal(submit.code, "ZRUI_CIRCULAR_CONSTRAINT");
    assert.match(submit.detail, /Circular constraint dependency/);
  });

  test("propagates invalid-reference fatals through submitFrame", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.column({ id: "target", width: expr("#missing.w") }, [ui.text("x")]);
    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, false);
    if (submit.ok) return;
    assert.equal(submit.code, "ZRUI_INVALID_CONSTRAINT");
    assert.match(submit.detail, /Unknown widget reference/);
  });

  test("fails deterministically on unknown function calls in constraint AST", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.column(
      {
        id: "target",
        width: malformedUnknownCallExpr(),
      },
      [ui.text("x")],
    );
    const submit = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );

    assert.equal(submit.ok, false);
    if (submit.ok) return;
    assert.equal(submit.code, "ZRUI_INVALID_CONSTRAINT");
    assert.match(submit.detail, /Unknown function "clmp"/);
    assert.match(submit.detail, /#target\.width/);
    assert.match(submit.detail, /clmp\(10, parent\.w, 20\)/);
  });
});
