import { exit } from "node:process";
import { createNodeApp } from "@rezi-ui/node";
import { debugSnapshot } from "./helpers/debug.js";
import { resolveStarshipCommand } from "./helpers/keybindings.js";
import {
  createInitialStateWithViewport,
  filteredMessages,
  reduceStarshipState,
} from "./helpers/state.js";
import { STARSHIP_ROUTES, createStarshipRoutes } from "./screens/index.js";
import { themeSpec } from "./theme.js";
import type { RouteDeps, RouteId, StarshipAction, StarshipState } from "./types.js";

const UI_FPS_CAP = 30;
const TICK_MS = 800;
const TOAST_PRUNE_MS = 3000;

const initialState = createInitialStateWithViewport(Date.now(), {
  cols: process.stdout.columns ?? 120,
  rows: process.stdout.rows ?? 40,
});
const enableHsr = process.argv.includes("--hsr") || process.env.REZI_HSR === "1";
const hasInteractiveTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
if (!hasInteractiveTty && process.env.ZIREAEL_POSIX_PIPE_MODE === undefined) {
  process.env.ZIREAEL_POSIX_PIPE_MODE = "1";
}
debugSnapshot("runtime.bootstrap", {
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  pid: process.pid,
  node: process.version,
  stdinIsTty: Boolean(process.stdin.isTTY),
  stdoutIsTty: Boolean(process.stdout.isTTY),
  cols: process.stdout.columns ?? null,
  rows: process.stdout.rows ?? null,
  enableHsr,
});

// biome-ignore lint/style/useConst: circular bootstrap wiring requires post-declaration assignment
let app!: ReturnType<typeof createNodeApp<StarshipState>>;
let stopping = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setInterval> | null = null;
let lastViewport = {
  cols: initialState.viewportCols,
  rows: initialState.viewportRows,
};

type CreateRoutesFn = typeof createStarshipRoutes;
type RoutesModule = Readonly<{ createStarshipRoutes?: CreateRoutesFn }>;

function dispatch(action: StarshipAction): void {
  let nextTheme = initialState.themeName;
  let themeChanged = false;

  app.update((previous) => {
    const next = reduceStarshipState(previous, action);
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

function syncViewport(cols: number, rows: number): void {
  if (cols === lastViewport.cols && rows === lastViewport.rows) return;
  lastViewport = { cols, rows };
  debugSnapshot("runtime.viewport", {
    cols,
    rows,
    route: currentRouteId(),
  });
  dispatch({ type: "set-viewport", cols, rows });
}

function syncViewportFromStdout(): void {
  if (!process.stdout.isTTY) return;
  const cols = process.stdout.columns ?? lastViewport.cols;
  const rows = process.stdout.rows ?? lastViewport.rows;
  syncViewport(cols, rows);
}

function currentRouteId(): RouteId {
  const routeId = app.router?.currentRoute().id;
  if (routeId === "bridge") return "bridge";
  if (routeId === "engineering") return "engineering";
  if (routeId === "crew") return "crew";
  if (routeId === "comms") return "comms";
  if (routeId === "cargo") return "cargo";
  if (routeId === "settings") return "settings";
  return "bridge";
}

function navigate(routeId: RouteId): void {
  const router = app.router;
  if (!router) return;
  if (router.currentRoute().id === routeId) return;
  // Top-level deck switches are peer navigation; replace avoids unbounded breadcrumb growth.
  router.replace(routeId);
}

function navigateDeckOffset(offset: 1 | -1): void {
  const current = currentRouteId();
  const index = STARSHIP_ROUTES.findIndex((route) => route.id === current);
  const safeIndex = index < 0 ? 0 : index;
  const nextIndex = (safeIndex + offset + STARSHIP_ROUTES.length) % STARSHIP_ROUTES.length;
  const nextRoute = STARSHIP_ROUTES[nextIndex];
  if (nextRoute) navigate(nextRoute.id);
}

function buildRoutes(factory: CreateRoutesFn) {
  const deps: RouteDeps = {
    dispatch,
    navigate,
    routes: STARSHIP_ROUTES,
    getBindings: () => app.getBindings(),
  };
  return factory(deps);
}

async function stopApp(code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;

  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }

  if (toastTimer) {
    clearInterval(toastTimer);
    toastTimer = null;
  }

  try {
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  try {
    app.dispose();
  } catch {
    // Ignore disposal races during shutdown.
  }
  exit(code);
}

function applyCommand(command: ReturnType<typeof resolveStarshipCommand>): void {
  if (!command) return;
  debugSnapshot("runtime.command", {
    command,
    route: currentRouteId(),
    viewportCols: lastViewport.cols,
    viewportRows: lastViewport.rows,
  });

  if (command === "quit") {
    void stopApp(0);
    return;
  }

  if (command === "go-bridge") {
    navigate("bridge");
    return;
  }

  if (command === "go-engineering") {
    navigate("engineering");
    return;
  }

  if (command === "go-crew") {
    navigate("crew");
    return;
  }

  if (command === "go-comms") {
    navigate("comms");
    return;
  }

  if (command === "go-cargo") {
    navigate("cargo");
    return;
  }

  if (command === "go-settings") {
    navigate("settings");
    return;
  }

  if (command === "go-next-deck") {
    navigateDeckOffset(1);
    return;
  }

  if (command === "go-prev-deck") {
    navigateDeckOffset(-1);
    return;
  }

  if (command === "cycle-theme") {
    dispatch({ type: "cycle-theme" });
    return;
  }

  if (command === "toggle-help") {
    dispatch({ type: "toggle-help" });
    return;
  }

  if (command === "toggle-command-palette") {
    dispatch({ type: "toggle-command-palette" });
    return;
  }

  if (command === "toggle-pause") {
    dispatch({ type: "toggle-pause" });
    return;
  }

  if (command === "toggle-autopilot") {
    dispatch({ type: "toggle-autopilot" });
    return;
  }

  if (command === "toggle-red-alert") {
    dispatch({ type: "toggle-red-alert" });
    return;
  }

  if (command === "set-alert-green") {
    dispatch({ type: "set-alert", level: "green" });
    return;
  }

  if (command === "set-alert-yellow") {
    dispatch({ type: "set-alert", level: "yellow" });
    return;
  }

  if (command === "set-alert-red") {
    dispatch({ type: "set-alert", level: "red" });
    return;
  }

  if (command === "bridge-scan") {
    dispatch({
      type: "add-toast",
      toast: {
        id: `scan-${Date.now()}`,
        message: "Bridge long-range scan complete",
        level: "info",
        timestamp: Date.now(),
        durationMs: 3000,
      },
    });
    return;
  }

  if (command === "engineering-boost") {
    dispatch({ type: "toggle-boost" });
    return;
  }

  if (command === "engineering-diagnostics") {
    dispatch({ type: "toggle-diagnostics" });
    return;
  }

  if (command === "crew-new-assignment" || command === "crew-edit-selected") {
    dispatch({ type: "toggle-crew-editor" });
    return;
  }

  if (command === "crew-search") {
    navigate("crew");
    dispatch({ type: "set-crew-search", query: "" });
    return;
  }

  if (command === "comms-search") {
    navigate("comms");
    dispatch({ type: "set-comms-search", query: "" });
    return;
  }

  if (command === "comms-hail") {
    navigate("comms");
    dispatch({ type: "toggle-hail-dialog" });
    return;
  }

  if (command === "comms-acknowledge") {
    app.update((previous) => {
      const candidate = filteredMessages(previous).find((message) => !message.acknowledged);
      if (!candidate) return previous;
      return reduceStarshipState(previous, {
        type: "acknowledge-message",
        messageId: candidate.id,
      });
    });
    return;
  }

  if (command === "comms-next-channel" || command === "comms-prev-channel") {
    app.update((previous) => {
      const channels: readonly StarshipState["activeChannel"][] = [
        "fleet",
        "local",
        "emergency",
        "internal",
      ];
      const index = channels.indexOf(previous.activeChannel);
      const safe = index < 0 ? 0 : index;
      const nextIndex =
        command === "comms-next-channel"
          ? (safe + 1) % channels.length
          : (safe - 1 + channels.length) % channels.length;
      const channel = channels[nextIndex] ?? "fleet";
      return reduceStarshipState(previous, { type: "switch-channel", channel });
    });
    return;
  }

  if (command === "cargo-sort-name") {
    dispatch({ type: "set-cargo-sort", sortBy: "name" });
    return;
  }

  if (command === "cargo-sort-category") {
    dispatch({ type: "set-cargo-sort", sortBy: "category" });
    return;
  }

  if (command === "cargo-sort-quantity") {
    dispatch({ type: "set-cargo-sort", sortBy: "quantity" });
    return;
  }

  if (command === "cargo-sort-priority") {
    dispatch({ type: "set-cargo-sort", sortBy: "priority" });
    return;
  }

  if (command === "settings-reset") {
    dispatch({ type: "toggle-reset-dialog" });
    return;
  }

  if (command === "settings-save") {
    dispatch({
      type: "add-toast",
      toast: {
        id: `save-${Date.now()}`,
        message: "Settings snapshot saved",
        level: "success",
        timestamp: Date.now(),
        durationMs: 2800,
      },
    });
    return;
  }
}

function bindKeys(): void {
  const keys = [
    "q",
    "ctrl+c",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "tab",
    "shift+tab",
    "t",
    "shift+/",
    "ctrl+p",
    "space",
    "g",
    "y",
    "r",
    "a",
    "s",
    "b",
    "d",
    "n",
    "e",
    "/",
    "h",
    "enter",
    "alt+right",
    "alt+left",
    "alt+n",
    "alt+c",
    "alt+q",
    "alt+p",
    "ctrl+r",
    "ctrl+s",
    "p",
    "c",
  ] as const;

  const bindingMap = Object.fromEntries(
    keys.map((key) => [
      key,
      () => {
        applyCommand(resolveStarshipCommand(key, currentRouteId()));
      },
    ]),
  ) as Record<string, () => void>;

  bindingMap.escape = () => {
    let nextTheme = initialState.themeName;
    let themeChanged = false;
    app.update((state) => {
      if (state.showHelp) {
        const next = reduceStarshipState(state, { type: "toggle-help" });
        if (next.themeName !== state.themeName) {
          nextTheme = next.themeName;
          themeChanged = true;
        }
        return next;
      }
      if (state.showCommandPalette) {
        const next = reduceStarshipState(state, { type: "toggle-command-palette" });
        if (next.themeName !== state.themeName) {
          nextTheme = next.themeName;
          themeChanged = true;
        }
        return next;
      }
      if (state.showHailDialog) {
        const next = reduceStarshipState(state, { type: "toggle-hail-dialog" });
        if (next.themeName !== state.themeName) {
          nextTheme = next.themeName;
          themeChanged = true;
        }
        return next;
      }
      if (state.showResetDialog) {
        const next = reduceStarshipState(state, { type: "toggle-reset-dialog" });
        if (next.themeName !== state.themeName) {
          nextTheme = next.themeName;
          themeChanged = true;
        }
        return next;
      }
      return state;
    });
    if (themeChanged) {
      app.setTheme(themeSpec(nextTheme).theme);
    }
  };

  app.keys(bindingMap);
}

const routes = buildRoutes(createStarshipRoutes);

debugSnapshot("runtime.app.create", {
  routeCount: routes.length,
  initialRoute: "bridge",
  fpsCap: UI_FPS_CAP,
  executionMode: "inline",
});

app = createNodeApp({
  initialState,
  routes,
  initialRoute: "bridge",
  config: {
    fpsCap: UI_FPS_CAP,
    executionMode: "inline",
  },
  theme: themeSpec(initialState.themeName).theme,
  ...(enableHsr
    ? {
        hotReload: {
          routesModule: new URL("./screens/index.ts", import.meta.url),
          moduleRoot: new URL("./", import.meta.url),
          resolveRoutes: (moduleNs: unknown) => {
            const createRoutes = (moduleNs as RoutesModule).createStarshipRoutes;
            if (typeof createRoutes !== "function") {
              throw new Error("HSR: ./screens/index.ts must export createStarshipRoutes(deps)");
            }
            return buildRoutes(createRoutes);
          },
        },
      }
    : {}),
});

bindKeys();
syncViewportFromStdout();

app.onEvent((event) => {
  if (event.kind === "fatal") {
    debugSnapshot("runtime.fatal", {
      route: currentRouteId(),
      viewportCols: lastViewport.cols,
      viewportRows: lastViewport.rows,
    });
    void stopApp(1);
    return;
  }

  if (event.kind === "engine" && event.event.kind === "resize") {
    debugSnapshot("runtime.resize.event", {
      cols: event.event.cols,
      rows: event.event.rows,
      route: currentRouteId(),
    });
    syncViewport(event.event.cols, event.event.rows);
  }
});

const onSignal = () => {
  void stopApp(0);
};

process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

tickTimer = setInterval(() => {
  syncViewportFromStdout();
  dispatch({ type: "tick", nowMs: Date.now() });
}, TICK_MS);

toastTimer = setInterval(() => {
  dispatch({ type: "prune-toasts", nowMs: Date.now() });
}, TOAST_PRUNE_MS);

debugSnapshot("runtime.app.start", {
  route: currentRouteId(),
  viewportCols: lastViewport.cols,
  viewportRows: lastViewport.rows,
});

await app.start();
await new Promise<void>(() => {});
