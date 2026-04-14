import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import type { RoutedAction, TerminalCaps } from "@rezi-ui/core";
import {
  type ScenarioCursorSnapshot,
  type ScenarioDefinition,
  type ScenarioMismatch,
  type ScenarioRunResult,
  type ScenarioStepObservation,
  evaluateScenarioResult,
  validateScenarioDefinition,
} from "@rezi-ui/core/testing";
import { startPtyHarness } from "./ptyHarness.js";
import type { TerminalScreenCursor } from "./screen.js";

export type PtyScenarioHarnessTarget = Readonly<{
  cwd: string;
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
}>;

type HarnessCommand = Readonly<{ type: "stop" }>;

type HarnessMessage =
  | Readonly<{ type: "ready"; caps: TerminalCaps }>
  | Readonly<{ type: "engine" }>
  | Readonly<{ type: "action"; action: RoutedAction }>
  | Readonly<{ type: "render"; cursor: ScenarioCursorSnapshot | null }>
  | Readonly<{ type: "fatal"; detail: string }>;

type ControlState = Readonly<{
  socket: { current: net.Socket | null };
  ready: { value: boolean };
  caps: { value: TerminalCaps | null };
  actions: RoutedAction[];
  fatals: string[];
  latestCursor: { value: ScenarioCursorSnapshot | null };
  engineSeq: { value: number };
  renderSeq: { value: number };
  lastRenderAt: { value: number };
}>;

const READY_TIMEOUT_MS = 5_000;
const INITIAL_RENDER_TIMEOUT_MS = 250;
const STEP_TIMEOUT_MS = 2_000;
const QUIET_WINDOW_MS = 40;
const NO_PROGRESS_GRACE_MS = 250;
const SHUTDOWN_WAIT_MS = 1_000;

type PtyInputStep =
  | Readonly<{ kind: "write"; data: string }>
  | Readonly<{ kind: "resize"; cols: number; rows: number }>;

function keyToBytes(key: string | number, mods: readonly string[] | undefined): string {
  const normalized = typeof key === "number" ? key : key.trim().toLowerCase();
  const ctrl = mods?.includes("ctrl") ?? false;
  const alt = mods?.includes("alt") ?? false;
  const meta = mods?.includes("meta") ?? false;
  if ((alt || meta) && typeof normalized === "string" && normalized.length === 1 && !ctrl) {
    return `\u001b${normalized}`;
  }
  if (ctrl && typeof normalized === "string" && normalized.length === 1) {
    const upper = normalized.toUpperCase();
    const code = upper.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      return String.fromCharCode(code - 64);
    }
  }
  if (typeof normalized === "string" && normalized.length === 1 && !ctrl && !alt && !meta) {
    return normalized;
  }
  switch (normalized) {
    case "enter":
    case "return":
      return "\r";
    case "escape":
    case "esc":
      return "\u001b";
    case "tab":
      return "\t";
    case "backspace":
      return "\u007f";
    case "up":
      return "\u001b[A";
    case "down":
      return "\u001b[B";
    case "right":
      return "\u001b[C";
    case "left":
      return "\u001b[D";
    case "home":
      return "\u001b[H";
    case "end":
      return "\u001b[F";
    case "delete":
    case "del":
      return "\u001b[3~";
    case "pageup":
      return "\u001b[5~";
    case "pagedown":
      return "\u001b[6~";
    default:
      throw new Error(
        `Unsupported PTY scenario key ${JSON.stringify(key)} with mods ${JSON.stringify(mods ?? [])}`,
      );
  }
}

function eventToInputStep(
  scenario: ScenarioDefinition,
  step: ScenarioDefinition["scriptedInput"][number],
): PtyInputStep {
  switch (step.event.kind) {
    case "text":
      return Object.freeze({ kind: "write", data: step.event.text });
    case "paste": {
      const data = scenario.capabilityProfile.supportsBracketedPaste
        ? `\u001b[200~${step.event.text}\u001b[201~`
        : step.event.text;
      return Object.freeze({ kind: "write", data });
    }
    case "resize":
      return Object.freeze({ kind: "resize", cols: step.event.cols, rows: step.event.rows });
    case "key":
      return Object.freeze({ kind: "write", data: keyToBytes(step.event.key, step.event.mods) });
  }
}

function combineCursor(
  terminalCursor: TerminalScreenCursor,
  reported: ScenarioCursorSnapshot | null,
): ScenarioCursorSnapshot | null {
  if (reported === null) {
    return terminalCursor.visible
      ? Object.freeze({
          visible: true,
          x: terminalCursor.x,
          y: terminalCursor.y,
          shape: 2,
          blink: true,
        })
      : Object.freeze({ visible: false, shape: 2, blink: true });
  }
  if (!terminalCursor.visible || !reported.visible) {
    return Object.freeze({ visible: false, shape: reported.shape, blink: reported.blink });
  }
  return Object.freeze({
    visible: true,
    x: terminalCursor.x,
    y: terminalCursor.y,
    shape: reported.shape,
    blink: reported.blink,
  });
}

function parseMessage(line: string): HarnessMessage | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Partial<HarnessMessage>;
  if (record.type === "ready" && typeof (record as { caps?: TerminalCaps }).caps === "object") {
    return Object.freeze({
      type: "ready",
      caps: (record as { caps: TerminalCaps }).caps,
    });
  }
  if (record.type === "fatal" && typeof record.detail === "string") {
    return Object.freeze({ type: "fatal", detail: record.detail });
  }
  if (record.type === "engine") {
    return Object.freeze({ type: "engine" });
  }
  if (record.type === "render") {
    return Object.freeze({
      type: "render",
      cursor: (record as { cursor?: ScenarioCursorSnapshot | null }).cursor ?? null,
    });
  }
  if (
    record.type === "action" &&
    typeof (record as { action?: RoutedAction }).action === "object"
  ) {
    return Object.freeze({ type: "action", action: (record as { action: RoutedAction }).action });
  }
  return null;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function createControlServer(
  state: ControlState,
): Promise<Readonly<{ port: number; server: net.Server }>> {
  const server = net.createServer((socket) => {
    state.socket.current = socket;
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("error", () => {
      // PTY target shutdown can reset the control socket; observations remain buffered.
    });
    socket.on("close", () => {
      if (state.socket.current === socket) state.socket.current = null;
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const message = parseMessage(line);
        if (message === null) continue;
        if (message.type === "ready") {
          state.ready.value = true;
          state.caps.value = message.caps;
          continue;
        }
        if (message.type === "action") {
          state.actions.push(message.action);
          continue;
        }
        if (message.type === "fatal") {
          state.fatals.push(message.detail);
          continue;
        }
        if (message.type === "engine") {
          state.engineSeq.value += 1;
          continue;
        }
        state.latestCursor.value = message.cursor;
        state.renderSeq.value += 1;
        state.lastRenderAt.value = Date.now();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Failed to allocate PTY scenario control port");
  }
  return Object.freeze({ port: address.port, server });
}

async function waitForReady(state: ControlState): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!state.ready.value) {
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for PTY scenario target readiness");
    await delay(10);
  }
}

async function waitForInitialRender(state: ControlState): Promise<void> {
  const deadline = Date.now() + INITIAL_RENDER_TIMEOUT_MS;
  while (state.renderSeq.value === 0 && Date.now() <= deadline) {
    await delay(10);
  }
}

function colorModeMeets(
  actual: TerminalCaps["colorMode"],
  expected: ScenarioDefinition["capabilityProfile"]["colorMode"],
): boolean {
  if (expected === "none") return true;
  if (expected === "16") return actual >= 1;
  if (expected === "256") return actual >= 2;
  return actual >= 3;
}

function capabilityMismatches(
  scenario: ScenarioDefinition,
  actual: TerminalCaps | null,
): readonly ScenarioMismatch[] {
  if (actual === null) {
    return Object.freeze([
      Object.freeze({
        code: "ZR_SCENARIO_RUNTIME_FATAL" as const,
        path: "capabilityProfile",
        detail: "PTY scenario target did not report terminal capabilities",
      }),
    ]);
  }
  const mismatches: ScenarioMismatch[] = [];
  if (!colorModeMeets(actual.colorMode, scenario.capabilityProfile.colorMode)) {
    mismatches.push({
      code: "ZR_SCENARIO_UNSUPPORTED",
      path: "capabilityProfile.colorMode",
      detail: "PTY target color mode does not satisfy the scenario requirement",
      expected: scenario.capabilityProfile.colorMode,
      actual: actual.colorMode,
    });
  }
  const capabilityChecks = [
    ["supportsMouse", scenario.capabilityProfile.supportsMouse, actual.supportsMouse],
    [
      "supportsBracketedPaste",
      scenario.capabilityProfile.supportsBracketedPaste,
      actual.supportsBracketedPaste,
    ],
    [
      "supportsFocusEvents",
      scenario.capabilityProfile.supportsFocusEvents,
      actual.supportsFocusEvents,
    ],
    ["supportsOsc52", scenario.capabilityProfile.supportsOsc52, actual.supportsOsc52],
  ] as const;
  for (const [name, required, supported] of capabilityChecks) {
    if (!required || supported) continue;
    mismatches.push({
      code: "ZR_SCENARIO_UNSUPPORTED",
      path: `capabilityProfile.${name}`,
      detail: `PTY target does not support required capability ${name}`,
      expected: true,
      actual: supported,
    });
  }
  return Object.freeze(mismatches);
}

async function waitForQuiet(
  state: ControlState,
  baselineRender: number,
  baselineEngine: number,
  requireProgress: boolean,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= STEP_TIMEOUT_MS) {
    const hasNewRender = state.renderSeq.value > baselineRender;
    const hasNewEngine = state.engineSeq.value > baselineEngine;
    const quietForMs = Date.now() - state.lastRenderAt.value;
    if (hasNewRender && quietForMs >= QUIET_WINDOW_MS) return;
    if (!hasNewRender && hasNewEngine && Date.now() - startedAt >= QUIET_WINDOW_MS) return;
    if (
      !hasNewRender &&
      !hasNewEngine &&
      Date.now() - startedAt >= (requireProgress ? NO_PROGRESS_GRACE_MS : QUIET_WINDOW_MS)
    ) {
      return;
    }
    await delay(10);
  }
  throw new Error(
    requireProgress
      ? "Timed out waiting for PTY scenario input processing to settle after input"
      : "Timed out waiting for PTY scenario state to settle",
  );
}

function sendCommand(socket: net.Socket | null, command: HarnessCommand): void {
  if (socket === null || socket.destroyed || !socket.writable) return;
  try {
    socket.write(`${JSON.stringify(command)}\n`);
  } catch {
    // best-effort control channel
  }
}

async function waitForHarnessExit(
  harness: Awaited<ReturnType<typeof startPtyHarness>>,
): Promise<void> {
  await Promise.race([
    harness.waitForExit().then(() => undefined),
    delay(SHUTDOWN_WAIT_MS).then(() => undefined),
  ]);
}

export async function runPtyScenario(
  opts: Readonly<{
    scenario: ScenarioDefinition;
    target: PtyScenarioHarnessTarget;
  }>,
): Promise<ScenarioRunResult> {
  const validation = validateScenarioDefinition(opts.scenario);
  if (validation.length > 0) {
    return Object.freeze({
      mode: "pty",
      status: "FAIL",
      pass: false,
      actions: Object.freeze([]),
      steps: Object.freeze([]),
      finalScreen: Object.freeze({
        cols: opts.scenario.viewport.cols,
        rows: opts.scenario.viewport.rows,
        lines: Object.freeze([]),
      }),
      finalCursor: null,
      mismatches: validation,
    });
  }

  const state: ControlState = Object.freeze({
    socket: { current: null },
    ready: { value: false },
    caps: { value: null },
    actions: [],
    fatals: [],
    latestCursor: { value: null },
    engineSeq: { value: 0 },
    renderSeq: { value: 0 },
    lastRenderAt: { value: Date.now() },
  });
  const control = await createControlServer(state);
  const harness = await startPtyHarness(
    Object.freeze({
      cwd: opts.target.cwd,
      command: opts.target.command,
      ...(opts.target.args !== undefined ? { args: opts.target.args } : {}),
      env: {
        ...(opts.target.env ?? {}),
        REZI_SCENARIO_CTRL_PORT: String(control.port),
      },
      cols: opts.scenario.viewport.cols,
      rows: opts.scenario.viewport.rows,
    }),
  );

  const steps: ScenarioStepObservation[] = [];
  try {
    await waitForReady(state);
    const capabilityErrors = capabilityMismatches(opts.scenario, state.caps.value);
    if (capabilityErrors.length > 0) {
      const snapshot = harness.snapshot();
      return Object.freeze({
        mode: "pty",
        status: "FAIL",
        pass: false,
        actions: Object.freeze(state.actions.slice()),
        steps: Object.freeze([]),
        finalScreen: snapshot.screen,
        finalCursor: combineCursor(snapshot.cursor, state.latestCursor.value),
        mismatches: capabilityErrors,
      });
    }
    await waitForInitialRender(state);

    let previousAtMs = 0;
    for (let index = 0; index < opts.scenario.scriptedInput.length; index++) {
      const scenarioStep = opts.scenario.scriptedInput[index];
      if (scenarioStep === undefined) continue;
      const delayMs = Math.max(0, scenarioStep.atMs - previousAtMs);
      previousAtMs = scenarioStep.atMs;
      if (delayMs > 0) await delay(delayMs);
      const baselineRender = state.renderSeq.value;
      const baselineEngine = state.engineSeq.value;
      const inputStep = eventToInputStep(opts.scenario, scenarioStep);
      if (inputStep.kind === "write") {
        await harness.write(inputStep.data);
      } else {
        await harness.resize(inputStep.cols, inputStep.rows);
      }
      await waitForQuiet(state, baselineRender, baselineEngine, true);
      const snapshot = harness.snapshot();
      steps.push(
        Object.freeze({
          step: index + 1,
          screen: snapshot.screen,
          cursor: combineCursor(snapshot.cursor, state.latestCursor.value),
          actions: Object.freeze(state.actions.slice()),
        }),
      );
    }

    const finalSnapshot = harness.snapshot();
    const finalCursor = combineCursor(finalSnapshot.cursor, state.latestCursor.value);
    sendCommand(state.socket.current, { type: "stop" });
    const exit = await harness.waitForExit();
    const baseResult = evaluateScenarioResult(opts.scenario, {
      mode: "pty",
      actions: Object.freeze(state.actions.slice()),
      steps: Object.freeze(steps),
      finalScreen: finalSnapshot.screen,
      finalCursor,
    });
    const mismatches: ScenarioMismatch[] = [...baseResult.mismatches];
    if (exit.exitCode !== 0) {
      mismatches.push({
        code: "ZR_SCENARIO_RUNTIME_FATAL",
        path: "process.exitCode",
        detail: `PTY target exited with code ${String(exit.exitCode)}`,
        expected: 0,
        actual: exit.exitCode,
      });
    }
    for (let index = 0; index < state.fatals.length; index++) {
      mismatches.push({
        code: "ZR_SCENARIO_RUNTIME_FATAL",
        path: `fatal[${String(index)}]`,
        detail: state.fatals[index] ?? "unknown fatal",
      });
    }
    return Object.freeze({
      ...baseResult,
      status: mismatches.length === 0 ? "PASS" : "FAIL",
      pass: mismatches.length === 0,
      mismatches: Object.freeze(mismatches),
    });
  } finally {
    try {
      sendCommand(state.socket.current, { type: "stop" });
    } catch {
      // best-effort shutdown
    }
    try {
      harness.kill();
    } catch {
      // already exited
    }
    await waitForHarnessExit(harness);
    await closeServer(control.server);
  }
}
