import { createApp } from "../app/createApp.js";
import type { RuntimeBreadcrumbSnapshot } from "../app/runtimeBreadcrumbs.js";
import type { AppRenderMetrics } from "../app/types.js";
import type { BackendEventBatch, RuntimeBackend } from "../backend.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DELETE,
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_F1,
  ZR_KEY_F2,
  ZR_KEY_F3,
  ZR_KEY_F4,
  ZR_KEY_F5,
  ZR_KEY_F6,
  ZR_KEY_F7,
  ZR_KEY_F8,
  ZR_KEY_F9,
  ZR_KEY_F10,
  ZR_KEY_F11,
  ZR_KEY_F12,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  ZR_MOD_ALT,
  ZR_MOD_CTRL,
  ZR_MOD_META,
  ZR_MOD_SHIFT,
  charToKeyCode,
} from "../keybindings/keyCodes.js";
import type { RoutedAction } from "../runtime/router/types.js";
import { DEFAULT_TERMINAL_CAPS, type TerminalCaps } from "../terminalCaps.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import { evaluateScenarioResult } from "./assertions.js";
import { type TestZrevEvent, encodeZrevBatchV1 } from "./events.js";
import { createTestRenderer } from "./renderer.js";
import {
  type ScenarioCapabilityProfile,
  type ScenarioCursorSnapshot,
  type ScenarioDefinition,
  type ScenarioFixtureFactory,
  type ScenarioRunResult,
  type ScenarioScriptedInputEvent,
  type ScenarioStepObservation,
  createScenarioScreenSnapshot,
} from "./scenario.js";

// The harness batches a bounded number of microtask turns after each injected
// event so async widget state settles deterministically without open-ended spins.
function flushMicrotasks(count = 20): Promise<void> {
  let promise = Promise.resolve();
  for (let i = 0; i < count; i++) {
    promise = promise.then(() => Promise.resolve());
  }
  return promise;
}

function colorModeToCapsColor(
  mode: ScenarioCapabilityProfile["colorMode"],
): TerminalCaps["colorMode"] {
  if (mode === "16") return 1;
  if (mode === "256") return 2;
  if (mode === "truecolor") return 3;
  return 0;
}

function toTerminalCaps(profile: ScenarioCapabilityProfile): TerminalCaps {
  return Object.freeze({
    ...DEFAULT_TERMINAL_CAPS,
    colorMode: colorModeToCapsColor(profile.colorMode),
    supportsMouse: profile.supportsMouse,
    supportsBracketedPaste: profile.supportsBracketedPaste,
    supportsFocusEvents: profile.supportsFocusEvents,
    supportsOsc52: profile.supportsOsc52,
    supportsCursorShape: true,
  });
}

class SemanticHarnessBackend implements RuntimeBackend {
  readonly #caps: TerminalCaps;
  readonly #waiters: Array<(batch: BackendEventBatch) => void> = [];
  readonly #buffered: BackendEventBatch[] = [];

  constructor(caps: TerminalCaps) {
    this.#caps = caps;
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {}

  requestFrame(_drawlist: Uint8Array): Promise<void> {
    return Promise.resolve();
  }

  pollEvents(): Promise<BackendEventBatch> {
    const next = this.#buffered.shift();
    if (next) return Promise.resolve(next);
    return new Promise<BackendEventBatch>((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  postUserEvent(_tag: number, _payload: Uint8Array): void {}

  getCaps(): Promise<TerminalCaps> {
    return Promise.resolve(this.#caps);
  }

  pushBytes(bytes: Uint8Array): void {
    const batch: BackendEventBatch = {
      bytes,
      droppedBatches: 0,
      release: () => {},
    };
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(batch);
      return;
    }
    this.#buffered.push(batch);
  }
}

function keyNameToCode(key: string | number): number {
  if (typeof key === "number") return key;
  const normalized = key.trim().toLowerCase();
  if (normalized.length === 1) return charToKeyCode(normalized) ?? 0;
  const functionKey = /^f(\d{1,2})$/u.exec(normalized);
  if (functionKey) {
    const functionKeyCodes = [
      ZR_KEY_F1,
      ZR_KEY_F2,
      ZR_KEY_F3,
      ZR_KEY_F4,
      ZR_KEY_F5,
      ZR_KEY_F6,
      ZR_KEY_F7,
      ZR_KEY_F8,
      ZR_KEY_F9,
      ZR_KEY_F10,
      ZR_KEY_F11,
      ZR_KEY_F12,
    ] as const;
    const index = Number(functionKey[1]) - 1;
    const code = functionKeyCodes[index];
    if (code !== undefined) return code;
  }
  switch (normalized) {
    case "enter":
    case "return":
      return ZR_KEY_ENTER;
    case "escape":
    case "esc":
      return ZR_KEY_ESCAPE;
    case "tab":
      return ZR_KEY_TAB;
    case "space":
      return ZR_KEY_SPACE;
    case "backspace":
      return ZR_KEY_BACKSPACE;
    case "delete":
    case "del":
      return ZR_KEY_DELETE;
    case "home":
      return ZR_KEY_HOME;
    case "end":
      return ZR_KEY_END;
    case "pageup":
      return ZR_KEY_PAGE_UP;
    case "pagedown":
      return ZR_KEY_PAGE_DOWN;
    case "left":
      return ZR_KEY_LEFT;
    case "right":
      return ZR_KEY_RIGHT;
    case "up":
      return ZR_KEY_UP;
    case "down":
      return ZR_KEY_DOWN;
    default:
      throw new Error(`Unsupported semantic scenario key ${JSON.stringify(key)}`);
  }
}

function keyModsToMask(mods: readonly string[] | undefined): number {
  let mask = 0;
  for (const mod of mods ?? []) {
    if (mod === "shift") mask |= ZR_MOD_SHIFT;
    else if (mod === "ctrl") mask |= ZR_MOD_CTRL;
    else if (mod === "alt") mask |= ZR_MOD_ALT;
    else if (mod === "meta") mask |= ZR_MOD_META;
  }
  return mask;
}

function eventToZrevEvents(event: ScenarioScriptedInputEvent): readonly TestZrevEvent[] {
  switch (event.kind) {
    case "text":
      return Object.freeze(
        Array.from(event.text).map((glyph) => ({
          kind: "text" as const,
          timeMs: 1,
          codepoint: glyph.codePointAt(0) ?? 0,
        })),
      );
    case "paste":
      return Object.freeze([
        {
          kind: "paste" as const,
          timeMs: 1,
          bytes: new TextEncoder().encode(event.text),
        },
      ]);
    case "resize":
      return Object.freeze([
        {
          kind: "resize" as const,
          timeMs: 1,
          cols: event.cols,
          rows: event.rows,
        },
      ]);
    case "key":
      return Object.freeze([
        {
          kind: "key" as const,
          timeMs: 1,
          key: keyNameToCode(event.key),
          mods: keyModsToMask(event.mods),
          action: "down",
        },
      ]);
  }
}

function focusIdFromBreadcrumbs(snapshot: RuntimeBreadcrumbSnapshot | null): string | null {
  return snapshot === null ? null : snapshot.focus.focusedId;
}

function asCursorSnapshot(
  snapshot: RuntimeBreadcrumbSnapshot | null,
): ScenarioCursorSnapshot | null {
  if (snapshot === null || snapshot.cursor === null) return null;
  if (snapshot.cursor.visible) {
    return Object.freeze({
      visible: true,
      x: snapshot.cursor.x,
      y: snapshot.cursor.y,
      shape: snapshot.cursor.shape,
      blink: snapshot.cursor.blink,
    });
  }
  return Object.freeze({
    visible: false,
    shape: snapshot.cursor.shape,
    blink: snapshot.cursor.blink,
  });
}

export async function runSemanticScenario<S>(
  opts: Readonly<{
    scenario: ScenarioDefinition;
    createFixture: ScenarioFixtureFactory<S>;
  }>,
): Promise<ScenarioRunResult> {
  const fixture = opts.createFixture();
  const backend = new SemanticHarnessBackend(toTerminalCaps(opts.scenario.capabilityProfile));
  let latestState = fixture.initialState;
  let latestBreadcrumbs: RuntimeBreadcrumbSnapshot | null = null;
  const actions: RoutedAction[] = [];
  const fatal: Array<Readonly<{ code: string; detail: string }>> = [];
  const runtimeApp = createApp<S>({
    backend,
    initialState: fixture.initialState,
    config: {
      internal_onRender: (metrics: AppRenderMetrics) => {
        const breadcrumbs = (
          metrics as AppRenderMetrics & {
            runtimeBreadcrumbs?: RuntimeBreadcrumbSnapshot;
          }
        ).runtimeBreadcrumbs;
        if (breadcrumbs) latestBreadcrumbs = breadcrumbs;
      },
    },
  });
  fixture.setup?.(runtimeApp);
  runtimeApp.onEvent((event) => {
    if (event.kind === "action") actions.push(event);
    if (event.kind === "fatal") fatal.push({ code: event.code, detail: event.detail });
  });
  runtimeApp.view((state) => {
    latestState = state;
    return fixture.view(state);
  });

  const renderer = createTestRenderer({
    viewport: opts.scenario.viewport,
    theme: fixture.theme ?? defaultTheme.definition,
  });

  let currentViewport = { ...opts.scenario.viewport };
  const steps: ScenarioStepObservation[] = [];

  try {
    await runtimeApp.start();
    backend.pushBytes(
      encodeZrevBatchV1({
        events: [
          {
            kind: "resize",
            timeMs: 0,
            cols: currentViewport.cols,
            rows: currentViewport.rows,
          },
        ],
      }),
    );
    await flushMicrotasks();

    for (let index = 0; index < opts.scenario.scriptedInput.length; index++) {
      const step = opts.scenario.scriptedInput[index];
      if (step === undefined) continue;
      const events = eventToZrevEvents(step.event);
      if (step.event.kind === "resize") {
        currentViewport = { cols: step.event.cols, rows: step.event.rows };
      }
      backend.pushBytes(encodeZrevBatchV1({ events }));
      await flushMicrotasks();
      const focusedId = focusIdFromBreadcrumbs(latestBreadcrumbs);
      const screenRender = renderer.render(fixture.view(latestState), {
        viewport: currentViewport,
        theme: fixture.theme ?? defaultTheme.definition,
        focusedId,
      });
      steps.push(
        Object.freeze({
          step: index + 1,
          screen: createScenarioScreenSnapshot(currentViewport, screenRender.toText()),
          cursor: asCursorSnapshot(latestBreadcrumbs),
          actions: Object.freeze(actions.slice()),
        }),
      );
    }
  } finally {
    try {
      await runtimeApp.stop();
    } catch {
      // ignore harness teardown failures
    }
    runtimeApp.dispose();
  }

  const lastStep =
    steps[steps.length - 1] ??
    Object.freeze({
      step: 0,
      screen: createScenarioScreenSnapshot(currentViewport, ""),
      cursor: asCursorSnapshot(latestBreadcrumbs),
      actions: Object.freeze(actions.slice()),
    });

  const result = evaluateScenarioResult(opts.scenario, {
    mode: "semantic",
    actions: Object.freeze(actions.slice()),
    steps: Object.freeze(steps),
    finalScreen: lastStep.screen,
    finalCursor: lastStep.cursor,
  });
  if (fatal.length === 0) return result;
  return Object.freeze({
    ...result,
    status: "FAIL",
    pass: false,
    mismatches: Object.freeze([
      ...result.mismatches,
      ...fatal.map((item, index) =>
        Object.freeze({
          code: "ZR_SCENARIO_RUNTIME_FATAL" as const,
          path: `fatal[${String(index)}]`,
          detail: `${item.code}: ${item.detail}`,
        }),
      ),
    ]),
  });
}
