import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
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

function deepParentDependentView(levels: number) {
  let current = ui.text("leaf");
  for (let depth = levels - 1; depth >= 0; depth--) {
    current = ui.box(
      {
        id: `deep-${String(depth)}`,
        border: "none",
        width: expr("parent.w - 1"),
        height: 1,
      },
      [current],
    );
  }
  return ui.column({ id: "root", width: "full", height: 24 }, [current]);
}

describe("WidgetRenderer constraint regressions", () => {
  test("static display:false containers remove descendant widgets from focus metadata", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const frame = renderer.submitFrame(
      () =>
        ui.column({ id: "root", width: "full", gap: 0 }, [
          ui.box({ id: "hidden-panel", border: "none", display: false }, [
            ui.button({ id: "hidden-btn", label: "Hidden" }),
          ]),
          ui.button({ id: "shown-btn", label: "Shown" }),
        ]),
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(frame.ok, true);
    if (!frame.ok) return;

    const focus = renderer.captureFocusSnapshot();
    assert.deepEqual(focus.focusList, ["shown-btn"]);
    assert.equal(renderer.getRectByIdIndex().get("hidden-btn")?.w ?? -1, 0);
  });

  test("deep parent-dependent chains settle fully in the first committed frame", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const levels = 20;
    const frame = renderer.submitFrame(
      () => deepParentDependentView(levels),
      undefined,
      { cols: 80, rows: 24 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true },
    );
    assert.equal(frame.ok, true);
    if (!frame.ok) return;

    const rects = renderer.getRectByIdIndex();
    for (let depth = 0; depth < levels; depth++) {
      assert.equal(rects.get(`deep-${String(depth)}`)?.w, 79 - depth);
    }
  });
});
