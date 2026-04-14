import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createReferenceInputModalFixture,
  referenceInputModalScenario,
  runSemanticScenario,
} from "@rezi-ui/core/testing";
import { runPtyScenario } from "../testing/index.js";

const PTY_TEST_OPTIONS =
  process.platform === "win32"
    ? { skip: "PTY scenario tests are skipped on Windows in this MVP" }
    : {};

function mismatchDetail(result: { mismatches: readonly unknown[] }): string {
  return JSON.stringify(result.mismatches, null, 2);
}

test("reference scenario passes in semantic and PTY modes", PTY_TEST_OPTIONS, async () => {
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
