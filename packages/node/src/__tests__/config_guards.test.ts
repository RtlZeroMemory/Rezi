import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "@rezi-ui/core";
import { ZrUiError } from "@rezi-ui/core";
import { createNodeApp, createNodeBackend } from "../index.js";

test("config guard: app useV2Cursor=true requires backend drawlist v2", () => {
  const backend = createNodeBackend({ useDrawlistV2: false });
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

test("config guard: backend drawlist v2 requires app useV2Cursor=true", () => {
  const backend = createNodeBackend({ useDrawlistV2: true });
  try {
    assert.throws(
      () =>
        createApp({
          backend,
          initialState: { value: 0 },
          config: { useV2Cursor: false },
        }),
      (err) =>
        err instanceof ZrUiError &&
        err.code === "ZRUI_INVALID_PROPS" &&
        err.message.includes("config.useV2Cursor=false but backend.useDrawlistV2=true"),
    );
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
