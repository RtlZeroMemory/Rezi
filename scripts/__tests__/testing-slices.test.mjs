import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const scriptPath = fileURLToPath(new URL("../testing-slices.mjs", import.meta.url));

test("testing slices summary stays aligned with repo suites and scenarios", () => {
  const output = execFileSync(process.execPath, [scriptPath, "summary", "--json"], {
    cwd: root,
    encoding: "utf8",
  });

  const summary = JSON.parse(output);

  assert.equal(summary.metrics.releaseCriticalSuiteCount, 8);
  assert.equal(summary.metrics.releaseCriticalPackageSuiteCount, 7);
  assert.equal(summary.metrics.releaseCriticalTerminalSuiteCount, 1);
  assert.equal(summary.metrics.referenceScenarioCount, 7);
  assert.equal(summary.metrics.terminalRealReferenceScenarioCount, 5);
  assert.equal(summary.metrics.ptyReferenceScenarioCount, 5);
  assert.equal(summary.metrics.failureFallbackReferenceScenarioCount, 4);
  assert.deepEqual(summary.groups["release-critical-packages"], [
    "input-editing-and-focus",
    "table-visible-behavior",
    "virtual-list-range-and-navigation",
    "command-palette-behavior",
    "file-navigation-behavior",
    "modal-focus-behavior",
    "code-editor-behavior",
  ]);
  assert.deepEqual(summary.groups["release-critical-terminal"], ["terminal-runtime-behavior"]);
});

test("testing slices rejects unexpected CLI arguments", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [scriptPath, "summary", "--bogus"], {
        cwd: root,
        encoding: "utf8",
      }),
    /testing-slices: unexpected extra argument: --bogus/u,
  );

  assert.throws(
    () =>
      execFileSync(process.execPath, [scriptPath, "run", "release-critical-packages", "--bogus"], {
        cwd: root,
        encoding: "utf8",
      }),
    /testing-slices: unexpected extra argument: --bogus/u,
  );
});
