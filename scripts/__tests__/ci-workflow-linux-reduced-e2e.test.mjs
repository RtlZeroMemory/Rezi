/**
 * Regression test: Linux CI must run reduced-profile e2e coverage.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const CI_WORKFLOW_PATH = fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url));

describe("ci workflow e2e coverage", () => {
  test("runs reduced-profile e2e on Linux", () => {
    const workflow = readFileSync(CI_WORKFLOW_PATH, "utf8");

    assert.match(workflow, /run:\s*npm run test:e2e:reduced/);
    assert.match(workflow, /if:\s*runner\.os == 'Linux'\s*\n\s*run:\s*npm run test:e2e:reduced/);
  });
});
