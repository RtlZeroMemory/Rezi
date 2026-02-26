import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import { defineWidget } from "../../widgets/composition.js";
import { ui } from "../../widgets/ui.js";
import { extendTheme } from "../extend.js";
import { darkTheme } from "../presets.js";
import type { Theme } from "../theme.js";
import { createTheme } from "../theme.js";

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

async function bootstrap(backend: StubBackend, appTheme: Theme) {
  const app = createApp({
    backend,
    initialState: 0,
    theme: appTheme,
  });
  app.view(() => ui.divider({ label: "THEME", color: "primary" }));
  await app.start();
  pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 50, rows: 12 }]);
  await flushMicrotasks(12);
  assert.equal(backend.requestedFrames.length, 1, "bootstrap frame submitted");
  return app;
}

async function resolveNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(8);
}

async function drainPendingFrames(backend: StubBackend, maxRounds = 24): Promise<void> {
  for (let i = 0; i < maxRounds; i++) {
    try {
      backend.resolveNextFrame();
    } catch {
      break;
    }
    await flushMicrotasks(8);
  }
}

function themeWithPrimary(r: number, g: number, b: number): Theme {
  return createTheme({
    colors: {
      primary: (r << 16) | (g << 8) | b,
    },
  });
}

function semanticThemeWithAccent(r: number, g: number, b: number) {
  return extendTheme(darkTheme, {
    colors: {
      accent: {
        primary: (r << 16) | (g << 8) | b,
      },
    },
  });
}

describe("theme transition frames", () => {
  test("themeTransitionFrames defaults to immediate render-only switch", async () => {
    const backend = new StubBackend();
    const app = await bootstrap(backend, themeWithPrimary(210, 20, 20));
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(20, 210, 20));
    await flushMicrotasks(12);
    assert.equal(backend.requestedFrames.length, 2, "single theme switch frame submitted");

    await resolveNextFrame(backend);
    await flushMicrotasks(12);
    assert.equal(backend.requestedFrames.length, 2, "no extra transition frames when disabled");
  });

  test("themeTransitionFrames submits configured number of interpolated frames", async () => {
    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: 0,
      theme: themeWithPrimary(255, 0, 0),
      config: { themeTransitionFrames: 3 },
    });
    app.view(() => ui.divider({ label: "THEME", color: "primary" }));

    await app.start();
    pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 50, rows: 12 }]);
    await flushMicrotasks(12);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(0, 255, 0));
    await flushMicrotasks(12);
    assert.equal(backend.requestedFrames.length, 2, "frame 1/3 submitted");

    await resolveNextFrame(backend);
    assert.equal(backend.requestedFrames.length, 3, "frame 2/3 submitted");

    await resolveNextFrame(backend);
    assert.equal(backend.requestedFrames.length, 4, "frame 3/3 submitted");

    await resolveNextFrame(backend);
    await flushMicrotasks(12);
    assert.equal(backend.requestedFrames.length, 4, "transition completes after configured frames");
  });

  test("setTheme invalidates commit so useTheme-based composites update immediately", async () => {
    const backend = new StubBackend();
    const seenPrimary: Array<unknown> = [];
    const ThemedProbe = defineWidget<{ key?: string }, number>((_props, ctx) => {
      seenPrimary.push(ctx.useTheme()?.accent.primary ?? null);
      return ui.text("probe");
    });
    const app = createApp({
      backend,
      initialState: 0,
      theme: semanticThemeWithAccent(255, 0, 0),
    });
    app.view(() => ui.box({}, [ThemedProbe({})]));

    await app.start();
    pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 50, rows: 12 }]);
    await flushMicrotasks(12);
    await resolveNextFrame(backend);
    assert.equal(seenPrimary.length >= 1, true);

    app.setTheme(semanticThemeWithAccent(0, 255, 0));
    await flushMicrotasks(12);
    await resolveNextFrame(backend);

    assert.equal(seenPrimary.length >= 2, true);
    assert.deepEqual(seenPrimary[seenPrimary.length - 1], (0 << 16) | (255 << 8) | 0);
  });

  test("retargeting during active transition converges to new target theme", async () => {
    const baselineBackend = new StubBackend();
    const baselineApp = await bootstrap(baselineBackend, themeWithPrimary(0, 120, 255));
    const baselineFrame = baselineBackend.requestedFrames[0]?.slice();
    assert.ok(baselineFrame, "baseline frame captured");
    await resolveNextFrame(baselineBackend);

    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: 0,
      theme: themeWithPrimary(255, 0, 0),
      config: { themeTransitionFrames: 4 },
    });
    app.view(() => ui.divider({ label: "THEME", color: "primary" }));

    await app.start();
    pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 50, rows: 12 }]);
    await flushMicrotasks(12);
    await resolveNextFrame(backend);

    app.setTheme(themeWithPrimary(0, 255, 0));
    await flushMicrotasks(12);
    assert.equal(backend.requestedFrames.length, 2, "first transition frame submitted");

    app.setTheme(themeWithPrimary(0, 120, 255));
    await flushMicrotasks(12);
    assert.equal(backend.requestedFrames.length, 2, "retarget coalesces while frame is in flight");

    await drainPendingFrames(backend);
    const finalFrame = backend.requestedFrames[backend.requestedFrames.length - 1];
    assert.ok(finalFrame, "retarget final frame captured");
    assert.ok(
      baselineFrame && finalFrame && bytesEqual(finalFrame, baselineFrame),
      "retarget settles on the latest requested theme",
    );

    void baselineApp;
  });
});
