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

describe("testing workflow suite visibility", () => {
  test("ci surfaces the fast release-critical suites", () => {
    const workflow = readFileSync(CI_WORKFLOW_PATH, "utf8");

    assert.match(workflow, /name:\s+fast gate \/ release-critical suites/);
    assert.match(workflow, /run:\s+npm run test:release-critical/);
    assert.match(workflow, /run:\s+npm run test:progress >> "\$GITHUB_STEP_SUMMARY"/);
  });

  test("nightly workflow schedules the package and terminal slices", () => {
    const workflow = readFileSync(NIGHTLY_WORKFLOW_PATH, "utf8");

    assert.match(workflow, /schedule:/);
    assert.match(workflow, /run:\s+npm run test:release-critical/);
    assert.match(workflow, /run:\s+npm run test:release-critical:terminal/);
  });

  test("release workflow repeats the visible release-critical slices", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");

    assert.match(workflow, /name:\s+release gate \/ release-critical suites/);
    assert.match(workflow, /run:\s+npm run test:release-critical/);
    assert.match(workflow, /run:\s+npm run test:release-critical:terminal/);
  });
});
