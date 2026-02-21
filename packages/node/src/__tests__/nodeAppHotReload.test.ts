import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RouteDefinition, ViewFn } from "@rezi-ui/core";
import type { HotStateReloadController } from "../dev/hotStateReload.js";
import {
  attachNodeAppHotReloadLifecycle,
  createNodeAppHotReloadController,
} from "../dev/nodeAppHotReload.js";

type FakeLifecycleApp = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  dispose: () => void;
};

type FakeControllerOptions = Readonly<{
  running?: boolean;
  startError?: Error;
  stopError?: Error;
}>;

type State = Readonly<{ value: number }>;

async function withTempDir<T>(run: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "rezi-node-hsr-lifecycle-test-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeViewModule(root: string, label: string): string {
  mkdirSync(root, { recursive: true });
  const file = join(root, "view.mjs");
  writeFileSync(
    file,
    [
      `export function view(state) { return { kind: "text", text: ${JSON.stringify(label)} + ":" + String(state.value), props: {} }; }`,
      "",
    ].join("\n"),
    "utf8",
  );
  return file;
}

function writeRoutesModule(root: string, label: string): string {
  mkdirSync(root, { recursive: true });
  const file = join(root, "routes.mjs");
  writeFileSync(
    file,
    [
      "export const routes = Object.freeze([",
      "  {",
      '    id: "home",',
      `    screen: () => ({ kind: "text", text: ${JSON.stringify(label)}, props: {} }),`,
      "  },",
      "]);",
      "",
    ].join("\n"),
    "utf8",
  );
  return file;
}

function createFakeLifecycleApp(
  calls: string[],
  opts: Readonly<{ startError?: Error; stopError?: Error; disposeError?: Error }> = {},
): FakeLifecycleApp {
  return {
    start: async () => {
      calls.push("app.start");
      if (opts.startError) throw opts.startError;
    },
    stop: async () => {
      calls.push("app.stop");
      if (opts.stopError) throw opts.stopError;
    },
    dispose: () => {
      calls.push("app.dispose");
      if (opts.disposeError) throw opts.disposeError;
    },
  };
}

function createFakeController(
  calls: string[],
  opts: FakeControllerOptions = {},
): HotStateReloadController {
  let running = opts.running === true;
  return {
    start: async () => {
      calls.push("hsr.start");
      if (opts.startError) throw opts.startError;
      running = true;
    },
    reloadNow: async () => false,
    stop: async () => {
      calls.push("hsr.stop");
      if (opts.stopError) throw opts.stopError;
      running = false;
    },
    isRunning: () => running,
  };
}

test("attachNodeAppHotReloadLifecycle starts/stops HSR with app lifecycle", async () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls);
  const controller = createFakeController(calls);
  attachNodeAppHotReloadLifecycle(app, controller);

  await app.start();
  assert.deepEqual(calls, ["hsr.start", "app.start"]);

  calls.length = 0;
  await app.stop();
  assert.deepEqual(calls, ["app.stop", "hsr.stop"]);
});

test("attachNodeAppHotReloadLifecycle start failure stops HSR started in wrapper", async () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls, { startError: new Error("app start failed") });
  const controller = createFakeController(calls);
  attachNodeAppHotReloadLifecycle(app, controller);

  await assert.rejects(() => app.start(), /app start failed/);
  assert.deepEqual(calls, ["hsr.start", "app.start", "hsr.stop"]);
  assert.equal(controller.isRunning(), false);
});

test("attachNodeAppHotReloadLifecycle does not re-start already-running HSR", async () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls);
  const controller = createFakeController(calls, { running: true });
  attachNodeAppHotReloadLifecycle(app, controller);

  await app.start();
  assert.deepEqual(calls, ["app.start"]);
});

test("attachNodeAppHotReloadLifecycle stop still stops HSR when app.stop fails", async () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls, { stopError: new Error("app stop failed") });
  const controller = createFakeController(calls, { running: true });
  attachNodeAppHotReloadLifecycle(app, controller);

  await assert.rejects(() => app.stop(), /app stop failed/);
  assert.deepEqual(calls, ["app.stop", "hsr.stop"]);
  assert.equal(controller.isRunning(), false);
});

test("attachNodeAppHotReloadLifecycle stop propagates HSR stop error", async () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls);
  const controller = createFakeController(calls, {
    running: true,
    stopError: new Error("hsr stop failed"),
  });
  attachNodeAppHotReloadLifecycle(app, controller);

  await assert.rejects(() => app.stop(), /hsr stop failed/);
  assert.deepEqual(calls, ["app.stop", "hsr.stop"]);
  assert.equal(controller.isRunning(), true);
});

test("attachNodeAppHotReloadLifecycle dispose attempts best-effort HSR stop", () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls);
  const controller = createFakeController(calls, { running: true });
  attachNodeAppHotReloadLifecycle(app, controller);

  app.dispose();
  assert.deepEqual(calls, ["hsr.stop", "app.dispose"]);
});

test("attachNodeAppHotReloadLifecycle dispose does not stop HSR when already stopped", () => {
  const calls: string[] = [];
  const app = createFakeLifecycleApp(calls);
  const controller = createFakeController(calls, { running: false });
  attachNodeAppHotReloadLifecycle(app, controller);

  app.dispose();
  assert.deepEqual(calls, ["app.dispose"]);
});

test("createNodeAppHotReloadController wires widget-view mode", async () => {
  await withTempDir(async (dir) => {
    const viewModule = writeViewModule(dir, "view-v1");
    const swappedViews: ViewFn<State>[] = [];
    const controller = createNodeAppHotReloadController<State>(
      {
        replaceView: (nextView: ViewFn<State>) => {
          swappedViews.push(nextView);
        },
        replaceRoutes: () => {},
      },
      {
        viewModule,
        moduleRoot: dir,
      },
    );

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      const swappedView = swappedViews[0];
      if (!swappedView) throw new Error("expected swapped view function");
      const vnode = swappedView({ value: 7 });
      assert.equal(vnode.kind, "text");
      assert.equal(vnode.text, "view-v1:7");
    } finally {
      await controller.stop();
    }
  });
});

test("createNodeAppHotReloadController wires route-table mode", async () => {
  await withTempDir(async (dir) => {
    const routesModule = writeRoutesModule(dir, "route-v1");
    const swappedRouteSets: Array<readonly RouteDefinition<State>[]> = [];
    const controller = createNodeAppHotReloadController<State>(
      {
        replaceView: () => {},
        replaceRoutes: (nextRoutes: readonly RouteDefinition<State>[]) => {
          swappedRouteSets.push(nextRoutes);
        },
      },
      {
        routesModule,
        moduleRoot: dir,
      },
    );

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      const swappedRoutes = swappedRouteSets[0];
      if (!swappedRoutes || swappedRoutes.length === 0) {
        throw new Error("expected swapped routes");
      }
      const firstRoute = swappedRoutes[0];
      if (!firstRoute) throw new Error("expected first route after hot reload");
      const vnode = firstRoute.screen(Object.freeze({}), {} as never);
      assert.equal(vnode.kind, "text");
      assert.equal(vnode.text, "route-v1");
    } finally {
      await controller.stop();
    }
  });
});
