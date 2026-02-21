import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  applyRouterHeroPrefix,
  getRecordSceneValues,
  parsePositiveInt,
  readArg,
} from "../hsr/record-runner.mjs";

describe("hsr record runner helpers", () => {
  test("readArg returns fallback when arg is missing or malformed", () => {
    assert.equal(readArg(["node", "runner.mjs"], "--mode", "widget"), "widget");
    assert.equal(readArg(["node", "runner.mjs", "--mode"], "--mode", "widget"), "widget");
    assert.equal(
      readArg(["node", "runner.mjs", "--mode", "--cast-only"], "--mode", "widget"),
      "widget",
    );
  });

  test("parsePositiveInt enforces positive integer values", () => {
    assert.equal(parsePositiveInt("1200", "--startup-delay-ms"), 1200);
    assert.throws(() => parsePositiveInt("0", "--scene-delay-ms"), /positive integer/);
    assert.throws(() => parsePositiveInt("1.5", "--scene-delay-ms"), /positive integer/);
    assert.throws(() => parsePositiveInt("abc", "--scene-delay-ms"), /positive integer/);
  });

  test("getRecordSceneValues returns deterministic three-scene sequences", () => {
    const widget = getRecordSceneValues("widget");
    const router = getRecordSceneValues("router");

    assert.equal(widget.length, 3);
    assert.equal(router.length, 3);
    assert.deepEqual([...widget], ["Live Update One", "Live Update Two", "Live Update Three"]);
    assert.deepEqual(
      [...router],
      ["Router Update One", "Router Update Two", "Router Update Three"],
    );
  });

  test("getRecordSceneValues supports custom scene text with deterministic variants", () => {
    const custom = getRecordSceneValues("widget", "Hot girls in your area are waiting!");
    assert.deepEqual(
      [...custom],
      [
        "Hot girls in your area are waiting!",
        "Hot girls in your area are waiting! [2]",
        "Hot girls in your area are waiting! [3]",
      ],
    );
  });

  test("applyRouterHeroPrefix rewrites both hero-title prefixes", () => {
    const source = [
      '{ text: "Router HSR ", style: { fg: palette.accent, bold: true } },',
      "const spacer = 1;",
      '{ text: "Router HSR ", style: { fg: palette.accent, bold: true } },',
    ].join("\n");

    const result = applyRouterHeroPrefix(source, "Router Demo");
    assert.equal(result.changed, true);
    assert.equal(result.replacedCount, 2);
    assert.match(result.nextSource, /"Router Demo "/);
    assert.doesNotMatch(result.nextSource, /"Router HSR "/);
  });

  test("applyRouterHeroPrefix rejects missing markers", () => {
    assert.throws(
      () => applyRouterHeroPrefix('const nope = "x";', "Router Demo"),
      /Router hero title tokens not found/,
    );
  });
});
