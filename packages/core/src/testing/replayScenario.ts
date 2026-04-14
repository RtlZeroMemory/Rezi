import { runReproReplayHarness, type ReproBundle, type ReproReplayExpectedAction } from "../repro/index.js";
import { DEFAULT_TERMINAL_CAPS, type TerminalCaps } from "../terminalCaps.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import { compileTheme } from "../theme/theme.js";
import { createTestRenderer } from "./renderer.js";
import {
  createScenarioScreenSnapshot,
  type ScenarioCapabilityProfile,
  type ScenarioDefinition,
  type ScenarioExpectedAction,
  type ScenarioFixtureFactory,
  type ScenarioMismatch,
  type ScenarioRunResult,
  type ScenarioScriptedInputEvent,
  type ScenarioStepObservation,
} from "./scenario.js";
import { evaluateScenarioResult } from "./assertions.js";
import { encodeZrevBatchV1, type TestZrevEvent } from "./events.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DELETE,
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  charToKeyCode,
  ZR_MOD_ALT,
  ZR_MOD_CTRL,
  ZR_MOD_META,
  ZR_MOD_SHIFT,
} from "../keybindings/keyCodes.js";

function colorModeToCapsColor(mode: ScenarioCapabilityProfile["colorMode"]): TerminalCaps["colorMode"] {
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

function keyNameToCode(key: string | number): number {
  if (typeof key === "number") return key;
  const normalized = key.trim().toLowerCase();
  if (normalized.length === 1) return charToKeyCode(normalized) ?? 0;
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
      throw new Error(`Unsupported replay scenario key ${JSON.stringify(key)}`);
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

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function resizeEventsFrom(event: ScenarioScriptedInputEvent): readonly Readonly<{
  eventIndex: number;
  cols: number;
  rows: number;
  timeMs: number;
}>[] {
  if (event.kind !== "resize") return Object.freeze([]);
  return Object.freeze([
    Object.freeze({ eventIndex: 0, cols: event.cols, rows: event.rows, timeMs: 1 }),
  ]);
}

function toReplayExpectedActions(
  expected: readonly ScenarioExpectedAction[] | undefined,
): readonly ReproReplayExpectedAction[] {
  const out: ReproReplayExpectedAction[] = [];
  for (const action of expected ?? []) {
    if (action.action === "press") {
      out.push(Object.freeze({ id: action.id, action: "press" }));
      continue;
    }
    if (action.action === "input") {
      out.push(
        Object.freeze({
          id: action.id,
          action: "input",
          value: action.value,
          cursor: action.cursor,
        }),
      );
      continue;
    }
    throw new Error(`Replay MVP supports only press/input expectedActions (got ${action.action})`);
  }
  return Object.freeze(out);
}

function createReplayBundle(scenario: ScenarioDefinition): ReproBundle {
  const batches = scenario.scriptedInput.map((step, index) => {
    const encodedEvents = eventToZrevEvents(step.event);
    const bytes = encodeZrevBatchV1({ events: encodedEvents });
    return Object.freeze({
      step: index + 1,
      deltaMs: step.atMs,
      byteLength: bytes.byteLength,
      bytesHex: bytesToHex(bytes),
      eventCount: encodedEvents.length,
      droppedBatches: 0,
      resizeEvents: resizeEventsFrom(step.event),
    });
  });
  return Object.freeze({
    schema: "rezi-repro-v1",
    captureConfig: Object.freeze({
      captureRawEvents: true,
      captureDrawlistBytes: false,
      maxEventBytes: 1 << 20,
      maxDrawlistBytes: 0,
      maxFrames: 1024,
      fpsCap: 60,
      cursorProtocolVersion: 2,
    }),
    capsSnapshot: Object.freeze({
      terminalCaps: toTerminalCaps(scenario.capabilityProfile),
      backendCaps: Object.freeze({
        maxEventBytes: 1 << 20,
        fpsCap: 60,
        cursorProtocolVersion: 2,
      }),
    }),
    timingModel: Object.freeze({
      kind: "deterministic",
      clock: "monotonic-ms",
      replayStrategy: "recorded-delta",
      timeUnit: "ms",
      baseTimeMs: 0,
    }),
    eventCapture: Object.freeze({
      ordering: "poll-order",
      timing: "step-delta-ms",
      bounds: Object.freeze({
        maxBatches: Math.max(1, batches.length),
        maxEvents: Math.max(1, batches.reduce((sum, item) => sum + item.eventCount, 0)),
        maxBytes: Math.max(1, batches.reduce((sum, item) => sum + item.byteLength, 0)),
      }),
      totals: Object.freeze({
        capturedBatches: batches.length,
        capturedEvents: batches.reduce((sum, item) => sum + item.eventCount, 0),
        capturedBytes: batches.reduce((sum, item) => sum + item.byteLength, 0),
        runtimeDroppedBatches: 0,
        omittedBatches: 0,
        omittedEvents: 0,
        omittedBytes: 0,
      }),
      truncation: Object.freeze({
        mode: "drop-tail-batch",
        truncated: false,
        reason: null,
        firstOmittedStep: null,
      }),
      batches: Object.freeze(batches),
    }),
  });
}

export async function runReplayScenario<S>(opts: Readonly<{
  scenario: ScenarioDefinition;
  createFixture: ScenarioFixtureFactory<S>;
}>): Promise<ScenarioRunResult> {
  const fixture = opts.createFixture();
  const renderer = createTestRenderer({
    viewport: opts.scenario.viewport,
    theme: fixture.theme ?? defaultTheme.definition,
  });
  const staticText = renderer.render(fixture.view(fixture.initialState), {
    viewport: opts.scenario.viewport,
    theme: fixture.theme ?? defaultTheme.definition,
    focusedId: null,
  }).toText();
  const staticScreen = createScenarioScreenSnapshot(opts.scenario.viewport, staticText);
  const steps: ScenarioStepObservation[] = opts.scenario.scriptedInput.map((_, index) =>
    Object.freeze({
      step: index + 1,
      screen: staticScreen,
      cursor: null,
      actions: Object.freeze([]),
    }),
  );

  const replayResult = await runReproReplayHarness({
    bundle: createReplayBundle(opts.scenario),
    view: () => fixture.view(fixture.initialState),
    initialViewport: opts.scenario.viewport,
    theme: compileTheme(fixture.theme ?? defaultTheme.definition),
    expectedActions: toReplayExpectedActions(opts.scenario.expectedActions),
    invariants: { noFatal: true, noOverrun: true },
  });

  const result = evaluateScenarioResult(opts.scenario, {
    mode: "replay",
    actions: Object.freeze(
      replayResult.replay.actions.map((action) => {
        if (action.action === "input") {
          return Object.freeze({
            id: action.id,
            action: "input" as const,
            value: action.value,
            cursor: action.cursor,
          });
        }
        return Object.freeze({ id: action.id, action: "press" as const });
      }),
    ),
    steps: Object.freeze(steps),
    finalScreen: staticScreen,
    finalCursor: null,
  });

  if (opts.scenario.expectedCursorState === undefined) return result;
  const mismatch: ScenarioMismatch = Object.freeze({
    code: "ZR_SCENARIO_UNSUPPORTED",
    path: "expectedCursorState",
    detail: "Replay MVP does not capture live cursor state; use semantic or PTY mode for cursor-dependent scenarios",
  });
  return Object.freeze({
    ...result,
    status: "FAIL",
    pass: false,
    mismatches: Object.freeze([...result.mismatches, mismatch]),
  });
}
