/**
 * Tests for bench-ci-compare.mjs
 */

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { compareBenchRuns, normalizeComparatorConfig } from "../bench-ci-compare.mjs";

function makeConfig(overrides = []) {
  return normalizeComparatorConfig({
    requiredScenarios: [
      {
        scenario: "terminal-rerender",
        framework: "rezi-native",
        params: {},
      },
      {
        scenario: "terminal-frame-fill",
        framework: "rezi-native",
        params: { rows: 40, cols: 120, dirtyLines: 1 },
      },
      {
        scenario: "terminal-frame-fill",
        framework: "rezi-native",
        params: { rows: 40, cols: 120, dirtyLines: 40 },
      },
    ],
    metrics: {
      defaults: {
        "timing.mean": {
          relativeRegression: 0.05,
          absoluteRegression: 0.02,
          severity: "hard",
          direction: "higher_is_worse",
        },
        "timing.p95": {
          relativeRegression: 0.1,
          absoluteRegression: 0.05,
          severity: "advisory",
          direction: "higher_is_worse",
        },
      },
      overrides,
    },
  });
}

function makeRun(meanByKey, p95ByKey) {
  const results = [];
  for (const key of Object.keys(meanByKey)) {
    const [scenario, paramsJson] = key.split("|");
    const params = JSON.parse(paramsJson);
    results.push({
      scenario,
      framework: "rezi-native",
      params,
      metrics: {
        timing: {
          mean: meanByKey[key],
          p95: p95ByKey[key],
        },
      },
    });
  }
  return { results };
}

const KEY_RERENDER = "terminal-rerender|{}";
const KEY_FILL_1 = 'terminal-frame-fill|{"cols":120,"dirtyLines":1,"rows":40}';
const KEY_FILL_40 = 'terminal-frame-fill|{"cols":120,"dirtyLines":40,"rows":40}';

describe("bench-ci-compare", () => {
  test("fails on hard mean regression", () => {
    const config = makeConfig();
    const baseline = makeRun(
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
      {
        [KEY_RERENDER]: 1.2,
        [KEY_FILL_1]: 1.2,
        [KEY_FILL_40]: 1.2,
      },
    );
    const current = makeRun(
      {
        [KEY_RERENDER]: 1.25,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
      {
        [KEY_RERENDER]: 1.2,
        [KEY_FILL_1]: 1.2,
        [KEY_FILL_40]: 1.2,
      },
    );

    const report = compareBenchRuns(baseline, current, config);
    assert.equal(report.summary.hardRegressions, 1);
    assert.equal(report.summary.exitCode, 1);
  });

  test("advisory p95 regression does not fail exit code", () => {
    const config = makeConfig();
    const baseline = makeRun(
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
    );
    const current = makeRun(
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
      {
        [KEY_RERENDER]: 1.2,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
    );

    const report = compareBenchRuns(baseline, current, config);
    assert.equal(report.summary.hardRegressions, 0);
    assert.equal(report.summary.advisoryRegressions, 1);
    assert.equal(report.summary.exitCode, 0);
  });

  test("supports per-scenario metric overrides", () => {
    const config = makeConfig([
      {
        match: {
          scenario: "terminal-frame-fill",
          framework: "rezi-native",
          params: { rows: 40, cols: 120, dirtyLines: 40 },
          metric: "timing.mean",
        },
        rule: {
          relativeRegression: 0.3,
          absoluteRegression: 0.2,
        },
      },
    ]);

    const baseline = makeRun(
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
    );
    const current = makeRun(
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1.25,
      },
      {
        [KEY_RERENDER]: 1,
        [KEY_FILL_1]: 1,
        [KEY_FILL_40]: 1,
      },
    );

    const report = compareBenchRuns(baseline, current, config);
    assert.equal(report.summary.hardRegressions, 0);
    assert.equal(report.summary.exitCode, 0);
  });

  test("requires both terminal-frame-fill variants in config", () => {
    assert.throws(
      () =>
        normalizeComparatorConfig({
          requiredScenarios: [
            {
              scenario: "terminal-rerender",
              framework: "rezi-native",
              params: {},
            },
            {
              scenario: "terminal-frame-fill",
              framework: "rezi-native",
              params: { rows: 40, cols: 120, dirtyLines: 1 },
            },
          ],
          metrics: {
            defaults: {
              "timing.mean": {
                relativeRegression: 0.1,
                absoluteRegression: 0.1,
              },
            },
          },
        }),
      /requiredScenarios must explicitly include terminal-frame-fill variants/,
    );
  });
});
