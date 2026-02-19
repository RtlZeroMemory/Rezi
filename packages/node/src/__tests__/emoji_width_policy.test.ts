import assert from "node:assert/strict";
import test from "node:test";
import { ZrUiError, getTextMeasureEmojiPolicy } from "@rezi-ui/core";
import {
  applyEmojiWidthPolicy,
  resolveBackendEmojiWidthPolicy,
} from "../backend/emojiWidthPolicy.js";

type EnvSnapshot = Readonly<{
  emojiWidthPolicy: string | undefined;
  emojiWidthProbe: string | undefined;
}>;

const ENV_EMOJI_WIDTH_POLICY = "ZRUI_EMOJI_WIDTH_POLICY" as const;
const ENV_EMOJI_WIDTH_PROBE = "ZRUI_EMOJI_WIDTH_PROBE" as const;

function snapshotEnv(): EnvSnapshot {
  return {
    emojiWidthPolicy: process.env[ENV_EMOJI_WIDTH_POLICY],
    emojiWidthProbe: process.env[ENV_EMOJI_WIDTH_PROBE],
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  if (snapshot.emojiWidthPolicy === undefined) delete process.env[ENV_EMOJI_WIDTH_POLICY];
  else process.env[ENV_EMOJI_WIDTH_POLICY] = snapshot.emojiWidthPolicy;

  if (snapshot.emojiWidthProbe === undefined) delete process.env[ENV_EMOJI_WIDTH_PROBE];
  else process.env[ENV_EMOJI_WIDTH_PROBE] = snapshot.emojiWidthProbe;
}

test("emoji width policy: requested explicit policy wins", async () => {
  const prev = snapshotEnv();
  try {
    process.env[ENV_EMOJI_WIDTH_POLICY] = "wide";
    process.env[ENV_EMOJI_WIDTH_PROBE] = "0";
    const resolved = await resolveBackendEmojiWidthPolicy("narrow", Object.freeze({}));
    assert.equal(resolved, "narrow");
  } finally {
    restoreEnv(prev);
  }
});

test("emoji width policy: native widthPolicy override applies for auto", async () => {
  const prev = snapshotEnv();
  try {
    process.env[ENV_EMOJI_WIDTH_POLICY] = "wide";
    process.env[ENV_EMOJI_WIDTH_PROBE] = "0";
    const resolved = await resolveBackendEmojiWidthPolicy(
      "auto",
      Object.freeze({ widthPolicy: 0 }),
    );
    assert.equal(resolved, "narrow");
  } finally {
    restoreEnv(prev);
  }
});

test("emoji width policy: env override applies when auto and no native override", async () => {
  const prev = snapshotEnv();
  try {
    process.env[ENV_EMOJI_WIDTH_POLICY] = "narrow";
    process.env[ENV_EMOJI_WIDTH_PROBE] = "0";
    const resolved = await resolveBackendEmojiWidthPolicy("auto", Object.freeze({}));
    assert.equal(resolved, "narrow");
  } finally {
    restoreEnv(prev);
  }
});

test("emoji width policy: falls back to wide when probe is not explicitly enabled", async () => {
  const prev = snapshotEnv();
  try {
    delete process.env[ENV_EMOJI_WIDTH_POLICY];
    delete process.env[ENV_EMOJI_WIDTH_PROBE];
    const resolved = await resolveBackendEmojiWidthPolicy("auto", Object.freeze({}));
    assert.equal(resolved, "wide");
  } finally {
    restoreEnv(prev);
  }
});

test("emoji width policy: rejects explicit/native mismatch", async () => {
  await assert.rejects(
    () =>
      resolveBackendEmojiWidthPolicy(
        "wide",
        Object.freeze({ width_policy: 0 }),
      ) as Promise<unknown>,
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("emojiWidthPolicy=wide"),
  );
});

test("emoji width policy: rejects mixed native width keys with different values", async () => {
  await assert.rejects(
    () =>
      resolveBackendEmojiWidthPolicy(
        "auto",
        Object.freeze({ widthPolicy: 1, width_policy: 0 }),
      ) as Promise<unknown>,
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("nativeConfig.widthPolicy=1"),
  );
});

test("emoji width policy: rejects invalid native widthPolicy values", async () => {
  await assert.rejects(
    () =>
      resolveBackendEmojiWidthPolicy("auto", Object.freeze({ widthPolicy: 2 })) as Promise<unknown>,
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_INVALID_PROPS" &&
      err.message.includes("must be 0 (narrow) or 1 (wide)"),
  );
});

test("emoji width policy: apply updates core measure policy", () => {
  const before = getTextMeasureEmojiPolicy();
  try {
    const nativeNarrow = applyEmojiWidthPolicy("narrow");
    assert.equal(nativeNarrow, 0);
    assert.equal(getTextMeasureEmojiPolicy(), "narrow");

    const nativeWide = applyEmojiWidthPolicy("wide");
    assert.equal(nativeWide, 1);
    assert.equal(getTextMeasureEmojiPolicy(), "wide");
  } finally {
    applyEmojiWidthPolicy(before);
  }
});
