import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import { ui } from "../../index.js";
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
        // Not used in renderer unit tests.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function view(offset: number, animated: boolean) {
  return ui.row(
    { id: "root", gap: 0 },
    [
      ui.spacer({ size: offset }),
      ui.box(
        animated
          ? {
              id: "moving",
              width: 4,
              height: 1,
              border: "none",
              transition: { duration: 120, easing: "linear", properties: ["position"] },
            }
          : { id: "moving", width: 4, height: 1, border: "none" },
        [ui.text("X", { id: "label" })],
      ),
    ],
  );
}

function viewSize(width: number) {
  return ui.row(
    { id: "root", gap: 0 },
    [
      ui.box(
        {
          id: "sized",
          width,
          height: 3,
          border: "single",
          transition: { duration: 120, easing: "linear", properties: ["size"] },
        },
        [ui.text("box", { id: "sized-label" })],
      ),
    ],
  );
}

function viewOpacity(opacity: number) {
  return ui.row(
    { id: "root", gap: 0 },
    [
      ui.box(
        {
          id: "fading",
          width: 8,
          height: 2,
          border: "single",
          opacity,
          transition: { duration: 120, easing: "linear", properties: ["opacity"] },
        },
        [ui.text("fade", { id: "fade-label" })],
      ),
    ],
  );
}

describe("WidgetRenderer transitions", () => {
  test("position transition requests follow-up render frames", () => {
    const backend = createNoopBackend();
    let requestRenderCalls = 0;
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        requestRenderCalls++;
      },
    });

    const frame1 = renderer.submitFrame(
      () => view(0, true),
      undefined,
      { cols: 30, rows: 6 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => view(5, true),
      undefined,
      { cols: 30, rows: 6 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(renderer.hasAnimatedWidgets(), true);
    assert.ok(requestRenderCalls > 0);

    const settleFrame = renderer.submitFrame(
      () => view(5, true),
      undefined,
      { cols: 30, rows: 6 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 500 },
    );
    assert.ok(settleFrame.ok);
    assert.equal(renderer.hasAnimatedWidgets(), false);
  });

  test("box moves without transition do not create animation tracks", () => {
    const backend = createNoopBackend();
    let requestRenderCalls = 0;
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        requestRenderCalls++;
      },
    });

    const frame1 = renderer.submitFrame(
      () => view(0, false),
      undefined,
      { cols: 30, rows: 6 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => view(5, false),
      undefined,
      { cols: 30, rows: 6 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(renderer.hasAnimatedWidgets(), false);
    assert.equal(requestRenderCalls, 0);
  });

  test("size transition requests follow-up render frames", () => {
    const backend = createNoopBackend();
    let requestRenderCalls = 0;
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        requestRenderCalls++;
      },
    });

    const frame1 = renderer.submitFrame(
      () => viewSize(6),
      undefined,
      { cols: 30, rows: 8 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewSize(12),
      undefined,
      { cols: 30, rows: 8 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(renderer.hasAnimatedWidgets(), true);
    assert.ok(requestRenderCalls > 0);

    const settleFrame = renderer.submitFrame(
      () => viewSize(12),
      undefined,
      { cols: 30, rows: 8 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 500 },
    );
    assert.ok(settleFrame.ok);
    assert.equal(renderer.hasAnimatedWidgets(), false);
  });

  test("opacity transition requests follow-up render frames", () => {
    const backend = createNoopBackend();
    let requestRenderCalls = 0;
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        requestRenderCalls++;
      },
    });

    const frame1 = renderer.submitFrame(
      () => viewOpacity(1),
      undefined,
      { cols: 30, rows: 8 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewOpacity(0.2),
      undefined,
      { cols: 30, rows: 8 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: false, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(renderer.hasAnimatedWidgets(), true);
    assert.ok(requestRenderCalls > 0);

    const settleFrame = renderer.submitFrame(
      () => viewOpacity(0.2),
      undefined,
      { cols: 30, rows: 8 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 500 },
    );
    assert.ok(settleFrame.ok);
    assert.equal(renderer.hasAnimatedWidgets(), false);
  });
});
