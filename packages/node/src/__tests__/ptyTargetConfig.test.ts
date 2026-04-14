import assert from "node:assert/strict";
import test from "node:test";
import type { ScenarioCapabilityProfile } from "@rezi-ui/core/testing";
import {
  buildPtyTargetEnv,
  parsePtyTargetNativeConfig,
  parsePtyTargetScenarioId,
  resolvePtyCapabilityProfile,
} from "../testing/index.js";

const fullProfile: ScenarioCapabilityProfile = Object.freeze({
  supportsMouse: true,
  supportsBracketedPaste: true,
  supportsFocusEvents: true,
  supportsOsc52: true,
  colorMode: "truecolor",
});

test("resolvePtyCapabilityProfile applies named reductions without widening other fields", () => {
  const profile = resolvePtyCapabilityProfile(fullProfile, "keyboard-only");
  assert.deepEqual(profile, {
    ...fullProfile,
    supportsMouse: false,
  });
});

test("buildPtyTargetEnv encodes scenario id, native capability gates, and TERM overrides", () => {
  const env = buildPtyTargetEnv({
    scenarioId: "input-incomplete-paste-recovers",
    capabilityProfile: Object.freeze({
      supportsMouse: false,
      supportsBracketedPaste: true,
      supportsFocusEvents: false,
      supportsOsc52: false,
      colorMode: "16",
    }),
    env: Object.freeze({ EXTRA_FLAG: "1" }),
  });

  assert.equal(env["REZI_SCENARIO_ID"], "input-incomplete-paste-recovers");
  assert.equal(env["TERM"], "xterm");
  assert.equal(env["COLORTERM"], undefined);
  assert.equal(env["EXTRA_FLAG"], "1");
  assert.equal(env["ZIREAEL_CAP_MOUSE"], "0");
  assert.equal(env["ZIREAEL_CAP_BRACKETED_PASTE"], "1");
  assert.equal(env["ZIREAEL_CAP_FOCUS_EVENTS"], "0");
  assert.equal(env["ZIREAEL_CAP_OSC52"], "0");

  const nativeConfig = parsePtyTargetNativeConfig(env);
  assert.deepEqual(nativeConfig, {
    plat: {
      enableMouse: false,
      enableBracketedPaste: true,
      enableFocusEvents: false,
      enableOsc52: false,
    },
  });
  assert.equal(parsePtyTargetScenarioId(env), "input-incomplete-paste-recovers");
});
