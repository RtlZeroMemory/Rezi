import { exit } from "node:process";
import { createNodeApp } from "@rezi-ui/node";
import { resolveAnimationLabCommand } from "./helpers/keybindings.js";
import { createInitialState, reduceAnimationLabState } from "./helpers/state.js";
import { renderReactorLab } from "./screens/reactor-lab.js";
import type { AnimationLabAction, NudgePayload } from "./types.js";

function describeThrown(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

const app = createNodeApp({
  initialState: createInitialState({
    cols: typeof process.stdout.columns === "number" ? process.stdout.columns : 96,
    rows: typeof process.stdout.rows === "number" ? process.stdout.rows : 32,
  }),
  config: { fpsCap: 30, executionMode: "inline" },
});

function dispatch(action: AnimationLabAction): void {
  app.update((previous) => reduceAnimationLabState(previous, action));
}

let stopping = false;
let autoplay = true;
let tickTimer: ReturnType<typeof setInterval> | null = null;

function stopTickTimer(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTickTimer(): void {
  stopTickTimer();
  if (!autoplay) return;
  tickTimer = setInterval(() => {
    dispatch({ type: "advance" });
  }, 220);
}

async function shutdown(exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  stopTickTimer();

  try {
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  app.dispose();
  exit(exitCode);
}

function randomNudge(): NudgePayload {
  return {
    driftDelta: (Math.random() - 0.5) * 1.2,
    fluxDelta: (Math.random() - 0.5) * 0.7,
    orbitDelta: (Math.random() - 0.5) * 0.7,
    burstDelta: Math.random() * 0.8,
    opacityDelta: (Math.random() - 0.5) * 0.4,
  };
}

app.view((state) => renderReactorLab(state));

function applyCommand(command: ReturnType<typeof resolveAnimationLabCommand>): void {
  if (!command) return;

  if (command === "quit") {
    void shutdown(0);
    return;
  }

  if (command === "toggle-autoplay") {
    autoplay = !autoplay;
    startTickTimer();
    return;
  }

  if (command === "step") {
    dispatch({ type: "advance" });
    return;
  }

  if (command === "burst") {
    dispatch({ type: "burst" });
    return;
  }

  if (command === "cycle-phase") {
    dispatch({ type: "cycle-phase" });
    return;
  }

  if (command === "randomize") {
    dispatch({ type: "nudge", payload: randomNudge() });
    return;
  }

  if (command === "nudge-right") {
    dispatch({
      type: "nudge",
      payload: { driftDelta: 0.12, orbitDelta: 0.08 },
    });
    return;
  }

  if (command === "nudge-left") {
    dispatch({
      type: "nudge",
      payload: { driftDelta: -0.12, orbitDelta: -0.08 },
    });
    return;
  }

  if (command === "nudge-up") {
    dispatch({
      type: "nudge",
      payload: { fluxDelta: 0.08, opacityDelta: 0.04 },
    });
    return;
  }

  dispatch({
    type: "nudge",
    payload: { fluxDelta: -0.08, opacityDelta: -0.04 },
  });
}

app.keys({
  q: () => applyCommand(resolveAnimationLabCommand("q")),
  "ctrl+c": () => applyCommand(resolveAnimationLabCommand("ctrl+c")),
  space: () => applyCommand(resolveAnimationLabCommand("space")),
  p: () => applyCommand(resolveAnimationLabCommand("p")),
  enter: () => applyCommand(resolveAnimationLabCommand("enter")),
  right: () => applyCommand(resolveAnimationLabCommand("right")),
  left: () => applyCommand(resolveAnimationLabCommand("left")),
  up: () => applyCommand(resolveAnimationLabCommand("up")),
  down: () => applyCommand(resolveAnimationLabCommand("down")),
  b: () => applyCommand(resolveAnimationLabCommand("b")),
  r: () => applyCommand(resolveAnimationLabCommand("r")),
  m: () => applyCommand(resolveAnimationLabCommand("m")),
});

app.onEvent((event) => {
  if (event.kind === "engine") {
    const engineEvent = event.event;
    if (engineEvent.kind === "resize") {
      dispatch({ type: "apply-viewport", cols: engineEvent.cols, rows: engineEvent.rows });
    }
    return;
  }

  if (event.kind !== "fatal") return;
  console.error(`fatal: ${event.code}: ${event.detail}`);
  void shutdown(1);
});

const onSignal = () => {
  void shutdown(0);
};

process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

startTickTimer();

try {
  await app.start();
} catch (error) {
  console.error(`Failed to start animation lab: ${describeThrown(error)}`);
  await shutdown(1);
} finally {
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
}
