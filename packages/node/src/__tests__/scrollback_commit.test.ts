import assert from "node:assert/strict";
import test from "node:test";
import { ZrUiError } from "@rezi-ui/core";
import { createNodeBackendInternal } from "../backend/nodeBackend.js";

const SHIM = new URL("./worker/testShims/commitNative.js", import.meta.url).href;

/* Minimal valid ZRDL v1 drawlist: header + one CLEAR command. */
function makeClearDrawlist(): Uint8Array {
  const dl = new Uint8Array(72);
  const v = new DataView(dl.buffer);
  v.setUint32(0, 0x4c44525a, true); /* 'ZRDL' */
  v.setUint32(4, 1, true); /* version */
  v.setUint32(8, 64, true); /* header size */
  v.setUint32(12, 72, true); /* total size */
  v.setUint32(16, 64, true); /* cmd offset */
  v.setUint32(20, 8, true); /* cmd bytes */
  v.setUint32(24, 1, true); /* cmd count */
  v.setUint16(64, 1, true); /* CLEAR opcode */
  v.setUint32(68, 8, true); /* cmd size */
  return dl;
}

function inlineConfig(executionMode: "worker" | "inline") {
  return {
    executionMode,
    fpsCap: 60,
    maxEventBytes: 1024,
    screen: { mode: "inline", inlineRows: 6 },
  } as const;
}

for (const executionMode of ["worker", "inline"] as const) {
  test(`scrollback: ${executionMode} path commits drawlist bytes`, async () => {
    const backend = createNodeBackendInternal({
      config: inlineConfig(executionMode),
      nativeShimModule: SHIM,
    });
    await backend.start();
    try {
      assert.ok(backend.commitScrollback !== undefined);
      await backend.commitScrollback(makeClearDrawlist(), 2);
    } finally {
      await backend.stop();
      backend.dispose();
    }
  });

  test(`scrollback: ${executionMode} path surfaces engine rejection`, async () => {
    const backend = createNodeBackendInternal({
      config: inlineConfig(executionMode),
      nativeShimModule: SHIM,
    });
    await backend.start();
    try {
      await assert.rejects(
        backend.commitScrollback?.(makeClearDrawlist(), 99) ?? Promise.reject(new Error("missing")),
        (err: unknown) =>
          err instanceof ZrUiError &&
          err.code === "ZRUI_BACKEND_ERROR" &&
          err.message.includes("engine_commit_scrollback failed"),
      );
    } finally {
      await backend.stop();
      backend.dispose();
    }
  });

  test(`scrollback: ${executionMode} path accepts runtime inline rows`, async () => {
    const backend = createNodeBackendInternal({
      config: inlineConfig(executionMode),
      nativeShimModule: SHIM,
    });
    await backend.start();
    try {
      assert.ok(backend.setInlineRows !== undefined);
      /* The strict shim only accepts inlineRows=5 with plat.screenMode=1, so a
         resolving call proves the runtime payload reached the engine intact. */
      await backend.setInlineRows(5);
      await backend.commitScrollback?.(makeClearDrawlist(), 1);
    } finally {
      await backend.stop();
      backend.dispose();
    }
  });

  test(`scrollback: ${executionMode} path validates inline rows client-side`, async () => {
    const backend = createNodeBackendInternal({
      config: inlineConfig(executionMode),
      nativeShimModule: SHIM,
    });
    await backend.start();
    try {
      await assert.rejects(
        backend.setInlineRows?.(0) ?? Promise.reject(new Error("missing")),
        (err: unknown) => err instanceof ZrUiError && err.code === "ZRUI_INVALID_PROPS",
      );
    } finally {
      await backend.stop();
      backend.dispose();
    }
  });
}

test("scrollback: alt-mode backend rejects commit and rows APIs", async () => {
  const backend = createNodeBackendInternal({
    config: { executionMode: "inline", fpsCap: 60, maxEventBytes: 1024 },
    nativeShimModule: SHIM,
  });
  await backend.start();
  try {
    await assert.rejects(
      backend.commitScrollback?.(makeClearDrawlist(), 1) ?? Promise.reject(new Error("missing")),
      (err: unknown) =>
        err instanceof ZrUiError && err.message.includes('requires screen.mode "inline"'),
    );
    await assert.rejects(
      backend.setInlineRows?.(5) ?? Promise.reject(new Error("missing")),
      (err: unknown) =>
        err instanceof ZrUiError && err.message.includes('requires screen.mode "inline"'),
    );
  } finally {
    await backend.stop();
    backend.dispose();
  }
});
