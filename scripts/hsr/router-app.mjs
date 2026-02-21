import { createNodeApp } from "@rezi-ui/node";
import { createRouterDemoRoutes } from "./router-routes.mjs";

const initialState = Object.freeze({
  count: 0,
  name: "Alice",
  notes: "Focus this input, edit routes, then keep typing.",
});

const enableHsr = !process.argv.includes("--no-hsr");
let stopping = false;

function updateState(updater) {
  app.update(updater);
}

function navigate(routeId) {
  const router = app.router;
  if (!router) return;
  if (router.currentRoute().id === routeId) return;
  router.navigate(routeId);
}

function buildRoutes(factory) {
  return factory({
    onIncrement: () => {
      updateState((prev) => ({ ...prev, count: prev.count + 1 }));
    },
    onDecrement: () => {
      updateState((prev) => ({ ...prev, count: prev.count - 1 }));
    },
    onNavigate: navigate,
    onNameInput: (value) => {
      updateState((prev) => ({ ...prev, name: value }));
    },
    onNotesInput: (value) => {
      updateState((prev) => ({ ...prev, notes: value }));
    },
  });
}

const app = createNodeApp({
  initialState,
  routes: buildRoutes(createRouterDemoRoutes),
  initialRoute: "home",
  config: { fpsCap: 30 },
  ...(enableHsr
    ? {
        hotReload: {
          routesModule: new URL("./router-routes.mjs", import.meta.url),
          moduleRoot: new URL("./", import.meta.url),
          resolveRoutes: (moduleNs) => {
            const createRoutes = moduleNs.createRouterDemoRoutes;
            if (typeof createRoutes !== "function") {
              throw new Error("Expected createRouterDemoRoutes export from router-routes.mjs");
            }
            return buildRoutes(createRoutes);
          },
          onError: (error, context) => {
            const detail =
              error instanceof Error ? `${error.name}: ${error.message}` : String(error);
            console.error(
              `[HSR router demo:onError] phase=${context.phase} path=${context.changedPath ?? "-"} ${detail}`,
            );
          },
          log: (event) => {
            const prefix = `[HSR router demo:${event.level}]`;
            if (event.level === "error") {
              console.error(prefix, event.message, event.changedPath ?? "");
            } else {
              console.log(prefix, event.message, event.changedPath ?? "");
            }
          },
        },
      }
    : {}),
});

app.keys({
  "ctrl+q": () => {
    void shutdown();
  },
  "ctrl+c": () => {
    void shutdown();
  },
});

async function shutdown() {
  if (stopping) return;
  stopping = true;

  try {
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  app.dispose();
}

console.log("[HSR router demo] Press Ctrl+Q (or Ctrl+C) to quit.");
console.log("[HSR router demo] Edit scripts/hsr/router-routes.mjs and save to hot-reload routes.");

try {
  await app.run();
} finally {
  // app.run() signal/quit lifecycle owns stop/dispose.
}
