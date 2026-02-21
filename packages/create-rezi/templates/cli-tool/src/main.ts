import { exit } from "node:process";
import { createApp } from "@rezi-ui/core";
import { createHotStateReload, createNodeBackend } from "@rezi-ui/node";
import { resolveCliCommand } from "./helpers/keybindings.js";
import { createInitialState, reduceCliState } from "./helpers/state.js";
import { createCliRoutes } from "./screens/index.js";
import { themeSpec } from "./theme.js";
import type { CliAction, RouteId } from "./types.js";

const UI_FPS_CAP = 30;
const LOG_TICK_MS = 1000;

const initialState = createInitialState();

let app!: ReturnType<typeof createApp<typeof initialState>>;
const enableHsr = process.argv.includes("--hsr") || process.env.REZI_HSR === "1";
let hsrController: ReturnType<typeof createHotStateReload<typeof initialState>> | null = null;
let stopping = false;
let logTimer: ReturnType<typeof setInterval> | null = null;

type CreateCliRoutesFn = typeof createCliRoutes;
type CliRoutesModule = Readonly<{
  createCliRoutes?: CreateCliRoutesFn;
}>;

function dispatch(action: CliAction): void {
  let nextTheme = initialState.themeName;
  let themeChanged = false;

  app.update((previous) => {
    const next = reduceCliState(previous, action);
    if (next.themeName !== previous.themeName) {
      nextTheme = next.themeName;
      themeChanged = true;
    }
    return next;
  });

  if (themeChanged) {
    app.setTheme(themeSpec(nextTheme).theme);
  }
}

function navigate(routeId: RouteId): void {
  const router = app.router;
  if (!router) return;
  const current = router.currentRoute();
  if (current.id === routeId) return;
  router.navigate(routeId);
}

function buildCliRoutes(routeFactory: CreateCliRoutesFn) {
  return routeFactory({
    dispatch,
    onNavigate: navigate,
    onToggleHelp: () => dispatch({ type: "toggle-help" }),
  });
}

async function stopApp(): Promise<void> {
  if (stopping) return;
  stopping = true;

  if (hsrController) {
    await hsrController.stop();
    hsrController = null;
  }

  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }

  try {
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  app.dispose();
  exit(0);
}

function applyCommand(command: ReturnType<typeof resolveCliCommand>): void {
  if (!command) return;

  if (command === "quit") {
    void stopApp();
    return;
  }

  if (command === "go-home") {
    navigate("home");
    return;
  }

  if (command === "go-logs") {
    navigate("logs");
    return;
  }

  if (command === "go-settings") {
    navigate("settings");
    return;
  }

  if (command === "toggle-help") {
    dispatch({ type: "toggle-help" });
    return;
  }

  if (command === "toggle-refresh") {
    dispatch({ type: "toggle-refresh" });
  }
}

const routes = buildCliRoutes(createCliRoutes);

app = createApp({
  backend: createNodeBackend({ fpsCap: UI_FPS_CAP }),
  initialState,
  routes,
  initialRoute: "home",
  config: { fpsCap: UI_FPS_CAP },
  theme: themeSpec(initialState.themeName).theme,
});

app.keys({
  q: () => applyCommand(resolveCliCommand("q")),
  "ctrl+c": () => applyCommand(resolveCliCommand("ctrl+c")),
  f1: () => applyCommand(resolveCliCommand("f1")),
  f2: () => applyCommand(resolveCliCommand("f2")),
  f3: () => applyCommand(resolveCliCommand("f3")),
  "alt+1": () => applyCommand(resolveCliCommand("alt+1")),
  "alt+2": () => applyCommand(resolveCliCommand("alt+2")),
  "alt+3": () => applyCommand(resolveCliCommand("alt+3")),
  "ctrl+1": () => applyCommand(resolveCliCommand("ctrl+1")),
  "ctrl+2": () => applyCommand(resolveCliCommand("ctrl+2")),
  "ctrl+3": () => applyCommand(resolveCliCommand("ctrl+3")),
  h: () => applyCommand(resolveCliCommand("h")),
  "shift+/": () => applyCommand(resolveCliCommand("shift+/")),
  p: () => applyCommand(resolveCliCommand("p")),
  escape: () => {
    app.update((state) => (state.showHelp ? { ...state, showHelp: false } : state));
  },
});

app.onEvent((event) => {
  if (event.kind === "fatal") {
    if (logTimer) {
      clearInterval(logTimer);
      logTimer = null;
    }
  }
});

logTimer = setInterval(() => {
  dispatch({ type: "tick", nowMs: Date.now() });
}, LOG_TICK_MS);

try {
  if (enableHsr) {
    hsrController = createHotStateReload<typeof initialState>({
      app,
      routesModule: new URL("./screens/index.ts", import.meta.url),
      moduleRoot: new URL("./", import.meta.url),
      resolveRoutes: (moduleNs) => {
        const createRoutes = (moduleNs as CliRoutesModule).createCliRoutes;
        if (typeof createRoutes !== "function") {
          throw new Error("HSR: ./screens/index.ts must export createCliRoutes(deps)");
        }
        return buildCliRoutes(createRoutes);
      },
    });
    await hsrController.start();
  }

  await app.start();
} finally {
  if (hsrController) {
    await hsrController.stop();
    hsrController = null;
  }

  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }
}
