import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createReferenceInputModalFixture,
  referenceInputModalScenario,
  runSemanticScenario,
} from "@rezi-ui/core/testing";
import { runPtyScenario } from "../testing/index.js";

const isBunRuntime = "Bun" in globalThis;

function mismatchDetail(result: { mismatches: readonly unknown[] }): string {
  return JSON.stringify(result.mismatches, null, 2);
}

if (process.platform === "win32") {
  test.skip("reference scenario passes in semantic and PTY modes", () => {});
} else if (isBunRuntime) {
  test.skip("reference scenario passes in semantic and PTY modes", () => {});
} else {
  test("reference scenario passes in semantic and PTY modes", { timeout: 20_000 }, async () => {
    const semantic = await runSemanticScenario({
      scenario: referenceInputModalScenario,
      createFixture: createReferenceInputModalFixture,
    });
    assert.equal(semantic.pass, true, mismatchDetail(semantic));

    const targetPath = fileURLToPath(
      new URL("./fixtures/referenceScenarioTarget.js", import.meta.url),
    );
    const pty = await runPtyScenario({
      scenario: referenceInputModalScenario,
      target: {
        cwd: process.cwd(),
        command: process.execPath,
        args: [targetPath],
      },
    });

    assert.equal(pty.pass, true, mismatchDetail(pty));
  });
}
