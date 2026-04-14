import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createReferenceInputIncompleteEscapeFixture,
  createReferenceInputIncompletePasteFixture,
  createReferenceInputModalFixture,
  createReferenceSelectKeyboardCyclerFixture,
  referenceInputIncompleteEscapeScenario,
  referenceInputIncompletePasteScenario,
  referenceInputModalScenario,
  referenceInputMouseCapabilityFallbackScenario,
  referenceSelectKeyboardCyclerScenario,
  referenceVirtualListResizeStormScenario,
  runSemanticScenario,
} from "@rezi-ui/core/testing";
import { runPtyScenario } from "../testing/index.js";

const isBunRuntime = "Bun" in globalThis;
// GitHub's macOS runners currently fail PTY child spawn with posix_spawnp.
const env = process.env as NodeJS.ProcessEnv & Readonly<{ CI?: string }>;
const isMacOsCi = process.platform === "darwin" && env.CI === "true";
const nativePackageDir = fileURLToPath(new URL("../../../native/", import.meta.url));
const hasHostNativeAddon = readdirSync(nativePackageDir).some((entry) => entry.endsWith(".node"));

function mismatchDetail(result: { mismatches: readonly unknown[] }): string {
  return JSON.stringify(result.mismatches, null, 2);
}

if (process.platform === "win32") {
  test.skip("reference scenario passes in semantic and PTY modes", () => {});
} else if (isMacOsCi) {
  test.skip("reference scenario passes in semantic and PTY modes", () => {});
} else if (isBunRuntime) {
  test.skip("reference scenario passes in semantic and PTY modes", () => {});
} else if (!hasHostNativeAddon) {
  test.skip("PTY scenarios stay aligned with semantic contracts and fallback behavior", () => {});
} else {
  test(
    "PTY scenarios stay aligned with semantic contracts and fallback behavior",
    { timeout: 40_000 },
    async () => {
      const semantic = await runSemanticScenario({
        scenario: referenceInputModalScenario,
        createFixture: createReferenceInputModalFixture,
      });
      assert.equal(semantic.pass, true, mismatchDetail(semantic));

      const selectSemantic = await runSemanticScenario({
        scenario: referenceSelectKeyboardCyclerScenario,
        createFixture: createReferenceSelectKeyboardCyclerFixture,
      });
      assert.equal(selectSemantic.pass, true, mismatchDetail(selectSemantic));

      const incompleteEscapeSemantic = await runSemanticScenario({
        scenario: referenceInputIncompleteEscapeScenario,
        createFixture: createReferenceInputIncompleteEscapeFixture,
      });
      assert.equal(incompleteEscapeSemantic.pass, false);
      assert.equal(
        incompleteEscapeSemantic.mismatches.some((item) => item.code === "ZR_SCENARIO_UNSUPPORTED"),
        true,
      );

      const incompletePasteSemantic = await runSemanticScenario({
        scenario: referenceInputIncompletePasteScenario,
        createFixture: createReferenceInputIncompletePasteFixture,
      });
      assert.equal(incompletePasteSemantic.pass, false);
      assert.equal(
        incompletePasteSemantic.mismatches.some((item) => item.code === "ZR_SCENARIO_UNSUPPORTED"),
        true,
      );

      const targetPath = fileURLToPath(
        new URL("./fixtures/referenceScenarioTarget.js", import.meta.url),
      );
      const command = process.platform === "win32" ? process.execPath : "/usr/bin/env";
      const args = process.platform === "win32" ? [targetPath] : ["node", targetPath];

      const scenarios = [
        referenceInputModalScenario,
        referenceInputIncompletePasteScenario,
        referenceInputMouseCapabilityFallbackScenario,
        referenceInputIncompleteEscapeScenario,
        referenceVirtualListResizeStormScenario,
      ] as const;

      for (const scenario of scenarios) {
        const pty = await runPtyScenario({
          scenario,
          target: {
            cwd: process.cwd(),
            command,
            args,
          },
        });
        assert.equal(pty.pass, true, `${scenario.id}: ${mismatchDetail(pty)}`);
      }
    },
  );
}
