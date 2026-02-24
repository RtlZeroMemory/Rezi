import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import { ui } from "../../index.js";
import type { Rect } from "../../layout/types.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { WidgetRenderer } from "../widgetRenderer.js";

type PrivateExitTrack = Readonly<{
  instanceId: number;
  frozenRect: Rect;
  frozenOpacity: number;
  startMs: number;
  durationMs: number;
  easing: (t: number) => number;
  animateOpacity: boolean;
  animatePosition: boolean;
  animateSize: boolean;
}>;

type PrivateExitRenderNode = Readonly<{
  instanceId: number;
  key: string | undefined;
  vnodeKind: string;
  subtreeInstanceIds: readonly number[];
  runDeferredLocalStateCleanup: () => void;
}>;

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

function exitTrackMap(renderer: WidgetRenderer<void>): Map<number, PrivateExitTrack> {
  return (
    renderer as unknown as {
      exitTransitionTrackByInstanceId: Map<number, PrivateExitTrack>;
    }
  ).exitTransitionTrackByInstanceId;
}

function exitRenderNodeMap(renderer: WidgetRenderer<void>): Map<number, PrivateExitRenderNode> {
  return (
    renderer as unknown as {
      exitRenderNodeByInstanceId: Map<number, PrivateExitRenderNode>;
    }
  ).exitRenderNodeByInstanceId;
}

function exitAnimatedOpacityMap(renderer: WidgetRenderer<void>): Map<number, number> {
  return (
    renderer as unknown as {
      exitAnimatedOpacityByInstanceId: Map<number, number>;
    }
  ).exitAnimatedOpacityByInstanceId;
}

function inputWorkingValueMap(renderer: WidgetRenderer<void>): Map<number, string> {
  return (
    renderer as unknown as {
      inputWorkingValueByInstanceId: Map<number, string>;
    }
  ).inputWorkingValueByInstanceId;
}

function firstMapValue<T>(map: ReadonlyMap<number, T>): T | undefined {
  for (const value of map.values()) return value;
  return undefined;
}

function viewExitBox(include: boolean, key = "shared"): ReturnType<typeof ui.row> {
  return ui.row({ id: "root", gap: 1 }, [
    ui.button({ id: "stay", label: "stay" }),
    ...(include
      ? [
          ui.box(
            {
              id: "exiting-box",
              key,
              width: 12,
              height: 3,
              border: "single",
              opacity: 1,
              exitTransition: { duration: 200, easing: "linear", properties: ["opacity"] },
            },
            [ui.text("bye", { id: "exit-label" })],
          ),
        ]
      : []),
  ]);
}

function viewExitInput(include: boolean, key = "input-box"): ReturnType<typeof ui.row> {
  return ui.row({ id: "root", gap: 1 }, [
    ...(include
      ? [
          ui.box(
            {
              id: "input-exit-box",
              key,
              width: 18,
              height: 3,
              border: "single",
              exitTransition: { duration: 200, easing: "linear", properties: ["opacity"] },
            },
            [ui.input({ id: "field", value: "abc" })],
          ),
        ]
      : []),
  ]);
}

function viewExitWithSameKeyInDifferentParents(includeLeft: boolean): ReturnType<typeof ui.row> {
  return ui.row({ id: "scope-root", gap: 1 }, [
    ui.column(
      { key: "left-parent" },
      includeLeft
        ? [
            ui.box(
              {
                id: "left-exiting-box",
                key: "shared-key",
                width: 12,
                height: 3,
                border: "single",
                exitTransition: { duration: 200, easing: "linear", properties: ["opacity"] },
              },
              [ui.text("left")],
            ),
          ]
        : [],
    ),
    ui.column({ key: "right-parent" }, [
      ui.box(
        {
          id: "right-stable-box",
          key: "shared-key",
          width: 12,
          height: 3,
          border: "single",
        },
        [ui.text("right")],
      ),
    ]),
  ]);
}

describe("WidgetRenderer exit animations", () => {
  test("removed box with exitTransition fades opacity from 1 to 0", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const frame1 = renderer.submitFrame(
      () => viewExitBox(true),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewExitBox(false),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(exitTrackMap(renderer).size, 1);

    const midFrame = renderer.submitFrame(
      () => viewExitBox(false),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 110 },
    );
    assert.ok(midFrame.ok);

    const opacity = firstMapValue(exitAnimatedOpacityMap(renderer));
    assert.ok(opacity !== undefined);
    assert.ok((opacity ?? 0) < 1);
    assert.ok((opacity ?? 0) > 0);
  });

  test("exiting box remains renderable during intermediate frames", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const frame1 = renderer.submitFrame(
      () => viewExitBox(true),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewExitBox(false),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);

    const midFrame = renderer.submitFrame(
      () => viewExitBox(false),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 120 },
    );
    assert.ok(midFrame.ok);

    assert.ok(exitRenderNodeMap(renderer).size > 0);
    assert.equal(renderer.hasAnimatedWidgets(), true);
  });

  test("exit completion removes node and runs deferred local-state cleanup", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const frame1 = renderer.submitFrame(
      () => viewExitInput(true),
      undefined,
      { cols: 50, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);
    assert.ok(inputWorkingValueMap(renderer).size > 0);

    const frame2 = renderer.submitFrame(
      () => viewExitInput(false),
      undefined,
      { cols: 50, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.ok(inputWorkingValueMap(renderer).size > 0);

    const settleFrame = renderer.submitFrame(
      () => viewExitInput(false),
      undefined,
      { cols: 50, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 260 },
    );
    assert.ok(settleFrame.ok);

    assert.equal(exitRenderNodeMap(renderer).size, 0);
    assert.equal(exitTrackMap(renderer).size, 0);
    assert.equal(inputWorkingValueMap(renderer).size, 0);
    assert.equal(renderer.hasAnimatedWidgets(), false);
  });

  test("exiting nodes do not participate in focus traversal metadata", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const frame1 = renderer.submitFrame(
      () => viewExitBox(true),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);
    assert.ok(renderer.captureFocusSnapshot().focusList.includes("stay"));

    const frame2 = renderer.submitFrame(
      () => viewExitBox(false),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);

    const focusList = renderer.captureFocusSnapshot().focusList;
    assert.equal(focusList.includes("exiting-box"), false);
  });

  test("reappearing keyed node cancels in-flight exit animation", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const frame1 = renderer.submitFrame(
      () => viewExitBox(true, "same-key"),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewExitBox(false, "same-key"),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(exitRenderNodeMap(renderer).size, 1);

    const frame3 = renderer.submitFrame(
      () => viewExitBox(true, "same-key"),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 80 },
    );
    assert.ok(frame3.ok);

    assert.equal(exitRenderNodeMap(renderer).size, 0);
    assert.equal(exitTrackMap(renderer).size, 0);
    assert.equal(renderer.hasAnimatedWidgets(), false);
  });

  test("same key in a different sibling lineage does not cancel exit animation", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const frame1 = renderer.submitFrame(
      () => viewExitWithSameKeyInDifferentParents(true),
      undefined,
      { cols: 60, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewExitWithSameKeyInDifferentParents(false),
      undefined,
      { cols: 60, rows: 12 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(exitRenderNodeMap(renderer).size, 1);
    assert.equal(exitTrackMap(renderer).size, 1);
  });
});
