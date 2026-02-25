import assert from "node:assert/strict";
import test from "node:test";

import { parseColor } from "../../translation/colorMap.js";

test("parseColor maps named colors", () => {
  assert.deepEqual(parseColor("green"), { r: 0, g: 205, b: 0 });
  assert.deepEqual(parseColor("whiteBright"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("GRAY"), { r: 127, g: 127, b: 127 });
});

test("parseColor parses hex colors", () => {
  assert.deepEqual(parseColor("#00ff7f"), { r: 0, g: 255, b: 127 });
  assert.deepEqual(parseColor("#abc"), { r: 170, g: 187, b: 204 });
});

test("parseColor parses rgb() colors", () => {
  assert.deepEqual(parseColor("rgb(12, 34, 56)"), { r: 12, g: 34, b: 56 });
  assert.deepEqual(parseColor("rgb( 0 , 255 , 127 )"), { r: 0, g: 255, b: 127 });
});

test("parseColor returns undefined for invalid input", () => {
  assert.equal(parseColor(undefined), undefined);
  assert.equal(parseColor(""), undefined);
  assert.equal(parseColor("not-a-color"), undefined);
  assert.equal(parseColor("#12"), undefined);
  assert.equal(parseColor("#xyzxyz"), undefined);
  assert.equal(parseColor("rgb(999, 0, 0)"), undefined);
  assert.equal(parseColor("rgb(a, b, c)"), undefined);
});
