import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import { widthConstraints } from "../../constraints/helpers.js";
import { expr, ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { WidgetRenderer } from "../widgetRenderer.js";

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Not used by these renderer integration tests.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function view() {
  return ui.row({ id: "root", width: "full", height: 8, gap: 0 }, [
    ui.box(
      {
        id: "outer",
        border: "none",
        width: widthConstraints.percentOfParent(0.5),
        height: 4,
      },
      [
        ui.box(
          {
            id: "inner",
            border: "none",
            width: widthConstraints.percentOfParent(0.5),
            height: 1,
          },
          [],
        ),
      ],
    ),
  ]);
}

function deepNestedView(levels: number) {
  const makeLevel = (depth: number): ReturnType<typeof ui.box> => {
    if (depth >= levels) {
      return ui.box(
        {
          id: `deep-${String(depth)}`,
          border: "none",
          width: widthConstraints.percentOfParent(0.5),
          height: 1,
        },
        [],
      );
    }
    return ui.box(
      {
        id: `deep-${String(depth)}`,
        border: "none",
        width: widthConstraints.percentOfParent(0.5),
        height: 2,
      },
      [makeLevel(depth + 1)],
    );
  };

  return ui.row({ id: "root", width: "full", height: 12, gap: 0 }, [makeLevel(1)]);
}

describe("WidgetRenderer constraint settle", () => {
  test("nested percent-of-parent constraints settle in the first committed frame", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const first = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 40, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(first.ok, true, "first frame should render");
    if (!first.ok) return;

    const rects = renderer.getRectByIdIndex();
    assert.equal(rects.get("outer")?.w, 20, "outer should use 50% of root width on first frame");
    assert.equal(rects.get("inner")?.w, 10, "inner should use 50% of outer width on first frame");
  });

  test("viewport resize updates nested percent constraints in a single layout frame", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const first = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 40, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(first.ok, true, "initial frame should render");
    if (!first.ok) return;

    const resized = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 60, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: true, checkLayoutStability: false },
    );
    assert.equal(resized.ok, true, "resize frame should render");
    if (!resized.ok) return;

    const rects = renderer.getRectByIdIndex();
    assert.equal(rects.get("outer")?.w, 30, "outer should track updated viewport width");
    assert.equal(rects.get("inner")?.w, 15, "inner should track updated parent width");
  });

  test("deep parent-dependent chains settle within a single committed frame", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const first = renderer.submitFrame(
      () => deepNestedView(7),
      undefined,
      { cols: 128, rows: 20 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(first.ok, true, "first frame should render");
    if (!first.ok) return;

    const rects = renderer.getRectByIdIndex();
    assert.equal(rects.get("deep-1")?.w, 64);
    assert.equal(rects.get("deep-2")?.w, 32);
    assert.equal(rects.get("deep-3")?.w, 16);
    assert.equal(rects.get("deep-4")?.w, 8);
    assert.equal(rects.get("deep-5")?.w, 4);
    assert.equal(rects.get("deep-6")?.w, 2);
    assert.equal(rects.get("deep-7")?.w, 1);
  });

  test("constraint key invalidates when unconstrained referenced widget geometry changes", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });
    let refWidth = 10;

    const render = () =>
      ui.row({ id: "root", width: "full", height: 6, gap: 0 }, [
        ui.box({ id: "ref", border: "none", width: refWidth, height: 2 }, []),
        ui.box(
          {
            id: "target",
            border: "none",
            width: expr("max(0, parent.w - #ref.w)"),
            height: 2,
          },
          [],
        ),
      ]);

    const first = renderer.submitFrame(
      render,
      undefined,
      { cols: 80, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(first.ok, true, "initial frame should render");
    if (!first.ok) return;
    assert.equal(renderer.getRectByIdIndex().get("target")?.w, 70);

    refWidth = 20;
    const second = renderer.submitFrame(
      render,
      undefined,
      { cols: 80, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(second.ok, true, "updated frame should render");
    if (!second.ok) return;
    assert.equal(renderer.getRectByIdIndex().get("target")?.w, 60);
  });

  test("constraint display overrides traverse modal/layer slot children", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const frame = renderer.submitFrame(
      () =>
        ui.layers([
          ui.layer({
            id: "overlay-layer",
            content: ui.box(
              {
                id: "layer-hidden",
                border: "none",
                width: expr("20"),
                height: expr("3"),
                display: expr("0"),
              },
              [],
            ),
          }),
          ui.modal({
            id: "overlay-modal",
            title: "Modal",
            content: ui.box(
              {
                id: "modal-hidden",
                border: "none",
                width: expr("20"),
                height: expr("3"),
                display: expr("0"),
              },
              [],
            ),
            actions: Object.freeze([ui.button({ id: "modal-ok", label: "OK" })]),
          }),
        ]),
      undefined,
      { cols: 80, rows: 24 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(frame.ok, true, "overlay frame should render");
    if (!frame.ok) return;

    const rects = renderer.getRectByIdIndex();
    assert.equal(rects.get("layer-hidden")?.w, 0);
    assert.equal(rects.get("layer-hidden")?.h, 0);
    assert.equal(rects.get("modal-hidden")?.w, 0);
    assert.equal(rects.get("modal-hidden")?.h, 0);
  });
});
