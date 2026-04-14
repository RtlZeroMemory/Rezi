import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const CI_WORKFLOW_PATH = fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url));
const NIGHTLY_WORKFLOW_PATH = fileURLToPath(
  new URL("../../.github/workflows/nightly.yml", import.meta.url),
);
const RELEASE_WORKFLOW_PATH = fileURLToPath(
  new URL("../../.github/workflows/release.yml", import.meta.url),
);

function releaseCriticalSuitesBlock(workflow) {
  const startMarker = "  release-critical-suites:\n";
  const start = workflow.indexOf(startMarker);
  assert.notEqual(start, -1, "release-critical-suites job block should exist");

  const remaining = workflow.slice(start + startMarker.length);
  const nextJob = remaining.match(/^ {2}[a-z0-9-]+:\n/mu);
  const end =
    nextJob?.index === undefined ? workflow.length : start + startMarker.length + nextJob.index;

  return workflow.slice(start, end);
}

describe("testing workflow suite visibility", () => {
  test("ci surfaces the fast release-critical suites", () => {
    const workflow = releaseCriticalSuitesBlock(readFileSync(CI_WORKFLOW_PATH, "utf8"));

    assert.match(workflow, /^ {4}name: fast gate \/ release-critical suites$/mu);
    assert.match(workflow, /^ {6}- name: Write testing progress summary$/mu);
    assert.match(workflow, /^ {8}run: npm run test:progress >> "\$GITHUB_STEP_SUMMARY"$/mu);
    assert.match(workflow, /^ {6}- name: Run release-critical package suites$/mu);
    assert.match(workflow, /^ {8}run: npm run test:release-critical$/mu);
  });

  test("nightly workflow schedules the package and terminal slices", () => {
    const workflow = readFileSync(NIGHTLY_WORKFLOW_PATH, "utf8");
    const releaseCriticalWorkflow = releaseCriticalSuitesBlock(workflow);

    assert.match(workflow, /schedule:/);
    assert.match(releaseCriticalWorkflow, /^ {4}name: nightly gate \/ release-critical suites$/mu);
    assert.match(releaseCriticalWorkflow, /^ {8}run: npm run test:release-critical$/mu);
    assert.match(releaseCriticalWorkflow, /^ {8}run: npm run test:release-critical:terminal$/mu);
  });

  test("release workflow repeats the visible release-critical slices", () => {
    const workflow = releaseCriticalSuitesBlock(readFileSync(RELEASE_WORKFLOW_PATH, "utf8"));

    assert.match(workflow, /^ {4}name: release gate \/ release-critical suites$/mu);
    assert.match(workflow, /^ {8}run: npm run test:release-critical$/mu);
    assert.match(workflow, /^ {8}run: npm run test:release-critical:terminal$/mu);
  });
});
