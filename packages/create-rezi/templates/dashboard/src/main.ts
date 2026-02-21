import { exit } from "node:process";
import { createApp } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import { resolveDashboardCommand } from "./helpers/keybindings.js";
import { reduceDashboardState, selectedService } from "./helpers/state.js";
import { createInitialState } from "./helpers/state.js";
import { renderOverviewScreen } from "./screens/overview.js";
import { themeSpec } from "./theme.js";
import type { DashboardAction } from "./types.js";

const UI_FPS_CAP = 30;
const TICK_MS = 900;

const initialState = createInitialState();

const app = createApp({
  backend: createNodeBackend({
    fpsCap: UI_FPS_CAP,
    emojiWidthPolicy: "auto",
    executionMode: "worker",
  }),
  config: { fpsCap: UI_FPS_CAP },
  initialState,
  theme: themeSpec(initialState.themeName).theme,
});

function dispatch(action: DashboardAction): void {
  let nextThemeName = initialState.themeName;
  let themeChanged = false;

  app.update((previous) => {
    const next = reduceDashboardState(previous, action);
    if (next.themeName !== previous.themeName) {
      nextThemeName = next.themeName;
      themeChanged = true;
    }
    return next;
  });

  if (themeChanged) {
    app.setTheme(themeSpec(nextThemeName).theme);
  }
}

let stopping = false;
let telemetryTimer: ReturnType<typeof setInterval> | null = null;

async function stopApp(): Promise<void> {
  if (stopping) return;
  stopping = true;

  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }

  try {
    await app.stop();
  } catch {
    // Ignore shutdown races.
  }

  app.dispose();
  exit(0);
}

function applyCommand(command: ReturnType<typeof resolveDashboardCommand>): void {
  if (!command) return;

  if (command === "quit") {
    void stopApp();
    return;
  }

  if (command === "move-up") {
    dispatch({ type: "move-selection", delta: -1 });
    return;
  }

  if (command === "move-down") {
    dispatch({ type: "move-selection", delta: 1 });
    return;
  }

  if (command === "toggle-help") {
    dispatch({ type: "toggle-help" });
    return;
  }

  if (command === "toggle-pause") {
    dispatch({ type: "toggle-pause" });
    return;
  }

  if (command === "cycle-filter") {
    dispatch({ type: "cycle-filter" });
    return;
  }

  if (command === "cycle-theme") {
    dispatch({ type: "cycle-theme" });
  }
}

app.view((state) =>
  renderOverviewScreen(state, {
    onTogglePause: () => dispatch({ type: "toggle-pause" }),
    onCycleFilter: () => dispatch({ type: "cycle-filter" }),
    onCycleTheme: () => dispatch({ type: "cycle-theme" }),
    onToggleHelp: () => dispatch({ type: "toggle-help" }),
    onSelectService: (serviceId) => dispatch({ type: "set-selected-id", serviceId }),
  }),
);

app.keys({
  q: () => applyCommand(resolveDashboardCommand("q")),
  "ctrl+c": () => applyCommand(resolveDashboardCommand("ctrl+c")),
  up: () => applyCommand(resolveDashboardCommand("up")),
  down: () => applyCommand(resolveDashboardCommand("down")),
  j: () => applyCommand(resolveDashboardCommand("j")),
  k: () => applyCommand(resolveDashboardCommand("k")),
  h: () => applyCommand(resolveDashboardCommand("h")),
  "shift+/": () => applyCommand(resolveDashboardCommand("shift+/")),
  f: () => applyCommand(resolveDashboardCommand("f")),
  t: () => applyCommand(resolveDashboardCommand("t")),
  p: () => applyCommand(resolveDashboardCommand("p")),
  space: () => applyCommand(resolveDashboardCommand("space")),
  escape: () => {
    app.update((state) => (state.showHelp ? { ...state, showHelp: false } : state));
  },
  enter: () => {
    app.update((state) => {
      const selected = selectedService(state);
      if (!selected) return state;
      return { ...state, selectedId: selected.id };
    });
  },
});

app.onEvent((event) => {
  if (event.kind === "fatal") {
    if (telemetryTimer) {
      clearInterval(telemetryTimer);
      telemetryTimer = null;
    }
  }
});

telemetryTimer = setInterval(() => {
  dispatch({ type: "tick", nowMs: Date.now() });
}, TICK_MS);

try {
  await app.start();
} finally {
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }
}
