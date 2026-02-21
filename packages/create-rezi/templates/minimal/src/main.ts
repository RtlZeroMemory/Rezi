import { exit } from "node:process";
import { createNodeApp } from "@rezi-ui/node";
import { resolveMinimalCommand } from "./helpers/keybindings.js";
import { createInitialState, reduceMinimalState } from "./helpers/state.js";
import { renderMainScreen } from "./screens/main-screen.js";
import { themeSpec } from "./theme.js";
import type { MinimalAction, MinimalState } from "./types.js";

const initialState = createInitialState();
const enableHsr = process.argv.includes("--hsr") || process.env.REZI_HSR === "1";

type MainScreenRenderer = typeof renderMainScreen;
type MainScreenModule = Readonly<{
  renderMainScreen?: MainScreenRenderer;
}>;

const app = createNodeApp({
  initialState,
  config: { fpsCap: 30 },
  theme: themeSpec(initialState.themeName).theme,
  ...(enableHsr
    ? {
        hotReload: {
          viewModule: new URL("./screens/main-screen.ts", import.meta.url),
          moduleRoot: new URL("./", import.meta.url),
          resolveView: (moduleNs: unknown) => {
            const render = (moduleNs as MainScreenModule).renderMainScreen;
            if (typeof render !== "function") {
              throw new Error(
                "HSR: ./screens/main-screen.ts must export renderMainScreen(state, actions)",
              );
            }
            return buildMainView(render);
          },
        },
      }
    : {}),
});

function buildMainView(renderer: MainScreenRenderer) {
  return (state: MinimalState) =>
    renderer(state, {
      onIncrement: () => dispatch({ type: "increment" }),
      onDecrement: () => dispatch({ type: "decrement" }),
      onCycleTheme: () => dispatch({ type: "cycle-theme" }),
      onToggleHelp: () => dispatch({ type: "toggle-help" }),
      onClearError: () => dispatch({ type: "set-error", message: null }),
    });
}

function dispatch(action: MinimalAction): void {
  let nextThemeName = initialState.themeName;
  let themeChanged = false;

  app.update((previous) => {
    const next = reduceMinimalState(previous, action);
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

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;

  try {
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  app.dispose();
  exit(0);
}

function applyCommand(command: ReturnType<typeof resolveMinimalCommand>): void {
  if (!command) return;

  if (command === "quit") {
    void shutdown();
    return;
  }

  if (command === "toggle-help") {
    dispatch({ type: "toggle-help" });
    return;
  }

  if (command === "increment") {
    dispatch({ type: "increment" });
    return;
  }

  if (command === "decrement") {
    dispatch({ type: "decrement" });
    return;
  }

  if (command === "cycle-theme") {
    dispatch({ type: "cycle-theme" });
    return;
  }

  if (command === "raise-error") {
    dispatch({
      type: "set-error",
      message: "Example failure: could not refresh workspace index.",
    });
  }
}

app.view(buildMainView(renderMainScreen));

app.keys({
  q: () => applyCommand(resolveMinimalCommand("q")),
  "ctrl+c": () => applyCommand(resolveMinimalCommand("ctrl+c")),
  h: () => applyCommand(resolveMinimalCommand("h")),
  "shift+/": () => applyCommand(resolveMinimalCommand("shift+/")),
  "+": () => applyCommand(resolveMinimalCommand("+")),
  "shift+=": () => applyCommand(resolveMinimalCommand("shift+=")),
  "-": () => applyCommand(resolveMinimalCommand("-")),
  t: () => applyCommand(resolveMinimalCommand("t")),
  e: () => applyCommand(resolveMinimalCommand("e")),
  escape: () => {
    app.update((state) => (state.showHelp ? { ...state, showHelp: false } : state));
  },
});

const onSignal = () => {
  void shutdown();
};

process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

try {
  await app.start();
} finally {
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
}
