import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "@rezi-ui/core";
import { ZrUiError } from "@rezi-ui/core";
import { createNodeApp, createNodeBackend } from "../index.js";

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

test("config guard: app useV2Cursor=true requires backend drawlist version >= 2", () => {
  const backend = createNodeBackend({ drawlistVersion: 1 });
  try {
    assert.throws(
      () =>
        createApp({
          backend,
          initialState: { value: 0 },
          config: { useV2Cursor: true },
        }),
      (err) =>
        err instanceof ZrUiError &&
        err.code === "ZRUI_INVALID_PROPS" &&
        err.message.includes("config.useV2Cursor=true but backend.useDrawlistV2=false"),
    );
  } finally {
    backend.dispose();
  }
});

test("config guard: backend drawlist >=2 is allowed with app useV2Cursor=false", () => {
  const backend = createNodeBackend({ drawlistVersion: 5 });
  try {
    const app = createApp({
      backend,
      initialState: { value: 0 },
      config: { useV2Cursor: false },
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
      useV2Cursor: true,
      maxEventBytes: 4096,
      fpsCap: 60,
      executionMode: "inline",
    },
  });
  app.dispose();
});

test("createNodeApp exposes isNoColor=true when NO_COLOR is present", () => {
  withNoColor("1", () => {
    const app = createNodeApp({
      initialState: { value: 0 },
      theme: {
        colors: {
          primary: { r: 255, g: 0, b: 0 },
          secondary: { r: 0, g: 255, b: 0 },
          success: { r: 0, g: 0, b: 255 },
          danger: { r: 255, g: 0, b: 255 },
          warning: { r: 255, g: 255, b: 0 },
          info: { r: 0, g: 255, b: 255 },
          muted: { r: 120, g: 120, b: 120 },
          bg: { r: 10, g: 10, b: 10 },
          fg: { r: 240, g: 240, b: 240 },
          border: { r: 64, g: 64, b: 64 },
          "diagnostic.error": { r: 255, g: 90, b: 90 },
          "diagnostic.warning": { r: 255, g: 200, b: 90 },
          "diagnostic.info": { r: 90, g: 180, b: 255 },
          "diagnostic.hint": { r: 140, g: 255, b: 120 },
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
