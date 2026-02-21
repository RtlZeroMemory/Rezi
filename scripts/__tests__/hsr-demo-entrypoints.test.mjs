import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";

const ROOT = resolve(process.cwd(), "scripts/hsr");
const SCRIPTS_ROOT = resolve(process.cwd(), "scripts");

function readDemoSource(name) {
  return readFileSync(resolve(ROOT, name), "utf8");
}

function readScriptSource(name) {
  return readFileSync(resolve(SCRIPTS_ROOT, name), "utf8");
}

describe("HSR demo entrypoints", () => {
  test("widget demo keeps HSR watcher alive by awaiting app.run()", () => {
    const source = readDemoSource("widget-app.mjs");
    assert.match(source, /await app\.run\(\);/);
    assert.doesNotMatch(source, /await app\.start\(\);/);
  });

  test("router demo keeps HSR watcher alive by awaiting app.run()", () => {
    const source = readDemoSource("router-app.mjs");
    assert.match(source, /await app\.run\(\);/);
    assert.doesNotMatch(source, /await app\.start\(\);/);
  });

  test("widget demo includes explicit editor-focus escape bindings", () => {
    const source = readDemoSource("widget-app.mjs");
    assert.match(source, /"ctrl\+g"/);
    assert.match(source, /\bf8:/);
    assert.match(source, /ctx\.focusedId === CODE_EDITOR_ID/);
    assert.match(source, /requestFocusOn\(SAVE_VIEW_FILE_ID\)/);
  });

  test("GIF recorder defaults to manual capture with scripted opt-in", () => {
    const source = readScriptSource("record-hsr-gif.mjs");
    assert.match(source, /const scripted = hasFlag\("--scripted"\);/);
    assert.match(source, /const useScripted = scripted;/);
    assert.match(source, /const sceneText = readArg\("--scene-text", ""\);/);
    assert.match(source, /const manual = hasFlag\("--manual"\);/);
    assert.match(source, /--manual and --scripted cannot be used together/);
    assert.match(source, /--scene-text/);
    assert.match(source, /Scripted mode: auto-applies 3 timed HSR scene edits/);
    assert.match(source, /Manual mode: edit scripts\/hsr\//);
  });
});
