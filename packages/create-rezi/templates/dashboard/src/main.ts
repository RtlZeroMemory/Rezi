import { exit } from "node:process";
import { createApp, defineWidget, useStream } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import { resolveDashboardCommand } from "./helpers/keybindings.js";
import { reduceDashboardState, selectedService } from "./helpers/state.js";
import { createInitialState } from "./helpers/state.js";
import { createTelemetryStream } from "./helpers/telemetry.js";
import { renderOverviewScreen } from "./screens/overview.js";
import { themeSpec } from "./theme.js";
import type { DashboardAction, DashboardState } from "./types.js";

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

const DashboardRoot = defineWidget<{
  key?: string;
  state: DashboardState;
  dispatch: (action: DashboardAction) => void;
}>(
  (props, ctx) => {
    const telemetryStream = ctx.useMemo(() => createTelemetryStream(TICK_MS), []);
    const telemetry = useStream(ctx, telemetryStream, [telemetryStream]);
    const lastTickRef = ctx.useRef<number | undefined>(undefined);

    ctx.useEffect(() => {
      const nextTick = telemetry.value;
      if (!nextTick) return;
      if (lastTickRef.current === nextTick.nowMs) return;
      lastTickRef.current = nextTick.nowMs;
      props.dispatch({ type: "tick", nowMs: nextTick.nowMs });
    }, [telemetry.value, props.dispatch]);

    return renderOverviewScreen(props.state, {
      onTogglePause: () => props.dispatch({ type: "toggle-pause" }),
      onCycleFilter: () => props.dispatch({ type: "cycle-filter" }),
      onCycleTheme: () => props.dispatch({ type: "cycle-theme" }),
      onToggleHelp: () => props.dispatch({ type: "toggle-help" }),
      onSelectService: (serviceId) => props.dispatch({ type: "set-selected-id", serviceId }),
    });
  },
  { name: "DashboardRoot" },
);

let stopping = false;

async function stopApp(): Promise<void> {
  if (stopping) return;
  stopping = true;

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
  DashboardRoot({
    state,
    dispatch,
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

await app.start();
