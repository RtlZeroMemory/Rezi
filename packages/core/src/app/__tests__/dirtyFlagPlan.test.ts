import { assert, test } from "@rezi-ui/testkit";
import { defineWidget, ui } from "../../index.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

/**
 * Dirty flag render plan tests.
 *
 * Validates that the render pipeline skips unnecessary work based on dirty flags:
 *   - DIRTY_RENDER only  -> render-only (no view/commit/layout)
 *   - DIRTY_LAYOUT only  -> layout + render (no view/commit)
 *   - DIRTY_VIEW          -> commit pipeline (view/commit + conditional layout/render)
 *
 * First-frame/bootstrap safety is always preserved: if no committed tree or
 * layout exists, the full pipeline runs regardless of flags.
 */

/** Set up a widget-mode app with a view-call counter and two buttons for focus testing. */
function setup() {
  const backend = new StubBackend();
  let viewCalls = 0;
  const app = createApp({ backend, initialState: { n: 0 } });

  app.view((s) => {
    viewCalls++;
    return ui.column({}, [
      ui.text(`n=${String(s.n)}`),
      ui.button({ id: "a", label: "A" }),
      ui.button({ id: "b", label: "B" }),
    ]);
  });

  return {
    app,
    backend,
    getViewCalls: () => viewCalls,
  };
}

/** Bootstrap: start app, push resize, flush until first frame is submitted. */
async function bootstrap(ctx: ReturnType<typeof setup>) {
  await ctx.app.start();
  ctx.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(ctx.backend.requestedFrames.length, 1, "bootstrap: first frame submitted");
  assert.equal(ctx.getViewCalls(), 1, "bootstrap: view called once");
  // Resolve first frame so backpressure is cleared.
  ctx.backend.resolveNextFrame();
  await flushMicrotasks(5);
}

test("render-only dirty (focus change) does not re-invoke view/commit/layout", async () => {
  const ctx = setup();
  await bootstrap(ctx);

  // TAB (key=3) changes focus -> DIRTY_RENDER only.
  ctx.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "key", timeMs: 10, key: 3, action: "down" }],
      }),
    }),
  );
  await flushMicrotasks(10);

  // A frame was submitted (drawlist rebuilt with updated focus highlight).
  assert.equal(ctx.backend.requestedFrames.length, 2, "render-only frame submitted");
  // But the view function was NOT called — commit/layout were skipped.
  assert.equal(ctx.getViewCalls(), 1, "view NOT re-invoked for render-only dirty");
});

test("state update (DIRTY_VIEW) triggers full commit pipeline", async () => {
  const ctx = setup();
  await bootstrap(ctx);

  // State update -> DIRTY_VIEW -> full pipeline
  ctx.app.update((s) => ({ ...s, n: s.n + 1 }));
  await flushMicrotasks(10);

  assert.equal(ctx.backend.requestedFrames.length, 2, "commit frame submitted");
  assert.equal(ctx.getViewCalls(), 2, "view re-invoked for state change");
});

test("resize (DIRTY_LAYOUT) re-layouts without calling view", async () => {
  const ctx = setup();
  await bootstrap(ctx);

  // Resize -> DIRTY_LAYOUT only (no state change)
  ctx.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 20, cols: 60, rows: 15 }],
      }),
    }),
  );
  await flushMicrotasks(10);

  // Frame submitted with new layout.
  assert.equal(ctx.backend.requestedFrames.length, 2, "layout frame submitted");
  // View NOT called: widget tree structure unchanged, only viewport changed.
  assert.equal(ctx.getViewCalls(), 1, "view NOT re-invoked for layout-only dirty");
});

test("debugLayout toggle marks view dirty and re-runs commit path", async () => {
  const ctx = setup();
  await bootstrap(ctx);

  ctx.app.debugLayout(true);
  await flushMicrotasks(10);

  assert.equal(ctx.backend.requestedFrames.length, 2, "debug toggle submitted a frame");
  assert.equal(ctx.getViewCalls(), 2, "debug toggle re-invoked view immediately");
});

test("resize re-invokes view when composite widgets read viewport", async () => {
  const backend = new StubBackend();
  let viewCalls = 0;
  const app = createApp({ backend, initialState: {} });

  const ViewportAware = defineWidget<{ key?: string }>((_props, ctx) => {
    const vp = ctx.useViewport?.();
    return ui.text(`vp:${String(vp?.width ?? 0)}x${String(vp?.height ?? 0)}`);
  });

  app.view(() => {
    viewCalls++;
    return ui.column({}, [ViewportAware({ key: "vp" })]);
  });

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 1);
  assert.equal(viewCalls, 1);
  backend.resolveNextFrame();
  await flushMicrotasks(5);

  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 2, cols: 80, rows: 20 }],
      }),
    }),
  );
  await flushMicrotasks(10);

  assert.equal(backend.requestedFrames.length, 2, "second resize submitted a commit frame");
  assert.equal(viewCalls, 2, "viewport-aware composite forced view re-run on resize");
});

test("first frame always runs full pipeline regardless of dirty flags", async () => {
  const ctx = setup();
  await ctx.app.start();

  // The kick on start() sets DIRTY_VIEW. But even if somehow only DIRTY_RENDER
  // were set, submitFrame() falls back to full pipeline when committedRoot is null.
  // Here we just verify the normal bootstrap path runs the view function.
  ctx.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
      }),
    }),
  );
  await flushMicrotasks(10);

  assert.equal(ctx.backend.requestedFrames.length, 1, "first frame submitted");
  assert.equal(ctx.getViewCalls(), 1, "first frame always calls view");
});

test("multiple focus changes coalesce into single render-only frame", async () => {
  const ctx = setup();
  await bootstrap(ctx);

  // Two TABs in the same event batch -> single frame submission.
  ctx.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [
          { kind: "key", timeMs: 10, key: 3, action: "down" },
          { kind: "key", timeMs: 11, key: 3, action: "down" },
        ],
      }),
    }),
  );
  await flushMicrotasks(10);

  assert.equal(ctx.backend.requestedFrames.length, 2, "coalesced into one frame");
  assert.equal(ctx.getViewCalls(), 1, "view NOT called for coalesced focus changes");
});

test("render-only followed by state update triggers view on the second frame", async () => {
  const ctx = setup();
  await bootstrap(ctx);

  // Focus change -> render-only frame
  ctx.backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "key", timeMs: 10, key: 3, action: "down" }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(ctx.getViewCalls(), 1, "render-only: view not called");
  assert.equal(ctx.backend.requestedFrames.length, 2);
  ctx.backend.resolveNextFrame();
  await flushMicrotasks(5);

  // State update -> full commit
  ctx.app.update((s) => ({ ...s, n: 42 }));
  await flushMicrotasks(10);
  assert.equal(ctx.getViewCalls(), 2, "state update: view called");
  assert.equal(ctx.backend.requestedFrames.length, 3);
});

test("existing frame coalescing behavior preserved with dirty plan", async () => {
  // Mirrors frameCoalescing.test.ts but in widget mode.
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: { n: 0 } });
  let viewCalls = 0;

  app.view((s) => {
    viewCalls++;
    return ui.text(`n=${String(s.n)}`);
  });

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 1);

  // Two rapid updates while a frame is in-flight -> coalesced into one frame.
  app.update((s) => ({ ...s, n: 1 }));
  app.update((s) => ({ ...s, n: 2 }));
  await flushMicrotasks(5);

  // First frame still in-flight: no new frame yet (backpressure).
  assert.equal(backend.requestedFrames.length, 1);

  // Resolve first frame -> coalesced frame fires.
  backend.resolveNextFrame();
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 2);
  assert.equal(viewCalls, 2); // Initial + coalesced commit
});

test("state update that changes intrinsic width triggers relayout for mouse hit-testing", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: { label: "A" } });
  const actions: string[] = [];

  app.view((s) => ui.row({}, [ui.text(s.label), ui.button({ id: "b", label: "B" })]));
  app.onEvent((ev) => {
    if (ev.kind === "action") actions.push(`${ev.id}:${ev.action}`);
  });

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 1, "bootstrap frame submitted");
  backend.resolveNextFrame();
  await flushMicrotasks(5);

  // Grow text from width 1 -> width 5; button should move to the right.
  app.update((s) => ({ ...s, label: "AAAAA" }));
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 2, "state update frame submitted");
  backend.resolveNextFrame();
  await flushMicrotasks(5);

  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [
          { kind: "mouse", timeMs: 20, x: 6, y: 0, mouseKind: 3, buttons: 1 },
          { kind: "mouse", timeMs: 21, x: 6, y: 0, mouseKind: 4, buttons: 0 },
        ],
      }),
    }),
  );
  await flushMicrotasks(10);

  assert.equal(actions.length, 1, "button press routed after relayout");
  assert.equal(actions[0], "b:press");
});

test("interactive text-driven state update re-layouts before mouse hit-testing", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: { label: "A" } });
  const actions: string[] = [];

  app.view((s) => ui.row({}, [ui.text(s.label), ui.button({ id: "b", label: "B" })]));
  app.onEvent((ev) => {
    if (ev.kind === "engine" && ev.event.kind === "text") {
      app.update((s) => (s.label === "A" ? { ...s, label: "AAAAA" } : s));
    }
    if (ev.kind === "action") actions.push(`${ev.id}:${ev.action}`);
  });

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 1, "bootstrap frame submitted");
  backend.resolveNextFrame();
  await flushMicrotasks(5);

  // Text is interactive input, so this update runs on an interactive commit path.
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "text", timeMs: 10, codepoint: 65 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 2, "interactive commit frame submitted");
  backend.resolveNextFrame();
  await flushMicrotasks(5);

  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [
          { kind: "mouse", timeMs: 20, x: 6, y: 0, mouseKind: 3, buttons: 1 },
          { kind: "mouse", timeMs: 21, x: 6, y: 0, mouseKind: 4, buttons: 0 },
        ],
      }),
    }),
  );
  await flushMicrotasks(10);

  assert.equal(actions.length, 1, "button press routed after interactive relayout");
  assert.equal(actions[0], "b:press");
});
