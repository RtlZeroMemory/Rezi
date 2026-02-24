import { assert, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import { ZR_KEY_ENTER, ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { createApp } from "../createApp.js";
import type { RuntimeBreadcrumbSnapshot } from "../runtimeBreadcrumbs.js";
import { isRuntimeBreadcrumbEventKind } from "../runtimeBreadcrumbs.js";
import { WidgetRenderer } from "../widgetRenderer.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function keyEvent(key: number): ZrevEvent {
  return { kind: "key", timeMs: 1, key, mods: 0, action: "down" };
}

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Unit tests in this file call WidgetRenderer.submitFrame directly.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

async function pushEvents(
  backend: StubBackend,
  events: NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
}

test("runtime breadcrumbs capture event path/action/focus/cursor deterministically", async () => {
  const backend = new StubBackend();
  const renderSnapshots: RuntimeBreadcrumbSnapshot[] = [];
  const layoutSnapshots: RuntimeBreadcrumbSnapshot[] = [];
  const actionEvents: Array<Readonly<{ id: string; action: string }>> = [];
  let keybindingHits = 0;
  let presses = 0;

  const app = createApp({
    backend,
    initialState: 0,
    config: {
      internal_onRender: (metrics) => {
        const breadcrumbs = (
          metrics as Readonly<{ runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot }>
        ).runtimeBreadcrumbs;
        if (breadcrumbs) renderSnapshots.push(breadcrumbs);
      },
      internal_onLayout: (snapshot) => {
        const breadcrumbs = (
          snapshot as Readonly<{ runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot }>
        ).runtimeBreadcrumbs;
        if (breadcrumbs) layoutSnapshots.push(breadcrumbs);
      },
    },
  });

  app.keys({
    x: () => {
      keybindingHits++;
    },
  });

  app.onEvent((ev) => {
    if (ev.kind === "action") actionEvents.push({ id: ev.id, action: ev.action });
  });

  app.view(() =>
    ui.focusTrap(
      {
        id: "trap",
        active: true,
        initialFocus: "name",
      },
      [
        ui.input({ id: "name", value: "abc" }),
        ui.button({
          id: "save",
          label: "Save",
          onPress: () => {
            presses++;
          },
        }),
        // Keep an animated widget in-tree so tick events produce render snapshots.
        ui.spinner({ variant: "dots", label: "" }),
      ],
    ),
  );

  await app.start();

  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
  assert.equal(renderSnapshots.length, 1);
  assert.equal(layoutSnapshots.length, 1);

  const first = renderSnapshots[0];
  assert.ok(first);
  assert.equal(first.event.kind, "resize");
  assert.equal(first.event.path, null);
  assert.equal(first.focus.focusedId, "name");
  assert.equal(first.focus.activeZoneId, null);
  assert.equal(first.focus.activeTrapId, "trap");
  assert.equal(typeof first.focus.announcement === "string", true);
  assert.equal(first.cursor?.visible, true);
  assert.equal(first.damage.mode, "full");
  assert.equal(first.frame.commit, true);
  assert.equal(first.frame.layout, true);
  assert.equal(first.frame.incremental, false);
  assert.equal(first.frame.renderTimeMs >= 0, true);
  assert.deepEqual(layoutSnapshots[0], first);

  await settleNextFrame(backend);

  await pushEvents(backend, [
    { kind: "text", timeMs: 2, codepoint: 120 },
    { kind: "tick", timeMs: 3, dtMs: 16 },
  ]);
  assert.equal(keybindingHits, 1);
  assert.equal(renderSnapshots.length, 2);
  const second = renderSnapshots[1];
  assert.ok(second);
  assert.equal(second.event.kind, "tick");
  assert.equal(second.event.path, null);
  assert.equal(second.focus.focusedId, "name");
  assert.equal(second.focus.activeZoneId, null);
  assert.equal(second.focus.activeTrapId, "trap");
  assert.equal(typeof second.focus.announcement === "string", true);
  assert.equal(second.frame.commit, false);
  assert.equal(second.frame.layout, false);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 4, key: ZR_KEY_TAB, action: "down" }]);
  assert.equal(renderSnapshots.length, 3);
  const third = renderSnapshots[2];
  assert.ok(third);
  assert.equal(third.event.kind, "key");
  assert.equal(third.event.path, "widgetRouting");
  assert.equal(third.focus.focusedId, "save");
  assert.equal(third.focus.activeZoneId, null);
  assert.equal(third.focus.activeTrapId, "trap");
  assert.equal(typeof third.focus.announcement === "string", true);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 5, key: ZR_KEY_ENTER, action: "down" }]);
  assert.equal(renderSnapshots.length, 3);
  assert.deepEqual(actionEvents, [{ id: "save", action: "press" }]);
  assert.equal(presses, 1);

  await pushEvents(backend, [{ kind: "tick", timeMs: 200, dtMs: 16 }]);
  assert.equal(renderSnapshots.length, 4);
  const fourth = renderSnapshots[3];
  assert.ok(fourth);
  assert.deepEqual(fourth.lastAction, { id: "save", action: "press" });
  assert.equal(fourth.event.kind, "tick");
  assert.equal(fourth.event.path, null);

  await settleNextFrame(backend);
});

test("runtime breadcrumbs refresh focus announcements when field metadata changes", async () => {
  const backend = new StubBackend();
  const renderSnapshots: RuntimeBreadcrumbSnapshot[] = [];

  const app = createApp({
    backend,
    initialState: { value: "", error: null as string | null },
    config: {
      internal_onRender: (metrics) => {
        const breadcrumbs = (
          metrics as Readonly<{ runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot }>
        ).runtimeBreadcrumbs;
        if (breadcrumbs) renderSnapshots.push(breadcrumbs);
      },
    },
  });

  app.view((state) =>
    ui.focusTrap(
      {
        id: "trap",
        active: true,
        initialFocus: "email",
      },
      [
        ui.field({
          label: "Email",
          required: true,
          ...(state.error === null ? {} : { error: state.error }),
          children: ui.input({
            id: "email",
            value: state.value,
            accessibleLabel: "Email input",
          }),
        }),
      ],
    ),
  );

  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
  assert.equal(renderSnapshots.length, 1);
  const first = renderSnapshots[0];
  assert.ok(first);
  assert.equal(first.focus.focusedId, "email");
  assert.equal(first.focus.announcement?.includes("Required"), true);
  assert.equal(first.focus.announcement?.includes("Invalid format"), false);

  await settleNextFrame(backend);

  app.update((prev) => ({ ...prev, error: "Invalid format" }));
  await flushMicrotasks(20);
  assert.equal(renderSnapshots.length, 2);
  const second = renderSnapshots[1];
  assert.ok(second);
  assert.equal(second.focus.focusedId, "email");
  assert.equal(second.focus.announcement?.includes("Invalid format"), true);

  await settleNextFrame(backend);
});

test("enabling breadcrumb capture does not change widget routing outcomes", () => {
  const backend = createNoopBackend();
  const rendererWithout = new WidgetRenderer<void>({
    backend,
    requestRender: () => {},
    collectRuntimeBreadcrumbs: false,
  });
  const rendererWith = new WidgetRenderer<void>({
    backend,
    requestRender: () => {},
    collectRuntimeBreadcrumbs: true,
  });

  const vnode = ui.column({}, [
    ui.input({ id: "name", value: "abc" }),
    ui.button({ id: "save", label: "Save" }),
  ]);

  const resA = rendererWithout.submitFrame(
    () => vnode,
    undefined,
    { cols: 40, rows: 10 },
    defaultTheme,
    noRenderHooks(),
  );
  const resB = rendererWith.submitFrame(
    () => vnode,
    undefined,
    { cols: 40, rows: 10 },
    defaultTheme,
    noRenderHooks(),
  );
  assert.equal(resA.ok, true);
  assert.equal(resB.ok, true);

  const eventSeq: readonly ZrevEvent[] = [
    keyEvent(ZR_KEY_TAB),
    keyEvent(ZR_KEY_TAB),
    keyEvent(ZR_KEY_ENTER),
  ];
  for (const ev of eventSeq) {
    const outA = rendererWithout.routeEngineEvent(ev);
    const outB = rendererWith.routeEngineEvent(ev);
    assert.deepEqual(outB, outA);
    assert.equal(rendererWith.getFocusedId(), rendererWithout.getFocusedId());
  }

  assert.equal(rendererWithout.getRuntimeBreadcrumbSnapshot(), null);
  assert.notEqual(rendererWith.getRuntimeBreadcrumbSnapshot(), null);
});

test("runtime breadcrumb event kind guard includes tick and user", () => {
  assert.equal(isRuntimeBreadcrumbEventKind("tick"), true);
  assert.equal(isRuntimeBreadcrumbEventKind("user"), true);
  assert.equal(isRuntimeBreadcrumbEventKind("custom"), false);
});
