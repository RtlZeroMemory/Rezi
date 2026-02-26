import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKEND_DRAWLIST_VERSION_MARKER, createApp, rgb, ui } from "@rezi-ui/core";
import { ZrUiError } from "@rezi-ui/core";
import { createNodeApp, createNodeBackend } from "../index.js";

async function withTempDir<T>(run: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "rezi-nodeapp-hsr-test-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeHotReloadViewModule(root: string): string {
  mkdirSync(root, { recursive: true });
  const file = join(root, "view.mjs");
  writeFileSync(
    file,
    [
      "export function view(state) {",
      '  return { kind: "text", text: `count=${String(state.value)}`, props: {} };',
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  return file;
}

function writeHotReloadRoutesModule(root: string): string {
  mkdirSync(root, { recursive: true });
  const file = join(root, "routes.mjs");
  writeFileSync(
    file,
    [
      "export const routes = Object.freeze([",
      "  {",
      '    id: "home",',
      '    screen: () => ({ kind: "text", text: "home", props: {} }),',
      "  },",
      "]);",
      "",
    ].join("\n"),
    "utf8",
  );
  return file;
}

function withNoColor(value: string | undefined, fn: () => void): void {
  const env = process.env as NodeJS.ProcessEnv & { NO_COLOR?: string };
  const had = Object.prototype.hasOwnProperty.call(env, "NO_COLOR");
  const prev = env.NO_COLOR;
  try {
    if (value === undefined) {
      Reflect.deleteProperty(env, "NO_COLOR");
    } else {
      env.NO_COLOR = value;
    }
    fn();
  } finally {
    if (had) {
      if (prev === undefined) {
        Reflect.deleteProperty(env, "NO_COLOR");
      } else {
        env.NO_COLOR = prev;
      }
    } else {
      Reflect.deleteProperty(env, "NO_COLOR");
    }
  }
}

test("config guard: backend drawlist marker is fixed to current protocol", () => {
  const backend = createNodeBackend();
  try {
    assert.equal(
      (backend as unknown as Record<string, unknown>)[BACKEND_DRAWLIST_VERSION_MARKER],
      1,
    );
    const app = createApp({
      backend,
      initialState: { value: 0 },
    });
    app.dispose();
  } finally {
    backend.dispose();
  }
});

test("config guard: maxEventBytes must match between app and backend", () => {
  const backend = createNodeBackend({ maxEventBytes: 4096 });
  try {
    assert.throws(
      () =>
        createApp({
          backend,
          initialState: { value: 0 },
          config: { maxEventBytes: 8192 },
        }),
      (err) =>
        err instanceof ZrUiError &&
        err.code === "ZRUI_INVALID_PROPS" &&
        err.message.includes("config.maxEventBytes=8192 must match backend maxEventBytes=4096"),
    );
  } finally {
    backend.dispose();
  }
});

test("config guard: fpsCap must match between app and backend", () => {
  const backend = createNodeBackend({ fpsCap: 90 });
  try {
    assert.throws(
      () =>
        createApp({
          backend,
          initialState: { value: 0 },
          config: { fpsCap: 60 },
        }),
      (err) =>
        err instanceof ZrUiError &&
        err.code === "ZRUI_INVALID_PROPS" &&
        err.message.includes("config.fpsCap=60 must match backend fpsCap=90"),
    );
  } finally {
    backend.dispose();
  }
});

test("config guard: fpsCap is canonical over nativeConfig target fps (worker path)", () => {
  assert.throws(
    () =>
      createNodeBackend({
        fpsCap: 60,
        nativeConfig: { targetFps: 120 },
      }),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("fpsCap=60 must match nativeConfig.targetFps/target_fps=120"),
  );
});

test("config guard: fpsCap is canonical over nativeConfig target fps (inline path)", () => {
  assert.throws(
    () =>
      createNodeBackend({
        executionMode: "inline",
        fpsCap: 30,
        nativeConfig: { target_fps: 60 },
      }),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("fpsCap=30 must match nativeConfig.targetFps/target_fps=60"),
  );
});

test("config guard: matching fpsCap/native target fps is accepted", () => {
  const backend = createNodeBackend({
    fpsCap: 75,
    nativeConfig: { target_fps: 75 },
  });
  backend.dispose();
});

test("createNodeApp constructs a compatible app/backend pair", () => {
  const app = createNodeApp({
    initialState: { value: 0 },
    config: {
      maxEventBytes: 4096,
      fpsCap: 60,
      executionMode: "inline",
    },
  });
  app.dispose();
});

test("createNodeApp forwards routes and initialRoute to createApp", () => {
  const app = createNodeApp({
    initialState: { value: 0 },
    routes: Object.freeze([
      {
        id: "home",
        screen: () => ui.text("home"),
      },
    ]),
    initialRoute: "home",
  });
  assert.ok(app.router);
  app.dispose();
});

test("createNodeApp exposes hotReload=null when not configured", () => {
  const app = createNodeApp({
    initialState: { value: 0 },
  });
  assert.equal(app.hotReload, null);
  assert.ok(app.backend);
  assert.equal(typeof app.backend.getCaps, "function");
  app.dispose();
});

test("createNodeApp hotReload view mode exposes controller", async () => {
  await withTempDir(async (dir) => {
    const viewModule = writeHotReloadViewModule(dir);
    const app = createNodeApp({
      initialState: { value: 0 },
      hotReload: {
        viewModule,
        moduleRoot: dir,
      },
    });

    try {
      assert.ok(app.hotReload);
      assert.equal(app.hotReload?.isRunning(), false);
      assert.equal(await app.hotReload?.reloadNow(), false);
    } finally {
      app.dispose();
    }
  });
});

test("createNodeApp hotReload routes mode exposes controller", async () => {
  await withTempDir(async (dir) => {
    const routesModule = writeHotReloadRoutesModule(dir);
    const app = createNodeApp({
      initialState: { value: 0 },
      hotReload: {
        routesModule,
        moduleRoot: dir,
      },
    });

    try {
      assert.ok(app.hotReload);
      assert.equal(app.hotReload?.isRunning(), false);
      assert.equal(await app.hotReload?.reloadNow(), false);
    } finally {
      app.dispose();
    }
  });
});

test("createNodeApp hotReload validates view module path is inside moduleRoot", async () => {
  await withTempDir(async (dir) => {
    const insideRoot = join(dir, "inside");
    const outsideRoot = join(dir, "outside");
    writeHotReloadViewModule(insideRoot);
    const outsideView = writeHotReloadViewModule(outsideRoot);

    assert.throws(
      () =>
        createNodeApp({
          initialState: { value: 0 },
          hotReload: {
            viewModule: outsideView,
            moduleRoot: insideRoot,
          },
        }),
      /viewModule must be inside moduleRoot/,
    );
  });
});

test("createNodeApp exposes isNoColor=true when NO_COLOR is present", () => {
  withNoColor("1", () => {
    const app = createNodeApp({
      initialState: { value: 0 },
      theme: {
        colors: {
          primary: rgb(255, 0, 0),
          secondary: rgb(0, 255, 0),
          success: rgb(0, 0, 255),
          danger: rgb(255, 0, 255),
          warning: rgb(255, 255, 0),
          info: rgb(0, 255, 255),
          muted: rgb(120, 120, 120),
          bg: rgb(10, 10, 10),
          fg: rgb(240, 240, 240),
          border: rgb(64, 64, 64),
          "diagnostic.error": rgb(255, 90, 90),
          "diagnostic.warning": rgb(255, 200, 90),
          "diagnostic.info": rgb(90, 180, 255),
          "diagnostic.hint": rgb(140, 255, 120),
        },
        spacing: [0, 1, 2, 4, 8, 16],
      },
    });
    assert.equal(app.isNoColor, true);
    app.dispose();
  });
});

test("createNodeApp exposes isNoColor=false when NO_COLOR is absent", () => {
  withNoColor(undefined, () => {
    const app = createNodeApp({
      initialState: { value: 0 },
    });
    assert.equal(app.isNoColor, false);
    app.dispose();
  });
});

test("config guard: createNodeBackend rejects fpsCap above safe bound", () => {
  assert.throws(
    () => createNodeBackend({ fpsCap: 1001 }),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("fpsCap must be <= 1000"),
  );
});

test("config guard: createNodeBackend rejects maxEventBytes above safe bound", () => {
  assert.throws(
    () => createNodeBackend({ maxEventBytes: (4 << 20) + 1 }),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("maxEventBytes must be <= 4194304"),
  );
});

test("config guard: createNodeApp rejects fpsCap above safe bound", () => {
  assert.throws(
    () =>
      createNodeApp({
        initialState: { value: 0 },
        config: { fpsCap: 1001 },
      }),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("fpsCap must be <= 1000"),
  );
});

test("config guard: createNodeApp rejects maxEventBytes above safe bound", () => {
  assert.throws(
    () =>
      createNodeApp({
        initialState: { value: 0 },
        config: { maxEventBytes: (4 << 20) + 1 },
      }),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("maxEventBytes must be <= 4194304"),
  );
});
