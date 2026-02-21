import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RouteDefinition, ViewFn } from "@rezi-ui/core";
import { type HotStateReloadErrorContext, createHotStateReload } from "../dev/hotStateReload.js";

type State = Readonly<{ count: number }>;

async function withTempDir<T>(run: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "rezi-hsr-test-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function listHsrSessionDirs(): readonly string[] {
  return readdirSync(tmpdir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("rezi-hsr-"))
    .map((entry) => entry.name)
    .sort();
}

function writeViewModule(root: string): string {
  mkdirSync(root, { recursive: true });
  const viewFile = join(root, "view.mjs");
  writeFileSync(
    viewFile,
    [
      'import { widgetLabel } from "./widget.mjs";',
      "export function view(state) {",
      '  return { kind: "text", text: `${widgetLabel()}:${String(state.count)}`, props: {} };',
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  return viewFile;
}

function writeViewModuleWithBareImport(root: string): string {
  mkdirSync(root, { recursive: true });
  const viewFile = join(root, "view-bare.mjs");
  writeFileSync(
    viewFile,
    [
      'import { packageLabel } from "@demo/hsr-pkg";',
      'import { widgetLabel } from "./widget.mjs";',
      "export function view(state) {",
      '  return { kind: "text", text: `${packageLabel()}:${widgetLabel()}:${String(state.count)}`, props: {} };',
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  return viewFile;
}

function writeWidgetModule(root: string, label: string): void {
  mkdirSync(root, { recursive: true });
  const widgetFile = join(root, "widget.mjs");
  writeFileSync(
    widgetFile,
    [`export function widgetLabel() { return ${JSON.stringify(label)}; }`, ""].join("\n"),
    "utf8",
  );
}

function writeBarePackageModule(workspaceRoot: string, label: string): void {
  const packageDir = join(workspaceRoot, "node_modules", "@demo", "hsr-pkg");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: "@demo/hsr-pkg",
        type: "module",
        exports: "./index.js",
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    join(packageDir, "index.js"),
    [`export function packageLabel() { return ${JSON.stringify(label)}; }`, ""].join("\n"),
    "utf8",
  );
}

function writeRouteLabelModule(root: string, label: string): void {
  mkdirSync(root, { recursive: true });
  const routeLabelFile = join(root, "route-label.mjs");
  writeFileSync(
    routeLabelFile,
    [`export function routeLabel() { return ${JSON.stringify(label)}; }`, ""].join("\n"),
    "utf8",
  );
}

function writeRoutesModule(root: string): string {
  mkdirSync(root, { recursive: true });
  const routesFile = join(root, "routes.mjs");
  writeFileSync(
    routesFile,
    [
      'import { routeLabel } from "./route-label.mjs";',
      "export const routes = Object.freeze([",
      "  {",
      '    id: "home",',
      '    screen: () => ({ kind: "text", text: routeLabel(), props: {} }),',
      "  },",
      "]);",
      "",
    ].join("\n"),
    "utf8",
  );
  return routesFile;
}

function writeRoutesDefaultModule(root: string): string {
  mkdirSync(root, { recursive: true });
  const routesFile = join(root, "routes-default.mjs");
  writeFileSync(
    routesFile,
    [
      'import { routeLabel } from "./route-label.mjs";',
      "export default Object.freeze([",
      "  {",
      '    id: "home",',
      '    screen: () => ({ kind: "text", text: routeLabel(), props: {} }),',
      "  },",
      "]);",
      "",
    ].join("\n"),
    "utf8",
  );
  return routesFile;
}

function writeInvalidRoutesModule(root: string): string {
  mkdirSync(root, { recursive: true });
  const routesFile = join(root, "routes-invalid.mjs");
  writeFileSync(routesFile, ['export const routes = "not-an-array";', ""].join("\n"), "utf8");
  return routesFile;
}

function readRenderedText(viewFn: ViewFn<State>): string {
  const vnode = viewFn({ count: 7 });
  if (vnode.kind !== "text") {
    throw new Error(`expected text vnode, got ${String(vnode.kind)}`);
  }
  return vnode.text;
}

function readRouteLabel(routes: readonly RouteDefinition<State>[]): string {
  const first = routes[0];
  if (!first) {
    throw new Error("expected at least one route");
  }
  const vnode = first.screen(Object.freeze({}), {} as never);
  if (vnode.kind !== "text") {
    throw new Error(`expected text vnode route screen, got ${String(vnode.kind)}`);
  }
  return vnode.text;
}

async function waitFor(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("timed out waiting for condition");
}

test("createHotStateReload reloadNow refreshes transitive imports and swaps view", async () => {
  await withTempDir(async (dir) => {
    writeWidgetModule(dir, "v1");
    const viewModule = writeViewModule(dir);

    const swappedViews: ViewFn<State>[] = [];
    const controller = createHotStateReload<State>({
      app: {
        replaceView: (nextView) => {
          swappedViews.push(nextView);
        },
      },
      viewModule,
      moduleRoot: dir,
      debounceMs: 25,
    });

    try {
      await controller.start();
      assert.equal(controller.isRunning(), true);

      const firstReload = await controller.reloadNow();
      assert.equal(firstReload, true);
      assert.equal(swappedViews.length, 1);
      const firstView = swappedViews[0];
      if (!firstView) throw new Error("expected first view after initial reload");
      assert.equal(readRenderedText(firstView), "v1:7");

      writeWidgetModule(dir, "v2");
      const secondReload = await controller.reloadNow();
      assert.equal(secondReload, true);
      assert.equal(swappedViews.length, 2);
      const secondView = swappedViews[1];
      if (!secondView) throw new Error("expected second view after reload");
      assert.equal(readRenderedText(secondView), "v2:7");
    } finally {
      await controller.stop();
      assert.equal(controller.isRunning(), false);
    }
  });
});

test("createHotStateReload resolves bare package imports from nearest node_modules", async () => {
  await withTempDir(async (workspaceRoot) => {
    const src = join(workspaceRoot, "src");
    writeBarePackageModule(workspaceRoot, "pkg");
    writeWidgetModule(src, "local-v1");
    const viewModule = writeViewModuleWithBareImport(src);

    const swappedViews: ViewFn<State>[] = [];
    const controller = createHotStateReload<State>({
      app: {
        replaceView: (nextView) => {
          swappedViews.push(nextView);
        },
      },
      viewModule,
      moduleRoot: src,
      debounceMs: 25,
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedViews.length, 1);
      const firstView = swappedViews[0];
      if (!firstView) throw new Error("expected view from bare-import reload");
      assert.equal(readRenderedText(firstView), "pkg:local-v1:7");

      writeWidgetModule(src, "local-v2");
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedViews.length, 2);
      const secondView = swappedViews[1];
      if (!secondView) throw new Error("expected second view from bare-import reload");
      assert.equal(readRenderedText(secondView), "pkg:local-v2:7");
    } finally {
      await controller.stop();
      assert.equal(controller.isRunning(), false);
    }
  });
});

test("createHotStateReload keeps previous view when reload fails", async () => {
  await withTempDir(async (dir) => {
    writeWidgetModule(dir, "stable");
    const viewModule = writeViewModule(dir);

    const swappedViews: ViewFn<State>[] = [];
    const errors: HotStateReloadErrorContext[] = [];

    const controller = createHotStateReload<State>({
      app: {
        replaceView: (nextView) => {
          swappedViews.push(nextView);
        },
      },
      viewModule,
      moduleRoot: dir,
      debounceMs: 25,
      onError: (_error, context) => {
        errors.push(context);
      },
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedViews.length, 1);
      const firstView = swappedViews[0];
      if (!firstView) throw new Error("expected first view after stable reload");
      assert.equal(readRenderedText(firstView), "stable:7");

      writeFileSync(
        join(dir, "widget.mjs"),
        'export function widgetLabel() { return "broken"\n',
        "utf8",
      );
      assert.equal(await controller.reloadNow(), false);
      assert.equal(swappedViews.length, 1);
      assert.equal(
        errors.some((entry) => entry.phase === "reload"),
        true,
      );

      writeWidgetModule(dir, "recovered");
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedViews.length, 2);
      const secondView = swappedViews[1];
      if (!secondView) throw new Error("expected recovered view");
      assert.equal(readRenderedText(secondView), "recovered:7");
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload watch mode applies latest saved view module", async () => {
  await withTempDir(async (dir) => {
    writeWidgetModule(dir, "watch-v1");
    const viewModule = writeViewModule(dir);

    const swappedViews: ViewFn<State>[] = [];
    const controller = createHotStateReload<State>({
      app: {
        replaceView: (nextView) => {
          swappedViews.push(nextView);
        },
      },
      viewModule,
      moduleRoot: dir,
      debounceMs: 80,
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedViews.length, 1);

      writeWidgetModule(dir, "watch-v2");
      writeWidgetModule(dir, "watch-v3");

      await waitFor(() => swappedViews.length >= 2);
      const latest = swappedViews[swappedViews.length - 1];
      if (!latest) throw new Error("expected watched reload result");
      assert.equal(readRenderedText(latest), "watch-v3:7");
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload reloadNow returns false when watcher is not started", async () => {
  await withTempDir(async (dir) => {
    writeWidgetModule(dir, "v1");
    const viewModule = writeViewModule(dir);

    const controller = createHotStateReload<State>({
      app: {
        replaceView: () => {},
      },
      viewModule,
      moduleRoot: dir,
    });

    try {
      assert.equal(controller.isRunning(), false);
      assert.equal(await controller.reloadNow(), false);
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload stop before start does not leak temp session directories", async () => {
  await withTempDir(async (dir) => {
    writeWidgetModule(dir, "v1");
    const viewModule = writeViewModule(dir);
    const before = new Set(listHsrSessionDirs());
    const controller = createHotStateReload<State>({
      app: {
        replaceView: () => {},
      },
      viewModule,
      moduleRoot: dir,
    });

    await controller.stop();

    const after = listHsrSessionDirs();
    const leaked = after.filter((name) => !before.has(name));
    assert.deepEqual(leaked, []);
  });
});

test("createHotStateReload validates viewModule is inside moduleRoot", async () => {
  await withTempDir(async (dir) => {
    const outsideRoot = join(dir, "outside");
    const insideRoot = join(dir, "inside");
    writeWidgetModule(outsideRoot, "oops");
    const viewModule = writeViewModule(outsideRoot);
    writeWidgetModule(insideRoot, "ok");

    assert.throws(
      () =>
        createHotStateReload<State>({
          app: { replaceView: () => {} },
          viewModule,
          moduleRoot: insideRoot,
        }),
      /viewModule must be inside moduleRoot/,
    );
  });
});

test("createHotStateReload validates routesModule is inside moduleRoot", async () => {
  await withTempDir(async (dir) => {
    const outsideRoot = join(dir, "outside");
    const insideRoot = join(dir, "inside");
    writeRouteLabelModule(outsideRoot, "oops");
    const routesModule = writeRoutesModule(outsideRoot);
    writeRouteLabelModule(insideRoot, "ok");

    assert.throws(
      () =>
        createHotStateReload<State>({
          app: { replaceRoutes: () => {} },
          routesModule,
          moduleRoot: insideRoot,
        }),
      /routesModule must be inside moduleRoot/,
    );
  });
});

test("createHotStateReload reloadNow refreshes transitive imports and swaps routes", async () => {
  await withTempDir(async (dir) => {
    writeRouteLabelModule(dir, "route-v1");
    const routesModule = writeRoutesModule(dir);

    const swappedRoutes: Array<readonly RouteDefinition<State>[]> = [];
    const controller = createHotStateReload<State>({
      app: {
        replaceRoutes: (nextRoutes) => {
          swappedRoutes.push(nextRoutes);
        },
      },
      routesModule,
      moduleRoot: dir,
      debounceMs: 25,
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 1);
      const firstRoutes = swappedRoutes[0];
      if (!firstRoutes) throw new Error("expected routes after initial reload");
      assert.equal(readRouteLabel(firstRoutes), "route-v1");

      writeRouteLabelModule(dir, "route-v2");
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 2);
      const secondRoutes = swappedRoutes[1];
      if (!secondRoutes) throw new Error("expected routes after second reload");
      assert.equal(readRouteLabel(secondRoutes), "route-v2");
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload keeps previous routes when route reload fails", async () => {
  await withTempDir(async (dir) => {
    writeRouteLabelModule(dir, "stable-routes");
    const routesModule = writeRoutesModule(dir);

    const swappedRoutes: Array<readonly RouteDefinition<State>[]> = [];
    const errors: HotStateReloadErrorContext[] = [];
    const controller = createHotStateReload<State>({
      app: {
        replaceRoutes: (nextRoutes) => {
          swappedRoutes.push(nextRoutes);
        },
      },
      routesModule,
      moduleRoot: dir,
      debounceMs: 25,
      onError: (_error, context) => {
        errors.push(context);
      },
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 1);
      const firstRoutes = swappedRoutes[0];
      if (!firstRoutes) throw new Error("expected routes after stable reload");
      assert.equal(readRouteLabel(firstRoutes), "stable-routes");

      writeFileSync(
        join(dir, "route-label.mjs"),
        'export function routeLabel() { return "broken"\\n',
        "utf8",
      );
      assert.equal(await controller.reloadNow(), false);
      assert.equal(swappedRoutes.length, 1);
      assert.equal(
        errors.some((entry) => entry.phase === "reload"),
        true,
      );

      writeRouteLabelModule(dir, "recovered-routes");
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 2);
      const secondRoutes = swappedRoutes[1];
      if (!secondRoutes) throw new Error("expected routes after recovery");
      assert.equal(readRouteLabel(secondRoutes), "recovered-routes");
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload routes mode supports default export resolver", async () => {
  await withTempDir(async (dir) => {
    writeRouteLabelModule(dir, "default-routes");
    const routesModule = writeRoutesDefaultModule(dir);
    const swappedRoutes: Array<readonly RouteDefinition<State>[]> = [];

    const controller = createHotStateReload<State>({
      app: {
        replaceRoutes: (nextRoutes) => {
          swappedRoutes.push(nextRoutes);
        },
      },
      routesModule,
      moduleRoot: dir,
      debounceMs: 25,
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 1);
      const first = swappedRoutes[0];
      if (!first) throw new Error("expected routes from default export");
      assert.equal(readRouteLabel(first), "default-routes");
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload routes mode reports invalid exports and keeps previous routes", async () => {
  await withTempDir(async (dir) => {
    writeRouteLabelModule(dir, "stable");
    const stableModule = writeRoutesModule(dir);
    const invalidModule = writeInvalidRoutesModule(dir);
    const swappedRoutes: Array<readonly RouteDefinition<State>[]> = [];
    const contexts: HotStateReloadErrorContext[] = [];
    const logs: string[] = [];

    const controller = createHotStateReload<State>({
      app: {
        replaceRoutes: (nextRoutes) => {
          swappedRoutes.push(nextRoutes);
        },
      },
      routesModule: stableModule,
      moduleRoot: dir,
      debounceMs: 25,
      onError: (_error, context) => {
        contexts.push(context);
      },
      log: (event) => {
        logs.push(event.message);
      },
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 1);

      const badController = createHotStateReload<State>({
        app: {
          replaceRoutes: (nextRoutes) => {
            swappedRoutes.push(nextRoutes);
          },
        },
        routesModule: invalidModule,
        moduleRoot: dir,
        debounceMs: 25,
        onError: (_error, context) => {
          contexts.push(context);
        },
        log: (event) => {
          logs.push(event.message);
        },
      });
      try {
        await badController.start();
        assert.equal(await badController.reloadNow(), false);
      } finally {
        await badController.stop();
      }

      assert.equal(swappedRoutes.length, 1);
      assert.equal(
        contexts.some((context) => context.phase === "reload"),
        true,
      );
      assert.equal(
        logs.some((message) => message.includes("keeping previous routes")),
        true,
      );
    } finally {
      await controller.stop();
    }
  });
});

test("createHotStateReload watch mode applies latest saved routes module", async () => {
  await withTempDir(async (dir) => {
    writeRouteLabelModule(dir, "watch-routes-v1");
    const routesModule = writeRoutesModule(dir);

    const swappedRoutes: Array<readonly RouteDefinition<State>[]> = [];
    const controller = createHotStateReload<State>({
      app: {
        replaceRoutes: (nextRoutes) => {
          swappedRoutes.push(nextRoutes);
        },
      },
      routesModule,
      moduleRoot: dir,
      debounceMs: 80,
    });

    try {
      await controller.start();
      assert.equal(await controller.reloadNow(), true);
      assert.equal(swappedRoutes.length, 1);

      writeRouteLabelModule(dir, "watch-routes-v2");
      writeRouteLabelModule(dir, "watch-routes-v3");

      await waitFor(() => swappedRoutes.length >= 2);
      const latest = swappedRoutes[swappedRoutes.length - 1];
      if (!latest) throw new Error("expected watched routes reload result");
      assert.equal(readRouteLabel(latest), "watch-routes-v3");
    } finally {
      await controller.stop();
    }
  });
});
