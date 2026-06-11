import assert from "node:assert/strict";
import test from "node:test";
import { ZrUiError } from "@rezi-ui/core";
import {
  INLINE_ROWS_MAX,
  NATIVE_SCREEN_MODE_ALT,
  NATIVE_SCREEN_MODE_INLINE,
  mergeScreenIntoNativeConfig,
  normalizeBackendNativeConfig,
} from "../backend/backendSharedConfig.js";
import { createNodeBackendInternal } from "../backend/nodeBackend.js";

function cfgKey(cfg: Readonly<Record<string, unknown>>, key: string): unknown {
  return cfg[key];
}

function platKey(cfg: Readonly<Record<string, unknown>>, key: string): unknown {
  const value = cfgKey(cfg, "plat");
  assert.ok(typeof value === "object" && value !== null);
  return (value as Record<string, unknown>)[key];
}

test("screen: omitted screen option leaves native config untouched", () => {
  const base = normalizeBackendNativeConfig({ plat: { enableMouse: false } });
  const merged = mergeScreenIntoNativeConfig(base, undefined);
  assert.equal(merged, base);
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "inlineRows"), false);
});

test("screen: inline mode maps to native wire keys", () => {
  const merged = mergeScreenIntoNativeConfig(normalizeBackendNativeConfig(undefined), {
    mode: "inline",
    inlineRows: 8,
  });
  assert.equal(platKey(merged, "screenMode"), NATIVE_SCREEN_MODE_INLINE);
  assert.equal(cfgKey(merged, "inlineRows"), 8);
});

test("screen: explicit alt mode maps to wire defaults", () => {
  const merged = mergeScreenIntoNativeConfig(normalizeBackendNativeConfig(undefined), {
    mode: "alt",
  });
  assert.equal(platKey(merged, "screenMode"), NATIVE_SCREEN_MODE_ALT);
  assert.equal(cfgKey(merged, "inlineRows"), 0);
});

test("screen: merge preserves unrelated plat keys and wins over passthrough", () => {
  const merged = mergeScreenIntoNativeConfig(
    normalizeBackendNativeConfig({
      plat: { enableMouse: false, screenMode: 0 },
      inlineRows: 999,
    }),
    { mode: "inline", inlineRows: 4 },
  );
  assert.equal(platKey(merged, "enableMouse"), false);
  assert.equal(platKey(merged, "screenMode"), NATIVE_SCREEN_MODE_INLINE);
  assert.equal(cfgKey(merged, "inlineRows"), 4);
});

test("screen: invalid configurations are rejected", () => {
  const base = normalizeBackendNativeConfig(undefined);
  const cases: ReadonlyArray<Readonly<{ mode?: string; inlineRows?: number }>> = [
    { mode: "inline" },
    { mode: "inline", inlineRows: 0 },
    { mode: "inline", inlineRows: 2.5 },
    { mode: "inline", inlineRows: INLINE_ROWS_MAX + 1 },
    { inlineRows: 4 },
    { mode: "alt", inlineRows: 4 },
    { mode: "fullscreen" },
  ];
  for (const screen of cases) {
    assert.throws(
      () =>
        mergeScreenIntoNativeConfig(
          base,
          screen as Parameters<typeof mergeScreenIntoNativeConfig>[1],
        ),
      (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
      `expected rejection for ${JSON.stringify(screen)}`,
    );
  }
});

test("screen: inline rows at bounds are accepted", () => {
  const base = normalizeBackendNativeConfig(undefined);
  for (const rows of [1, INLINE_ROWS_MAX]) {
    const merged = mergeScreenIntoNativeConfig(base, { mode: "inline", inlineRows: rows });
    assert.equal(cfgKey(merged, "inlineRows"), rows);
  }
});

test("backend: worker path forwards screen option to engineCreate", async () => {
  const shim = new URL("./worker/testShims/screenExpectNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: {
      executionMode: "worker",
      fpsCap: 60,
      maxEventBytes: 1024,
      screen: { mode: "inline", inlineRows: 6 },
    },
    nativeShimModule: shim,
  });

  await backend.start();
  await backend.stop();
  backend.dispose();
});

test("backend: inline execution path forwards screen option to engineCreate", async () => {
  const shim = new URL("./worker/testShims/screenExpectNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: {
      executionMode: "inline",
      fpsCap: 60,
      maxEventBytes: 1024,
      screen: { mode: "inline", inlineRows: 6 },
    },
    nativeShimModule: shim,
  });

  await backend.start();
  await backend.stop();
  backend.dispose();
});

test("backend: invalid screen config rejects at backend creation", () => {
  assert.throws(
    () =>
      createNodeBackendInternal({
        config: { screen: { mode: "inline" } },
      }),
    (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
  );
});
