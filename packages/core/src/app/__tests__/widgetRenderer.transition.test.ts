import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { Rect } from "../../layout/types.js";
import { ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { TransitionProperty } from "../../widgets/types.js";
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

type PrivateTransitionTrack = Readonly<{
  from: Rect;
  to: Rect;
  fromOpacity: number;
  toOpacity: number;
  startMs: number;
  durationMs: number;
  easing: (t: number) => number;
  animatePosition: boolean;
  animateSize: boolean;
  animateOpacity: boolean;
}>;

function transitionTrackMap(renderer: WidgetRenderer<void>): Map<number, PrivateTransitionTrack> {
  return (
    renderer as unknown as {
      positionTransitionTrackByInstanceId: Map<number, PrivateTransitionTrack>;
    }
  ).positionTransitionTrackByInstanceId;
}

function animatedRectMap(renderer: WidgetRenderer<void>): Map<number, Rect> {
  return (renderer as unknown as { animatedRectByInstanceId: Map<number, Rect> })
    .animatedRectByInstanceId;
}

function animatedOpacityMap(renderer: WidgetRenderer<void>): Map<number, number> {
  return (renderer as unknown as { animatedOpacityByInstanceId: Map<number, number> })
    .animatedOpacityByInstanceId;
}

function firstMapValue<T>(map: ReadonlyMap<number, T>): T | undefined {
  for (const value of map.values()) return value;
  return undefined;
}

function viewCompositeTransition(
  opts: Readonly<{
    offset: number;
    width: number;
    opacity: number;
    duration?: number;
    properties?: "all" | readonly TransitionProperty[];
    includeBox?: boolean;
  }>,
) {
  if (opts.includeBox === false) {
    return ui.row({ id: "root", gap: 0 }, [ui.text("gone", { id: "gone" })]);
  }

  const transition = {
    duration: opts.duration ?? 120,
    easing: "linear" as const,
    ...(opts.properties === undefined ? {} : { properties: opts.properties }),
  };

  return ui.row(
    { id: "root", gap: 0 },
    [
      ui.spacer({ size: opts.offset }),
      ui.box(
        {
          id: "combo",
          width: opts.width,
          height: 2,
          border: "single",
          opacity: opts.opacity,
          transition,
        },
        [ui.text("combo", { id: "combo-label" })],
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

  test("omitted transition properties default to animating position/size/opacity", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const frame1 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1 }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 5, width: 12, opacity: 0.2 }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);

    const track = firstMapValue(transitionTrackMap(renderer));
    assert.ok(track !== undefined);
    assert.equal(track?.animatePosition, true);
    assert.equal(track?.animateSize, true);
    assert.equal(track?.animateOpacity, true);
  });

  test("empty transition properties disable animation tracks", () => {
    const backend = createNoopBackend();
    let requestRenderCalls = 0;
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        requestRenderCalls++;
      },
    });

    const frame1 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, properties: [] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 5, width: 12, opacity: 0.2, properties: [] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(transitionTrackMap(renderer).size, 0);
    assert.equal(renderer.hasAnimatedWidgets(), false);
    assert.equal(requestRenderCalls, 0);
  });

  test("property filters animate only the selected dimensions", () => {
    const cases: ReadonlyArray<
      Readonly<{
        name: string;
        properties: readonly TransitionProperty[];
        expectPosition: boolean;
        expectSize: boolean;
        expectOpacity: boolean;
      }>
    > = [
      {
        name: "position-only",
        properties: ["position"],
        expectPosition: true,
        expectSize: false,
        expectOpacity: false,
      },
      {
        name: "size-only",
        properties: ["size"],
        expectPosition: false,
        expectSize: true,
        expectOpacity: false,
      },
      {
        name: "opacity-only",
        properties: ["opacity"],
        expectPosition: false,
        expectSize: false,
        expectOpacity: true,
      },
    ];

    for (const c of cases) {
      const backend = createNoopBackend();
      const renderer = new WidgetRenderer<void>({
        backend,
        requestRender: () => {},
      });

      const frame1 = renderer.submitFrame(
        () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, properties: c.properties }),
        undefined,
        { cols: 40, rows: 10 },
        defaultTheme,
        noRenderHooks(),
        { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
      );
      assert.ok(frame1.ok, `${c.name}: bootstrap frame failed`);

      const frame2 = renderer.submitFrame(
        () => viewCompositeTransition({ offset: 5, width: 12, opacity: 0.2, properties: c.properties }),
        undefined,
        { cols: 40, rows: 10 },
        defaultTheme,
        noRenderHooks(),
        { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
      );
      assert.ok(frame2.ok, `${c.name}: transition frame failed`);

      const track = firstMapValue(transitionTrackMap(renderer));
      assert.ok(track !== undefined, `${c.name}: expected active transition track`);
      assert.equal(track?.animatePosition, c.expectPosition, `${c.name}: position flag mismatch`);
      assert.equal(track?.animateSize, c.expectSize, `${c.name}: size flag mismatch`);
      assert.equal(track?.animateOpacity, c.expectOpacity, `${c.name}: opacity flag mismatch`);

      const midFrame = renderer.submitFrame(
        () => viewCompositeTransition({ offset: 5, width: 12, opacity: 0.2, properties: c.properties }),
        undefined,
        { cols: 40, rows: 10 },
        defaultTheme,
        noRenderHooks(),
        { commit: false, layout: false, checkLayoutStability: false, nowMs: 70 },
      );
      assert.ok(midFrame.ok, `${c.name}: mid-frame failed`);

      const animatedRect = firstMapValue(animatedRectMap(renderer));
      const animatedOpacity = firstMapValue(animatedOpacityMap(renderer));
      const finalRect = renderer.getRectByIdIndex().get("combo");
      assert.ok(finalRect !== undefined, `${c.name}: missing final combo rect`);

      if (c.expectSize) {
        assert.ok(animatedRect !== undefined, `${c.name}: expected animated rect for size`);
        assert.ok(animatedRect ? animatedRect.w > 6 && animatedRect.w < 12 : false);
      } else if (animatedRect !== undefined) {
        assert.equal(animatedRect.w, 12, `${c.name}: width should already be final`);
      }

      if (!c.expectPosition && animatedRect !== undefined && finalRect) {
        assert.equal(animatedRect.x, finalRect.x, `${c.name}: x should not animate`);
      }

      if (c.expectOpacity) {
        assert.ok(animatedOpacity !== undefined, `${c.name}: expected animated opacity`);
        assert.ok(animatedOpacity ? animatedOpacity > 0.2 && animatedOpacity < 1 : false);
      } else {
        assert.equal(animatedOpacity, undefined, `${c.name}: opacity should not animate`);
      }
    }
  });

  test("retargeting mid-flight uses current animated position as new origin", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const frame1 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 10, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);

    const mid = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 10, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 70 },
    );
    assert.ok(mid.ok);
    const midRect = firstMapValue(animatedRectMap(renderer));
    assert.ok(midRect !== undefined);

    const retarget = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 20, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 80 },
    );
    assert.ok(retarget.ok);

    const track = firstMapValue(transitionTrackMap(renderer));
    assert.ok(track !== undefined);
    assert.ok(track ? track.from.x > 0 : false);
    assert.ok(track ? track.from.x < 20 : false);
    assert.ok(track && midRect ? Math.abs(track.from.x - midRect.x) <= 1 : false);
  });

  test("unmounting a transitioning box clears transition and override maps", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const frame1 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 8, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.ok(transitionTrackMap(renderer).size > 0);

    const frame3 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, includeBox: false }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 20 },
    );
    assert.ok(frame3.ok);
    assert.equal(transitionTrackMap(renderer).size, 0);
    assert.equal(animatedRectMap(renderer).size, 0);
    assert.equal(animatedOpacityMap(renderer).size, 0);
    assert.equal(renderer.hasAnimatedWidgets(), false);
  });

  test("zero-duration transitions do not create active tracks", () => {
    const backend = createNoopBackend();
    let requestRenderCalls = 0;
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        requestRenderCalls++;
      },
    });

    const frame1 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, duration: 0, properties: "all" }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 8, width: 12, opacity: 0.3, duration: 0, properties: "all" }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);
    assert.equal(transitionTrackMap(renderer).size, 0);
    assert.equal(renderer.hasAnimatedWidgets(), false);
    assert.equal(requestRenderCalls, 0);
  });

  test("active transitions force full render (incremental disabled)", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
      collectRuntimeBreadcrumbs: true,
    });

    const frame1 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 0, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 0 },
    );
    assert.ok(frame1.ok);

    const frame2 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 10, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: true, layout: true, checkLayoutStability: true, nowMs: 10 },
    );
    assert.ok(frame2.ok);

    const frame3 = renderer.submitFrame(
      () => viewCompositeTransition({ offset: 10, width: 6, opacity: 1, properties: ["position"] }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
      { commit: false, layout: false, checkLayoutStability: false, nowMs: 20 },
    );
    assert.ok(frame3.ok);

    const breadcrumbs = renderer.getRuntimeBreadcrumbSnapshot();
    assert.ok(breadcrumbs !== null);
    assert.equal(breadcrumbs?.frame.incremental, false);
    assert.equal(breadcrumbs?.damage.mode, "full");
  });
});
